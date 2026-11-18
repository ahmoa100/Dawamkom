"""Read-back audit of live migration; optionally retire the temporary IAM key."""
import argparse
import boto3
import importlib.util
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--disable-migration-key', action='store_true')
args = parser.parse_args()
session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
private = Path.home() / '.dawamkom-migration'
spec = importlib.util.spec_from_file_location('copy_tool', Path.home() / 'dawamkom-copy-state.py')
copy_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy_tool)
temporary = json.loads((private / 'operator.json').read_text())
runtime = json.loads((private / 'runtime.json').read_text())
assert temporary['AccessKeyId'] != runtime['AccessKeyId']
operator_user = boto3.Session(region_name='us-east-1', aws_access_key_id=temporary['AccessKeyId'],
                               aws_secret_access_key=temporary['SecretAccessKey'])
operator = copy_tool.assumed(operator_user, 'arn:aws:iam::905106554499:role/DawamkomMigrationOperator')
source = copy_tool.assumed(operator, 'arn:aws:iam::840448280787:role/DawamkomMigrationReadOnly')
s3 = session.client('s3')
bucket = 'dawamkom-private-state-905106554499'
load = lambda key: json.loads(s3.get_object(Bucket=bucket, Key=key)['Body'].read())
final_copy = load('migration/final-copy-receipt.json')
manifests = s3.list_objects_v2(Bucket=bucket, Prefix='migration/manifests/')['Contents']
manifest = load(max(manifests, key=lambda x:x['LastModified'])['Key'])
source_versions = set()
for page in source.client('s3').get_paginator('list_object_versions').paginate(Bucket=copy_tool.SOURCE_BUCKET):
    assert not page.get('DeleteMarkers')
    source_versions.update((x['Key'], x['VersionId']) for x in page.get('Versions', []))
assert source_versions == {(x['sourceKey'], x['sourceVersion']) for x in manifest['objects']}
assert manifest['capturedStateVersion'] == final_copy['sourceVersion']
assert source.client('s3').head_object(Bucket=copy_tool.SOURCE_BUCKET, Key=copy_tool.STATE_KEY)['VersionId'] == final_copy['sourceVersion']
target_head = s3.head_object(Bucket=bucket, Key=copy_tool.STATE_KEY)
assert target_head['VersionId'] != final_copy['destinationVersion'], 'Verify a real production persistence write first'
snapshot = load(copy_tool.STATE_KEY)
owner = next(p for p in snapshot['partners'] if p['id'] == '7387c1fa-9b73-4e33-b39e-135b0ee306de')
assert len(snapshot['partners']) == 6 and len(owner['workspace']['staff']) >= 38
assert s3.get_bucket_versioning(Bucket=bucket)['Status'] == 'Enabled'
assert all(s3.get_public_access_block(Bucket=bucket)['PublicAccessBlockConfiguration'].values())
target = session.client('lightsail').get_container_services(serviceName='dawamkom-production')['containerServices'][0]
assert target['state'] == 'RUNNING' and target['currentDeployment']['state'] == 'ACTIVE'
environment = target['currentDeployment']['containers']['web']['environment']
assert environment['DAWAMAK_RUNTIME_MODE'] == 'live'
assert environment['DAWAMAK_PUBLIC_ORIGIN'] == 'https://www.dawamkom.net'
assert environment['DAWAMAK_STORAGE_BUCKET'] == bucket and environment['DAWAMAK_STORAGE_KEY'] == copy_tool.STATE_KEY
assert environment['AWS_ACCESS_KEY_ID'] == runtime['AccessKeyId'] and environment['AWS_SECRET_ACCESS_KEY'] == runtime['SecretAccessKey']
assert environment['DAWAMAK_SES_FROM'] == 'noreply@dawamkom.net'
old = source.client('lightsail').get_container_services(serviceName='dawamak-test')['containerServices'][0]
assert old['state'] == 'RUNNING' and old['currentDeployment']['containers']['web']['image'].startswith(':dawamak-test.dns-bridge.')
assert not old['currentDeployment']['containers']['web'].get('environment')
health = urllib.request.urlopen(target['url'] + 'health')
assert health.status == 200 and health.headers['X-Dawamkom-Mode'] == 'live'
with urllib.request.urlopen('https://www.dawamkom.net/api/version') as response:
    assert response.status == 200 and response.headers['X-Dawamkom-Mode'] == 'live'
    public_version = json.load(response)['version']
with urllib.request.urlopen(target['url'] + 'api/version') as response:
    assert json.load(response)['version'] == public_version
ses = session.client('sesv2')
identity = ses.get_email_identity(EmailIdentity='dawamkom.net')
result = {'completedAt': datetime.now(timezone.utc).isoformat(), 'account': '905106554499',
    'region': 'us-east-1', 'site': 'https://www.dawamkom.net', 'release': public_version,
    'service': 'dawamkom-production', 'deployment': target['currentDeployment']['version'],
    'mode': 'live', 'bucket': bucket, 'companies': len(snapshot['partners']),
    'ownerStaff': len(owner['workspace']['staff']), 'archivedVersions': len(source_versions),
    'sourceBackupRetained': True, 'sourceBridgeDeployment': old['currentDeployment']['version'],
    'sourceVersionFrozen': final_copy['sourceVersion'], 'productionPersistenceVerified': True,
    'emailDomainVerified': identity['VerifiedForSendingStatus'],
    'emailProductionEnabled': ses.get_account()['ProductionAccessEnabled']}
copy_tool.verified_put(s3, 'migration/completion-receipt.json', json.dumps(result).encode(), {})
if args.disable_migration_key:
    session.client('iam').update_access_key(UserName='dawamkom-migration-temporary',
        AccessKeyId=temporary['AccessKeyId'], Status='Inactive')
    result['temporaryMigrationKeyDisabled'] = True
    copy_tool.verified_put(s3, 'migration/completion-receipt.json', json.dumps(result).encode(), {})
print(json.dumps(result))
