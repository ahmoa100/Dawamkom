# Dawamkom account consolidation — preparation

Prepared 2026-11-19. Destination resources have now been provisioned with user
approval. No production traffic has moved.

## Verified scope

| Item | Source | Destination |
|---|---|---|
| AWS account | 840448280787 (eazyabcworld2) | 905106554499 (lasqal / ahmoa100@gmail.com) |
| Region | us-east-1 | us-east-1 |
| Lightsail container | dawamak-test | proposed dawamkom-production |
| Private S3 bucket | dawamkom-private-state-840448280787 | proposed dawamkom-private-state-905106554499 |
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
mode enables outbound delivery and background workers. These controls are local
preparation and have not been deployed to the current live service.

## Remaining work

Target QA; certificate and SES verification; final cutover scheduling and
execution; rollback retention and account-wide source dependency/billing audit.
Production remains in the source account.

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

Pending HTTPS CNAME:
`_c04826e658cbd0612cd46423fdabac9a.www` ->
`_3c8c39e78d0f74ecf01b55eb947f4c33.wzccmgtwzk.acm-validations.aws`.

Pending SES CNAMEs (name `<token>._domainkey`, value `<token>.dkim.amazonses.com`):

- `33pe2fe3xpcpf4slxlbg3zgn4jj3uc23`
- `72hbbwcbpmbe64w6cq4m3hms5lulii4c`
- `akjroyslvpewrynzcdoarnh4ndsmwwcc`

User marked `tabukstep.com` and `steptabuk.com` as no longer needed, for later
cleanup. Do not delete or change renewal settings during this migration.
