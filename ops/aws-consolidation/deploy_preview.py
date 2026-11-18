"""Deploy isolated preview only. Execute using destination CloudShell admin.

Requires the verified preview object and a Lightsail image already pushed into
the destination service. Secrets remain in memory or a mode-0600 receipt file.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import boto3

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--image', required=True)
args = parser.parse_args()
assert args.image.startswith(':dawamkom-production.'), 'Destination image required'
session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
s3 = session.client('s3')
s3.head_object(Bucket='dawamkom-private-state-905106554499', Key='migration/preview-state.json')
spec = importlib.util.spec_from_file_location('copy_state', Path.home() / 'dawamkom-copy-state.py')
copy_tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy_tool)
private_dir = Path.home() / '.dawamkom-migration'
temporary = json.loads((private_dir / 'operator.json').read_text())
temporary_session = boto3.Session(region_name='us-east-1',
    aws_access_key_id=temporary['AccessKeyId'], aws_secret_access_key=temporary['SecretAccessKey'])
operator = copy_tool.assumed(temporary_session, 'arn:aws:iam::905106554499:role/DawamkomMigrationOperator')
source = copy_tool.assumed(operator, 'arn:aws:iam::840448280787:role/DawamkomMigrationReadOnly')
source_service = source.client('lightsail').get_container_services(serviceName='dawamak-test')['containerServices'][0]
old_env = source_service['currentDeployment']['containers']['web']['environment']
iam = session.client('iam')
runtime_key_file = private_dir / 'runtime.json'
if not runtime_key_file.exists():
    if iam.list_access_keys(UserName='dawamkom-runtime')['AccessKeyMetadata']:
        raise RuntimeError('Runtime key exists without local receipt; do not create another')
    key = iam.create_access_key(UserName='dawamkom-runtime')['AccessKey']
    fd = os.open(runtime_key_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump({'AccessKeyId': key['AccessKeyId'], 'SecretAccessKey': key['SecretAccessKey']}, output)
key = json.loads(runtime_key_file.read_text())
lightsail = session.client('lightsail')
target = lightsail.get_container_services(serviceName='dawamkom-production')['containerServices'][0]
# Preserve production configuration privately for the later reviewed standby
# deployment. Never publish source credentials or copy them into the new app.
saved_env = {k: v for k, v in old_env.items() if k.startswith('DAWAMAK_') and
             k not in ['DAWAMAK_SAMPLE_COMPANY', 'DAWAMAK_STORAGE_BOOTSTRAP']}
saved_env.update(AWS_ACCESS_KEY_ID=key['AccessKeyId'], AWS_SECRET_ACCESS_KEY=key['SecretAccessKey'],
                 DAWAMAK_STORAGE_BUCKET='dawamkom-private-state-905106554499',
                 DAWAMAK_STORAGE_REGION='us-east-1', DAWAMAK_STORAGE_KEY='dawamkom/state.json',
                 DAWAMAK_RUNTIME_MODE='standby')
fd = os.open(private_dir / 'standby-environment.json', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(saved_env, output)
preview_env = {k: v for k, v in saved_env.items() if not k.startswith(('DAWAMAK_GOOGLE_', 'DAWAMAK_SES_', 'DAWAMAK_PUSH_'))}
preview_env.update(DAWAMAK_RUNTIME_MODE='preview', DAWAMAK_STORAGE_KEY='migration/preview-state.json',
                   DAWAMAK_PUBLIC_ORIGIN=target['url'].rstrip('/'))
assert preview_env['DAWAMAK_STORAGE_KEY'] != 'dawamkom/state.json'
if target.get('isDisabled'):
    lightsail.update_container_service(serviceName='dawamkom-production', isDisabled=False)
    print(json.dumps({'service': 'dawamkom-production', 'mode': 'preview',
                      'state': 'ENABLING', 'next': 'Rerun after service becomes READY'}))
    raise SystemExit(0)
if target['state'] not in ['READY', 'RUNNING']:
    raise RuntimeError('Wait for destination READY before deployment: ' + target['state'])
result = lightsail.create_container_service_deployment(serviceName='dawamkom-production',
    containers={'web': {'image': args.image, 'environment': preview_env, 'ports': {'8080': 'HTTP'}}},
    publicEndpoint={'containerName': 'web', 'containerPort': 8080,
                    'healthCheck': {'path': '/health', 'successCodes': '200', 'intervalSeconds': 15,
                                    'timeoutSeconds': 5, 'healthyThreshold': 2, 'unhealthyThreshold': 3}})
print(json.dumps({'service': 'dawamkom-production', 'mode': 'preview', 'url': target['url'],
                  'state': result['containerService']['state']}))
