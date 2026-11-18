"""Cutover fence: preserve original configuration privately, then stop source.

Run ONLY in source account, after destination certificate and QA are ready.
"""
import boto3
import json
import os
from pathlib import Path

session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '840448280787'
lightsail = session.client('lightsail')
service = lightsail.get_container_services(serviceName='dawamak-test')['containerServices'][0]
assert service['state'] == 'RUNNING' and service['currentDeployment']['state'] == 'ACTIVE'
assert service['currentDeployment']['version'] == 101, 'Source changed since migration QA; review first'
directory = Path.home() / '.dawamkom-migration'
directory.mkdir(mode=0o700, exist_ok=True)
path = directory / 'source-original-deployment.json'
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as output:
    json.dump(service['currentDeployment'], output, default=str)
result = lightsail.update_container_service(serviceName='dawamak-test', isDisabled=True)
print(json.dumps({'account': '840448280787', 'sourceStopping': True,
                  'originalDeployment': 101, 'state': result['containerService']['state']}))
