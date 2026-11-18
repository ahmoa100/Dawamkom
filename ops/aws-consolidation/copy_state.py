"""Copy source versions into a verified archive; never overwrite live state.

Run in destination CloudShell after approved roles are provisioned. Default is
inventory only; --copy archives versions and seeds the isolated preview object.
No credentials or object contents are printed. Production cutover is separate.
"""
import argparse
import base64
import hashlib
import json
from datetime import datetime, timezone

SOURCE_ACCOUNT = '840448280787'
TARGET_ACCOUNT = '905106554499'
SOURCE_BUCKET = 'dawamkom-private-state-' + SOURCE_ACCOUNT
TARGET_BUCKET = 'dawamkom-private-state-' + TARGET_ACCOUNT
STATE_KEY = 'dawamkom/state.json'
PREVIEW_KEY = 'migration/preview-state.json'


def assumed(session, arn):
    import boto3
    credentials = session.client('sts').assume_role(
        RoleArn=arn, RoleSessionName='DawamkomMigration', DurationSeconds=3600
    )['Credentials']
    return boto3.Session(
        aws_access_key_id=credentials['AccessKeyId'],
        aws_secret_access_key=credentials['SecretAccessKey'],
        aws_session_token=credentials['SessionToken'], region_name='us-east-1')


def archive_key(key, version):
    digest = hashlib.sha256((key + '\0' + version).encode()).hexdigest()
    return 'migration-history/' + digest + '.json'


def verified_put(client, key, body, metadata):
    checksum = base64.b64encode(hashlib.sha256(body).digest()).decode()
    result = client.put_object(Bucket=TARGET_BUCKET, Key=key, Body=body,
                              ChecksumSHA256=checksum, Metadata=metadata,
                              ContentType='application/json',
                              ServerSideEncryption='AES256')
    # Independently download the specific destination version, including on retry.
    stored = client.get_object(Bucket=TARGET_BUCKET, Key=key,
                               VersionId=result['VersionId'])['Body'].read()
    if hashlib.sha256(stored).digest() != hashlib.sha256(body).digest():
        raise RuntimeError('Destination content checksum mismatch')
    return result['VersionId']


def run(source, target, copy=False):
    for client, bucket in [(source, SOURCE_BUCKET), (target, TARGET_BUCKET)]:
        if client.get_bucket_versioning(Bucket=bucket).get('Status') != 'Enabled':
            raise RuntimeError('Both buckets must have versioning enabled')
    current = source.head_object(Bucket=SOURCE_BUCKET, Key=STATE_KEY)['VersionId']
    versions = []
    markers = []
    for page in source.get_paginator('list_object_versions').paginate(Bucket=SOURCE_BUCKET):
        versions.extend(page.get('Versions', []))
        markers.extend(page.get('DeleteMarkers', []))
    # Do not silently resurrect deleted objects or omit deletions from history.
    if markers:
        raise RuntimeError('Source has delete markers; review migration scope first')
    if not copy:
        return {'versions': len(versions), 'bytes': sum(v['Size'] for v in versions),
                'mode': 'inventory-only'}
    manifest = {'sourceAccount': SOURCE_ACCOUNT, 'sourceBucket': SOURCE_BUCKET,
                'capturedStateVersion': current, 'objects': []}
    for version in versions:
        key, version_id = version['Key'], version['VersionId']
        body = source.get_object(Bucket=SOURCE_BUCKET, Key=key,
                                 VersionId=version_id)['Body'].read()
        sha = hashlib.sha256(body).hexdigest()
        destination = archive_key(key, version_id)
        try:
            existing = target.get_object(Bucket=TARGET_BUCKET, Key=destination)
        except target.exceptions.NoSuchKey:
            existing = None
        if existing:
            if hashlib.sha256(existing['Body'].read()).hexdigest() != sha:
                raise RuntimeError('Existing archive differs; refusing overwrite')
            destination_version = existing['VersionId']
        else:
            destination_version = verified_put(target, destination, body, {'sha256': sha})
        manifest['objects'].append({
            'sourceKey': key, 'sourceVersion': version_id,
            'sourceModified': version['LastModified'].isoformat(),
            'destinationKey': destination, 'destinationVersion': destination_version,
            'sha256': sha, 'bytes': len(body)})
    preview = source.get_object(Bucket=SOURCE_BUCKET, Key=STATE_KEY,
                                VersionId=current)['Body'].read()
    json.loads(preview)  # Fail before seeding invalid JSON.
    manifest['previewVersion'] = verified_put(target, PREVIEW_KEY, preview,
                                               {'source-version': current})
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    manifest_key = 'migration/manifests/' + stamp + '.json'
    verified_put(target, manifest_key, json.dumps(manifest).encode(), {})
    return {'mode': 'archive-and-preview-only', 'versions': len(versions),
            'manifestKey': manifest_key, 'productionStateWritten': False}


def main():
    import boto3
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--copy', action='store_true')
    parser.add_argument('--credential-file', help='Private temporary IAM credential file; root cannot assume roles')
    args = parser.parse_args()
    if args.credential_file:
        from pathlib import Path
        credentials = json.loads(Path(args.credential_file).expanduser().read_text())
        session = boto3.Session(region_name='us-east-1',
                                aws_access_key_id=credentials['AccessKeyId'],
                                aws_secret_access_key=credentials['SecretAccessKey'])
    else:
        session = boto3.Session(region_name='us-east-1')
    if session.client('sts').get_caller_identity()['Account'] != TARGET_ACCOUNT:
        raise RuntimeError('Run only from destination account ' + TARGET_ACCOUNT)
    operator = assumed(session, 'arn:aws:iam::' + TARGET_ACCOUNT +
                        ':role/DawamkomMigrationOperator')
    source = assumed(operator, 'arn:aws:iam::' + SOURCE_ACCOUNT +
                     ':role/DawamkomMigrationReadOnly')
    print(json.dumps(run(source.client('s3'), operator.client('s3'), args.copy)))


if __name__ == '__main__':
    main()
