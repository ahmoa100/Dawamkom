"""Deploy staged canonical state in standby, or promote it after verification."""
import argparse
import boto3
import importlib.util
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--live', action='store_true')
args = parser.parse_args()
session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
spec = importlib.util.spec_from_file_location('copy_tool', Path.home() / 'dawamkom-copy-state.py')
copy_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy_tool)
temporary_key = json.loads((Path.home() / '.dawamkom-migration' / 'operator.json').read_text())
temporary = boto3.Session(region_name='us-east-1', aws_access_key_id=temporary_key['AccessKeyId'],
                           aws_secret_access_key=temporary_key['SecretAccessKey'])
operator = copy_tool.assumed(temporary, 'arn:aws:iam::905106554499:role/DawamkomMigrationOperator')
source = copy_tool.assumed(operator, 'arn:aws:iam::840448280787:role/DawamkomMigrationReadOnly')
source_service = source.client('lightsail').get_container_services(serviceName='dawamak-test')['containerServices'][0]
source_container = source_service['currentDeployment']['containers']['web']
source_is_proxy = (source_service['state'] == 'RUNNING' and
                   source_service['currentDeployment']['state'] == 'ACTIVE' and
                   source_container['image'].startswith(':dawamak-test.dns-bridge.') and
                   not source_container.get('environment'))
assert (source_service.get('isDisabled') and source_service['state'] == 'DISABLED') or source_is_proxy, 'Source must remain fenced'
lightsail = session.client('lightsail')
service = lightsail.get_container_services(serviceName='dawamkom-production')['containerServices'][0]
assert service['state'] == 'RUNNING' and service['currentDeployment']['state'] == 'ACTIVE'
current = service['currentDeployment']['containers']['web']
assert current['environment']['DAWAMAK_RUNTIME_MODE'] in ['preview', 'standby']
if args.live:
    assert current['environment']['DAWAMAK_RUNTIME_MODE'] == 'standby'
    assert lightsail.get_certificates(certificateName='dawamkom-www')['certificates'][0]['certificateDetail']['status'] == 'ISSUED'
s3 = session.client('s3')
receipt = json.loads(s3.get_object(Bucket='dawamkom-private-state-905106554499', Key='migration/final-copy-receipt.json')['Body'].read())
assert receipt['destinationMode'] == 'standby'
assert source.client('s3').head_object(Bucket='dawamkom-private-state-840448280787', Key='dawamkom/state.json')['VersionId'] == receipt['sourceVersion'], 'Source changed after copy'
assert s3.head_object(Bucket='dawamkom-private-state-905106554499', Key='dawamkom/state.json')['VersionId'] == receipt['destinationVersion'], 'Destination changed after copy'
env = json.loads((Path.home() / '.dawamkom-migration' / 'standby-environment.json').read_text())
assert env['DAWAMAK_STORAGE_BUCKET'] == 'dawamkom-private-state-905106554499'
assert env['DAWAMAK_STORAGE_KEY'] == 'dawamkom/state.json'
env['DAWAMAK_RUNTIME_MODE'] = 'live' if args.live else 'standby'
lightsail.create_container_service_deployment(serviceName='dawamkom-production',
    containers={'web': {'image': current['image'], 'environment': env, 'ports': {'8080': 'HTTP'}}},
    publicEndpoint={'containerName': 'web', 'containerPort': 8080,
                    'healthCheck': {'path': '/health', 'successCodes': '200'}})
print(json.dumps({'deploymentStarted': True, 'mode': env['DAWAMAK_RUNTIME_MODE']}))
