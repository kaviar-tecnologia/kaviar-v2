# GuardDuty version gate — finance evidence archive (draft, feature OFF)

This change is for **review**, not production enablement. The user reports no live
SumUp/Asaas receipts yet; test data must be fictional.

## States, guarantees and boundaries

- \`RESERVED\`: an audited DB reservation may outlive a failed or uncertain PUT.
- \`STORED_PENDING_SCAN\`: versioned SSE-KMS PUT and S3 HEAD metadata confirmed,
  version ID recorded; **no S3 GetObject** and no full-byte readback.
- A SUPER_ADMIN can explicitly call \`POST /api/admin/finance/monthly-close/evidence/official-archive/:id/check-malware\`.
  The bucket, key and version are loaded from the database, never from the request.
- The check reads \`GuardDutyMalwareScanStatus\` **for that exact version**.
  Missing/unknown status is PENDING, without a content GET. THREATS_FOUND,
  UNSUPPORTED, ACCESS_DENIED or FAILED are terminal and remain blocked.
- Only \`NO_THREATS_FOUND\` permits version-pinned HEAD/GET and full SHA-256
  comparison, followed by another tag check. When verified, status becomes
  \`STORED_UNVERIFIED\`, with separate malware and integrity timestamps.
- Historic \`STORED_UNVERIFIED\` rows from the old workflow have
  \`malware_scan_status=PENDING\` and **are not malware approved**.
- No route serves content or promotes a document to source-verified status.
  SQL still forces \`source_verification=UNVERIFIED\`. No accounting posting,
  zero-revenue certification or final close can follow merely from this scan.

## Infrastructure required BEFORE enabling the feature

The current backend IAM policy grants PutObject/GetObject only. Add the narrowly
scoped \`s3:GetObjectVersion\` and \`s3:GetObjectVersionTagging\` permissions for
objects in the dedicated evidence bucket (and review existing GetObject access),
without DeleteObject, PutObjectTagging or permissions to the uploads bucket.
Retain the dedicated KMS key policy, S3 bucket HTTPS-only deny, block-public-access,
versioning and GuardDuty tagging. Verify the actual S3 permissions with a fictional
versioned KMS object and no user data. A bucket-policy tag-based read deny is an
additional defense to assess, with an exception for the GuardDuty service role;
do not introduce one without verifying the impact on GuardDuty itself.

The feature flag \`FINANCE_OFFICIAL_ARCHIVE_ENABLED\` must remain absent/OFF.
Do not configure it, ship a production migration, use genuine statements or merge
until disposable-DB migration, hermetic tests, IAM review, recovery and incident
handling have been approved. Automatic retry, delete, download and accounting
reconciliation are intentionally out of scope.
