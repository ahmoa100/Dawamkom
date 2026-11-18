"""Run once using approved destination admin session; never prints credentials."""
import boto3
import json
import os
from pathlib import Path

session = boto3.Session(region_name='us-east-1')
assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
iam = session.client('iam')
name = 'dawamkom-migration-temporary'
try:
    iam.get_user(UserName=name)
except iam.exceptions.NoSuchEntityException:
    iam.create_user(UserName=name, Tags=[{'Key': 'Application', 'Value': 'Dawamkom'},
                                       {'Key': 'Purpose', 'Value': 'TemporaryMigration'}])
iam.put_user_policy(UserName=name, PolicyName='AssumeMigrationOperatorOnly', PolicyDocument=json.dumps({
    'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow', 'Action': 'sts:AssumeRole',
    'Resource': 'arn:aws:iam::905106554499:role/DawamkomMigrationOperator'}]}))
path = Path.home() / '.dawamkom-migration' / 'operator.json'
path.parent.mkdir(mode=0o700, exist_ok=True)
if not path.exists():
    if iam.list_access_keys(UserName=name)['AccessKeyMetadata']:
        raise RuntimeError('Existing key without local receipt; refuse to generate another')
    key = iam.create_access_key(UserName=name)['AccessKey']
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump({'AccessKeyId': key['AccessKeyId'], 'SecretAccessKey': key['SecretAccessKey']}, output)
print('Temporary migration access prepared; credentials stored privately, not printed.')
