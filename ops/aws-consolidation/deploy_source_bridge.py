"""Deploy cache bridge while destination is STANDBY; recopy before promotion.

Re-enabling source briefly restarts its original deployment. Target must remain
read-only then. Once bridge is ACTIVE, stage final state again before --live.
"""
import argparse
import boto3
import json
import urllib.request
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--image', required=True)
args = parser.parse_args()
assert args.image.startswith(':dawamak-test.dns-bridge.')
session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '840448280787'
original = json.loads((Path.home() / '.dawamkom-migration' / 'source-original-deployment.json').read_text())
assert original['version'] == 101
response = urllib.request.urlopen('https://dawamkom-production.ybgzybtz57bge.us-east-1.cs.amazonlightsail.com/health')
assert response.status == 200 and response.headers['X-Dawamkom-Mode'] == 'standby', 'Destination must remain read-only while source is re-enabled'
lightsail = session.client('lightsail')
service = lightsail.get_container_services(serviceName='dawamak-test')['containerServices'][0]
assert service['currentDeployment']['version'] == 101, 'Original deployment changed'
if service.get('isDisabled'):
    lightsail.update_container_service(serviceName='dawamak-test', isDisabled=False)
    print('Bridge service enabling; rerun when READY.')
    raise SystemExit(0)
assert service['state'] in ['READY', 'RUNNING']
lightsail.create_container_service_deployment(serviceName='dawamak-test',
    containers={'web': {'image': args.image, 'environment': {}, 'ports': {'8080': 'HTTP'}}},
    publicEndpoint={'containerName': 'web', 'containerPort': 8080,
                    'healthCheck': {'path': '/health', 'successCodes': '200'}})
print(json.dumps({'sourceBridgeDeploying': True, 'sourceStorageAccess': False}))
