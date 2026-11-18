"""Stage fresh production state ONLY after source is confirmed DISABLED.

Never enables production or changes DNS. Refuses if destination is already live.
Run in destination CloudShell with the approved operator receipt available.
"""
import boto3
import hashlib
import importlib.util
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
private = Path.home() / '.dawamkom-migration'
spec = importlib.util.spec_from_file_location('copy_tool', Path.home() / 'dawamkom-copy-state.py')
copy_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy_tool)
credentials = json.loads((private / 'operator.json').read_text())
temporary = boto3.Session(region_name='us-east-1', aws_access_key_id=credentials['AccessKeyId'],
                           aws_secret_access_key=credentials['SecretAccessKey'])
operator = copy_tool.assumed(temporary, 'arn:aws:iam::905106554499:role/DawamkomMigrationOperator')
source = copy_tool.assumed(operator, 'arn:aws:iam::840448280787:role/DawamkomMigrationReadOnly')
source_service = source.client('lightsail').get_container_services(serviceName='dawamak-test')['containerServices'][0]
source_container = source_service['currentDeployment']['containers']['web']
source_is_proxy = (source_service['state'] == 'RUNNING' and
                   source_service['currentDeployment']['state'] == 'ACTIVE' and
                   source_container['image'].startswith(':dawamak-test.dns-bridge.') and
                   not source_container.get('environment'))
assert (source_service.get('isDisabled') and source_service['state'] == 'DISABLED') or source_is_proxy, 'Source must be stopped or storage-free proxy'
target_service = session.client('lightsail').get_container_services(serviceName='dawamkom-production')['containerServices'][0]
target_mode = target_service['currentDeployment']['containers']['web']['environment']['DAWAMAK_RUNTIME_MODE']
assert target_mode in ['preview', 'standby'], 'Never overwrite a live destination'
source_s3 = source.client('s3')
target_s3 = session.client('s3')
bucket = 'dawamkom-private-state-905106554499'
head = source_s3.head_object(Bucket=copy_tool.SOURCE_BUCKET, Key=copy_tool.STATE_KEY)
source_version = head['VersionId']
time.sleep(30)  # Wait for any previous deployment's in-flight writes to drain.
assert source_s3.head_object(Bucket=copy_tool.SOURCE_BUCKET, Key=copy_tool.STATE_KEY)['VersionId'] == source_version, 'Source is not quiescent; retry after it settles'
body = source_s3.get_object(Bucket=copy_tool.SOURCE_BUCKET, Key=copy_tool.STATE_KEY,
                            VersionId=source_version)['Body'].read()
snapshot = json.loads(body)
assert snapshot['version'] == 1 and isinstance(snapshot['partners'], list) and snapshot['profile']
digest = hashlib.sha256(body).hexdigest()
# Archive the exact final snapshot independently from the working object.
copy_tool.verified_put(target_s3, 'migration/final-source-state.json', body,
                       {'source-version': source_version, 'sha256': digest})
try:
    target_head = target_s3.head_object(Bucket=bucket, Key=copy_tool.STATE_KEY)
    condition = {'IfMatch': target_head['ETag']}
except target_s3.exceptions.ClientError as error:
    if error.response['ResponseMetadata']['HTTPStatusCode'] != 404:
        raise
    condition = {'IfNoneMatch': '*'}
result = target_s3.put_object(Bucket=bucket, Key=copy_tool.STATE_KEY, Body=body,
                              ContentType='application/json', ServerSideEncryption='AES256',
                              Metadata={'source-version': source_version, 'sha256': digest}, **condition)
copied = target_s3.get_object(Bucket=bucket, Key=copy_tool.STATE_KEY,
                              VersionId=result['VersionId'])['Body'].read()
assert hashlib.sha256(copied).hexdigest() == digest
assert source_s3.head_object(Bucket=copy_tool.SOURCE_BUCKET, Key=copy_tool.STATE_KEY)['VersionId'] == source_version
still_source = source.client('lightsail').get_container_services(serviceName='dawamak-test')['containerServices'][0]
assert still_source['state'] == source_service['state'] and still_source['currentDeployment']['version'] == source_service['currentDeployment']['version']
environment = (json.loads((private / 'standby-environment.json').read_text()) if source_is_proxy else
               dict(source_container['environment']))
for key in ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
            'DAWAMAK_STORAGE_BOOTSTRAP', 'DAWAMAK_SAMPLE_COMPANY']:
    environment.pop(key, None)
runtime = json.loads((private / 'runtime.json').read_text())
environment.update(AWS_ACCESS_KEY_ID=runtime['AccessKeyId'], AWS_SECRET_ACCESS_KEY=runtime['SecretAccessKey'],
    DAWAMAK_STORAGE_BUCKET=bucket, DAWAMAK_STORAGE_REGION='us-east-1', DAWAMAK_STORAGE_KEY=copy_tool.STATE_KEY,
    DAWAMAK_RUNTIME_MODE='standby')
fd = os.open(private / 'standby-environment.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(environment, output)
receipt = {'sourceVersion': source_version, 'destinationVersion': result['VersionId'],
           'sha256': digest, 'bytes': len(body), 'companies': len(snapshot['partners']),
           'sourceDeployment': source_service['currentDeployment']['version'],
           'time': datetime.now(timezone.utc).isoformat(), 'destinationMode': 'standby'}
copy_tool.verified_put(target_s3, 'migration/final-copy-receipt.json', json.dumps(receipt).encode(), {})
print(json.dumps(receipt))
