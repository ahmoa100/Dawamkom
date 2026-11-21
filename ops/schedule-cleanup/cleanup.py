"""Audit/archive future dangling assignments, never attendance or historical schedules.

Run in the production account's CloudShell. Default is read-only. Apply requires
the exact reviewed plan digest; S3 IfMatch prevents overwriting concurrent edits.
Private backup/ledger stay in S3, never in Git or terminal output.
"""
import argparse
import copy
import hashlib
import json
from collections import Counter
from datetime import datetime, timedelta, timezone

BUCKET = 'dawamkom-private-state-905106554499'
KEY = 'dawamkom/state.json'


def plan(snapshot, first_day):
    result = copy.deepcopy(snapshot)
    ledger = []
    workspaces = [('state', result['state'])]
    workspaces += [(p['id'], p['workspace']) for p in result['partners']]
    for company, workspace in workspaces:
        if not isinstance(workspace.get('workAssignments'), list):
            continue
        staff = {p['id']: p for p in workspace.get('staff', [])}
        periods = {p['id']: p for p in workspace.get('workPeriods', [])}
        kept = []
        for entry in workspace.get('workAssignments', []):
            reason = None
            person = staff.get(entry.get('staffId'))
            period_id = entry.get('periodId')
            # Rest overrides and historical/today schedules are intentional data.
            if entry.get('date', '') >= first_day and period_id:
                period = periods.get(period_id)
                if not person:
                    reason = 'missing_employee'
                elif not period:
                    reason = 'missing_period'
                elif isinstance(period.get('branchIds'), list) and person.get('branchId') not in period['branchIds']:
                    reason = 'outside_branch'
                elif person.get('branchId') in period.get('disabledBranchIds', []):
                    reason = 'disabled_branch'
            if reason:
                ledger.append({'company': company, 'reason': reason, 'assignment': entry})
            else:
                kept.append(entry)
        workspace['workAssignments'] = kept
    digest = hashlib.sha256(json.dumps(ledger, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return result, ledger, digest


def main():
    import boto3
    args_parser = argparse.ArgumentParser()
    args_parser.add_argument('--apply-plan')
    args = args_parser.parse_args()
    session = boto3.Session(region_name='us-east-1')
    assert session.client('sts').get_caller_identity()['Account'] == '905106554499'
    service = session.client('lightsail').get_container_services(serviceName='dawamkom-production')['containerServices'][0]
    assert service['state'] == 'RUNNING' and service['currentDeployment']['state'] == 'ACTIVE' and not service.get('nextDeployment')
    env = service['currentDeployment']['containers']['web']['environment']
    assert env['DAWAMAK_STORAGE_BUCKET'] == BUCKET and env.get('DAWAMAK_STORAGE_KEY', KEY) == KEY
    assert env['DAWAMAK_RUNTIME_MODE'] == 'live'
    s3 = session.client('s3')
    original = s3.get_object(Bucket=BUCKET, Key=KEY)
    raw = original['Body'].read()
    snapshot = json.loads(raw)
    assert snapshot['version'] == 1
    today = datetime.now(timezone(timedelta(hours=3))).date()
    first_day = (today + timedelta(days=1)).isoformat()
    updated, ledger, digest = plan(snapshot, first_day)
    summary = {'firstDay': first_day, 'assignments': len(ledger),
               'employees': len({(x['company'], x['assignment']['staffId']) for x in ledger}),
               'companies': len({x['company'] for x in ledger}),
               'reasons': dict(Counter(x['reason'] for x in ledger)), 'plan': digest}
    if not args.apply_plan:
        print(json.dumps({'mode': 'audit', **summary}))
        return
    assert args.apply_plan == digest, 'Plan changed: audit again before applying'
    assert ledger, 'Nothing to clean'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    prefix = f'dawamkom/schedule-cleanup/{stamp}-{digest[:12]}'
    def archive(key, body):
        s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType='application/json',
                      ServerSideEncryption='AES256', IfNoneMatch='*')
        assert s3.get_object(Bucket=BUCKET, Key=key)['Body'].read() == body
    archive(prefix + '/before.json', raw)
    archive(prefix + '/removed-assignments.json', json.dumps(ledger).encode())
    body = json.dumps(updated, separators=(',', ':')).encode()
    saved = s3.put_object(Bucket=BUCKET, Key=KEY, Body=body, ContentType='application/json',
                         ServerSideEncryption='AES256', IfMatch=original['ETag'])
    # Version-specific readback verifies our write even if a later valid write occurs.
    version = {'VersionId': saved['VersionId']} if saved.get('VersionId') else {}
    assert json.loads(s3.get_object(Bucket=BUCKET, Key=KEY, **version)['Body'].read()) == updated
    _, remaining, _ = plan(updated, first_day)
    assert not remaining
    archive(prefix + '/receipt.json', json.dumps(summary).encode())
    print(json.dumps({'mode': 'applied', **summary, 'backup': prefix, 'verified': True}))


if __name__ == '__main__':
    main()
