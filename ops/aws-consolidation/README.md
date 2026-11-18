# Dawamkom account consolidation — preparation

Completed 2026-11-19 (Riyadh). Production runs in destination account 905106554499.
Source account 840448280787 is retained for rollback and cached-DNS forwarding.

## Verified scope

| Item | Source | Destination |
|---|---|---|
| AWS account | 840448280787 (eazyabcworld2) | 905106554499 (lasqal / ahmoa100@gmail.com) |
| Region | us-east-1 | us-east-1 |
| Lightsail container | dawamak-test (backup/bridge) | dawamkom-production (live) |
| Private S3 bucket | dawamkom-private-state-840448280787 | dawamkom-private-state-905106554499 |
| Production state key | dawamkom/state.json | same key |

The source deployment was 101 ACTIVE, image `:dawamak-test.release-69e65ee.105`.
The source bucket contained 961 versions, 1,526,624,223 bytes, two current
objects and no delete markers at inspection. Re-inventory before copying.
Use the latest live state, including real attendance recorded after yesterday's
reset; do not restore the reset backup over it.

Existing EazyAbc applications and resources in Mumbai remain untouched. This
is account consolidation, not a regional move. Keep GoDaddy DNS and mail MX.

## Templates (AWS syntax validation passed; deployed)

- `target-stack.json`: private encrypted/versioned bucket, restricted runtime
  IAM user (no access key), migration operator role, SES domain identity, and
  a disabled nano Lightsail container. Disabled containers still incur charges.
- `source-readonly-stack.json`: temporary cross-account role restricted to
  source bucket reads/version reads and container configuration inspection.

Before any stack operation, verify `aws sts get-caller-identity` matches the
intended account and explicitly pass `--region us-east-1`. Validate each template
with CloudFormation. Review a change set before executing it; named IAM resources
require `CAPABILITY_NAMED_IAM`. These files do not change production DNS or create
runtime access keys.

The proposed nano service is $7/month plus S3 storage/requests and temporary
overlap with the existing service. Existing destination workloads are separate.
Obtain approval for these paid resources and the listed access changes before
execution. Do not close the source account as part of provisioning.

## Migration sequence and gates

1. Validate templates, review proposed resources and obtain provisioning approval.
2. Create destination resources and the temporary read-only source trust. Create
   a restricted destination runtime key only when needed; never log credentials
   or commit deployment environment files.
3. Copy all source object versions to an immutable archive prefix in the new
   bucket, with a manifest mapping source key/version/time to destination key and
   SHA-256. S3 version IDs cannot be preserved across buckets. Verify every copy,
   preserve the manual reset backup, and support resuming without overwriting
   archive objects. Use copy_state.py in destination CloudShell: default is inventory-only; --copy archives and verifies all versions and seeds only the isolated preview key.
4. Copy a captured current-state version into `migration/preview-state.json`.
   Deploy the tested migration build with `DAWAMAK_RUNTIME_MODE=preview` and
   `DAWAMAK_STORAGE_KEY=migration/preview-state.json`. This permits isolated QA
   writes, disables invitation emails, push and scheduled workers. Use the
   generated test URL, remove OAuth and production sender configuration there.
5. Test owner/manager/employee access, branch scope, attendance, approvals,
   documents, payroll/export and existing sessions against the isolated copy.
   Do not put unapproved test mutations into production data.
6. Prepare a Lightsail certificate and validate it using DNS records without
   changing the live www record. Verify target SES DKIM separately. Both accounts
   currently lack SES production access; account consolidation does not transfer
   production approval or guarantee it. Keep sender noreply@dawamkom.net.
7. Arrange a short cutover window. Disable source service and wait until stopped;
   capture a fresh state version and copy/verify it into the target production
   key. Recheck that the source version has not changed. Never copy a stale QA
   snapshot into production. Never run two writable production services.
8. Deploy target in `standby` (read-only, no outbound delivery/workers), preserving
   production public origin, OAuth configuration, VAPID keys and company IDs.
   Replace source AWS credentials with the destination restricted key; use new
   bucket and the existing canonical key. Do not set sample/bootstrap options.
9. After verification and cutover approval, activate target in `live` and switch
   www.dawamkom.net to its validated endpoint. Verify health, release, login and
   real storage writes publicly, plus no duplicate reminders/monthly emails.
10. Retain source and backups for rollback until verified. If target has accepted
    writes, stop it and reconcile/copy its latest state back before rolling back
    traffic; switching DNS to stale source state loses data. Remove temporary
    migration roles after sign-off. Audit all source regions/services/billing
    before considering account closure.

Installed iOS/Android wrappers keep the same public domain, so an AWS account
move alone does not require a new mobile binary.

## Runtime safety controls

`live` is the unchanged default. `preview` with S3 requires the isolated key;
`standby` blocks mutating requests and persistence; `maintenance` returns 503 for
application requests. Health and version endpoints remain available. Only live
mode enables outbound delivery and background workers. These controls are
deployed on the new production service, currently in live mode. The old service
runs the separate storage-free proxy.

## Remaining work

SES verification/production approval; eventual retirement of the old forwarding
service after the user ends rollback retention. Do not delete the old account or
its data. An account-wide source dependency/billing audit is required before any
future closure.

## Execution receipt — 2026-11-19

- User approved $7/month nano hosting plus S3 usage and restricted migration/app access.
- Destination stack `dawamkom-consolidation` reached CREATE_COMPLETE in 905106554499.
- Source stack `dawamkom-migration-readonly` reached CREATE_COMPLETE in 840448280787.
- Root AWS sessions cannot assume roles. A temporary IAM user
  `dawamkom-migration-temporary` was therefore created, allowed only to assume
  `DawamkomMigrationOperator`. Its credential receipt stays mode 0600 in the
  destination CloudShell at `~/.dawamkom-migration/operator.json`; never retrieve
  it into chat or Git. Remove that user/key as well as the two migration roles
  after migration sign-off.
- Copy completed: 961 versions, 1,526,624,223 source bytes, checked by SHA-256
  against downloaded destination object versions. Manifest in destination bucket:
  `migration/manifests/20261118T213924276120Z.json` (UTC date).
- Only `migration-history/`, `migration/manifests/`, and the isolated
  `migration/preview-state.json` were written. Production state key was not written.
- Image built/uploaded: `:dawamkom-production.migration-3bfaa67.1`, registered digest
  `sha256:ca4bc95d4a3ba9da42a81109ff2a88fc81b6538f34555f1ddc8528593b38c137`.
- Preview deployment 1 started. URL:
  `https://dawamkom-production.ybgzybtz57bge.us-east-1.cs.amazonlightsail.com/`.
  It uses preview mode, isolated storage, no SES/OAuth/push configuration and no
  background delivery. Verify ACTIVE/public health before describing it as ready.
- Follow-up verification: deployment 1 ACTIVE, service RUNNING, HTTPS health 200
  with X-Dawamkom-Mode=preview. Demo-company login and staff navigation succeeded.
  The full copied snapshot matches all 6 original companies' business data after
  excluding only login session fields changed by that test. Runtime policy
  simulation allows Get/Put on destination state, denies source-state access and
  denies deletion. Public source version remains unchanged.
- The restricted runtime credential and a later standby environment receipt are
  private mode-0600 files in destination CloudShell's `.dawamkom-migration/`.
  The standby receipt keeps original app secrets with destination credentials;
  do not print it. It has not been deployed.
- Source remained live, public version `e8c16584fbf0264c`. Existing www CNAME:
  `dawamak-test.3yex7eer5s79c.us-east-1.cs.amazonlightsail.com.` (TTL 1 hour).
- New certificate `dawamkom-www` awaits DNS validation. SES identity exists but
  remains unverified/sandbox. GoDaddy rejected both batch and single record save
  attempts with `genericErrorMessage`. A single HTTPS record is filled for user
  manual save; no verified DNS changes yet. Keep all old records during rollback.
- Subsequent attempts with canonical trailing-dot values and GoDaddy's additive
  zone-file importer also returned genericErrorMessage. Domain table still has
  11 original records and www points to source. Do not keep blindly retrying.
  Ready additive verification text file:
  `C:/Users/abdul/AppData/Local/Temp/dawamkom-aws-verification.txt`.
  Remaining external blocker: save these four validation CNAMEs through a working
  GoDaddy session or have GoDaddy resolve its DNS write error. No live cutover
  until certificate validation and QA complete.

Published HTTPS CNAME (AWS-supported alternate value, certificate issued):
`_c04826e658cbd0612cd46423fdabac9a.www` ->
`3c8c39e78d0f74ecf01b55eb947f4c33.wzccmgtwzk.acm-validations.aws`.

Published SES CNAMEs (AWS verification pending; name `<token>._domainkey`, value `<token>.dkim.amazonses.com`):

- `33pe2fe3xpcpf4slxlbg3zgn4jj3uc23`
- `72hbbwcbpmbe64w6cq4m3hms5lulii4c`
- `akjroyslvpewrynzcdoarnh4ndsmwwcc`

User marked `tabukstep.com` and `steptabuk.com` as no longer needed, for later
cleanup. Do not delete or change renewal settings during this migration.

## Final cutover procedure and DNS-cache bridge

GoDaddy retry on November 19: a fresh sign-in alone still failed. Standard SES
CNAME saves then succeeded on the English DNS page, followed by the ACM record
using AWS's documented alternate value without its leading underscore. All four
records are saved (15 records total), and certificate `dawamkom-www` is ISSUED.
Original records and www routing were preserved. Support was contacted with user
approval, then notified that verification was resolved and the conversation was
closed before an agent made changes.

The new certificate has been attached to the target. An HTTPS request to the
target with Host/SNI www.dawamkom.net returned 200 and mode preview, without
changing public DNS. The regular public URL still returned source version
e8c16584fbf0264c before the controlled stop.

Use the guarded scripts; never enable an original source deployment while the
destination is writable:

1. Source: `stop_source.py` preserves deployment 101 privately (mode 0600) and
   disables the service. Wait for DISABLED.
2. Target: `stage_final_state.py` checks the source fence, waits for a 30-second
   stable object version, archives the exact final snapshot, conditionally writes
   canonical state, verifies SHA-256 and records source/destination version IDs.
3. Target: `deploy_staged.py` deploys canonical state in standby. Wait for ACTIVE
   and confirm HTTPS health mode standby.
4. Source: `deploy_source_bridge.py --image :dawamak-test.dns-bridge.106` first
   enables the service, then is rerun once READY/RUNNING to deploy the bridge.
   Its original app can briefly run during re-enable, so the target MUST still be
   standby. The script checks that condition. Source remains the only possible
   writer during that interval.
5. Wait for the storage-free proxy to be ACTIVE. It has no AWS credentials or app
   workers. Source requests now reach the read-only target. Run target
   `stage_final_state.py` AGAIN to capture any source writes during step 4.
6. Target: `deploy_staged.py --live` verifies that source remains stopped or a
   storage-free proxy and that neither canonical object changed after the latest
   receipt. Wait for ACTIVE. The old endpoint now forwards to the new live app.
7. Change only the www CNAME to
   `dawamkom-production.ybgzybtz57bge.us-east-1.cs.amazonlightsail.com`. Check public
   HTTPS, release, login, persistence and source proxy behavior. Retain the old
   account, original image, state versions and private deployment receipt.

The bridge is pinned to the new HTTPS host, verifies TLS and streams cookies,
request bodies and redirects. It has no local persistence. It avoids leaving
clients with cached old DNS on a stale database while propagation completes.
The image was built and pushed but is not automatically deployed by preparation.

If rollback is needed before the target accepts writes, re-deploy source's saved
original containers/public endpoint and enable it. After target accepts writes,
stop/fence target first and transfer its newest canonical state back to source,
using the normal authenticated CloudShell file download/upload UI if necessary.
Keep the data file private, verify its SHA-256 in both accounts and condition the
source PutObject on its latest ETag. Only then restore original app traffic.
Migration roles intentionally do not grant source writes. Do not point traffic
at stale source state or re-enable its original writer alongside target live.

## Completion receipt — November 19, 2026 (Riyadh)

- Live: account 905106554499, us-east-1, `dawamkom-production`, deployment **3**
  ACTIVE/RUNNING, mode live, image `:dawamkom-production.migration-3bfaa67.1`.
- Public website `https://www.dawamkom.net` now CNAMEs to the destination service.
  GoDaddy saved the record, and Cloudflare public DNS returned the new hostname.
  Direct target and public requests returned HTTPS 200, mode live and release
  **e266c4e4bfe7b600**. Cached old DNS is handled by the bridge.
- Source service `dawamak-test` runs deployment **102**, image
  `:dawamak-test.dns-bridge.106`, with no environment/storage credentials or app
  workers. Original deployment 101/image 105 and state remain intact for rollback.
- Final source version is frozen at `G01JtoR29RHHObLd.Klj0zHMuauU7ko8`, SHA-256
  `d9ae061ee400821ad10c31afa90c53e1d1a4b04be63dfc94bb4d8f2260fe16c6`.
  Final snapshot is 165,390 bytes with 6 companies and the owner's 38 employees.
  Both final-copy passes matched the same content. Never restore an earlier
  reset backup over production.
- Backup history caught up to **968 versions**, all copied and checksum verified.
  Destination manifest: `migration/manifests/20261118T225314790185Z.json`.
- Private completion audit: `migration/completion-receipt.json` in the destination
  bucket. Verified live runtime credentials point only at destination canonical
  state; bucket private access blocking/versioning remain enabled; source state
  version stayed frozen after production writes.
- Existing real-account browser session opened the staff/requests/dashboard pages;
  demo-company sign-in through the public domain persisted successfully into the
  new bucket. No real attendance/request records were fabricated for testing.
- Application configuration digest (excluding changed AWS credentials, storage
  settings and runtime mode) matched original:
  `149e4753c6ac67f0a47280843eb9fc266d693b0797a65234c39ca1f6360d9e86`.
  This covers public origin, Google OAuth, VAPID and sender settings.
- Temporary user `dawamkom-migration-temporary` access key is now **Inactive**.
  Its roles remain dormant for later reviewed cleanup; the app's separate runtime
  key stays active. Do not rerun copy/audit scripts using the inactive operator
  receipt without an intentional access review.
- SES domain/DKIM and production access still showed PENDING/false at completion.
  All three DKIM CNAMEs resolve correctly through public DNS. Treat email sending
  as a separate pending AWS approval/verification issue; do not alter the other
  project's pending SES application or claim activation mail is fully enabled.
- The former generated preview URL now serves canonical production too. Use the
  normal www domain for work; it is no longer an isolated testing environment.
- Keep both accounts for now. Before rollback, fence destination and reconcile
  its newest canonical state back to source; never resume stale source writes.
