# Asaas outbound — PR 2 (code only; no deploy or transfer)

## Separation of funds
SumUp receipts/driver wallet are NOT an Asaas cash balance. Every Asaas outbound transaction needs available Asaas funds and an independently approved financial obligation. A submitted transfer is not a completed transfer.

## Inbound event contract
Asaas emits an `id` (stable event id), `event` string, and `transfer` or `bill` object.
Refs: https://docs.asaas.com/docs/webhook-para-transferencias and
https://docs.asaas.com/docs/webhook-para-pague-contas

- `asaas-access-token` must match the private `ASAAS_WEBHOOK_TOKEN`.
- Webhook persists only allowlisted fields (event id/name, provider payout id, status,
  amount and externalReference). Recipient CPF, bank account and Pix key are dropped.
- A PENDING persisted event **must be processed** by the event worker. Only processed
  events are duplicates. Missing payout remains pending/retry/review, never marked paid.
- `TRANSFER_DONE` / `BILL_PAID` require matching provider id AND amount in cents.
- `FAILED` / `CANCELLED`: query provider; if unreachable, not found or ambiguous,
  hold reservation and require manual reconciliation. No release based on webhook alone.
- `BILL_REFUNDED`, `TRANSFER_BLOCKED` and other unsupported events do not create PAID.
- A stale PROCESSING notification is reselected after 15 minutes for recovery.

## Preflight before any provider POST
- `OUTBOUND_PAYMENTS_ENABLED=true`, purpose flag, worker flag and
  `OUTBOUND_PAYMENT_PROVIDER=asaas` must ALL be explicitly set. Defaults remain false.
- `ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED=true` is an independent manual signoff.
- `ASAAS_ACCOUNT_EXPECTED_CNPJ` must explicitly match the intended KAVIAR legal entity.
- Authenticated GET `/v3/myAccount/commercialInfo` must return PJ + expected CNPJ.
- Authenticated GET `/v3/myAccount/status` must return `general=APPROVED`.
- `ASAAS_PAYOUT_TRANSFER_CAPABILITY_CONFIRMED=true` is an **additional manual check**;
  balance or approval alone do NOT prove transfer permission. Check the Asaas account
  permissions operationally. The code does not falsely claim to have an API
  transfer-capability endpoint.
- Real outgoing destination must be verified and AES-GCM decrypted at the worker boundary.
  Never send ciphertext or log a full Pix key/barcode.
- Only Pix CPF/CNPJ and validated bill destinations are currently allowed.
- Unknown transfer lookup uses the documented `dateCreated[ge]/[le]`, `limit`
  and `offset` filters, then compares `externalReference` locally. An incomplete
  scan, multiple matching transfers or amount discrepancy means **manual review**.
  Bills remain blocked without a verified provider id; never join them to Pix transfers.
- `ASAAS_BASE_URL` must be an explicit HTTPS API origin in production
  (e.g. `https://api.asaas.com`). Nonproduction fallback is the official
  `https://api-sandbox.asaas.com`.
- A stale PROCESSING outbox item or existing payout **must not be resubmitted**.
  An HTTP 5xx/timeout/ambiguous response becomes UNKNOWN_SUBMISSION and BLOCKED;
  reconcile the external reference before any retry.
- Duplicate webhook must never cause another ledger payment.

## Checklist before production enablement
- [ ] Review PR tests, typecheck and migrations/schema.
- [ ] Confirm the real Asaas base URL/credentials and receiving entity with finance.
- [ ] Confirm account capability, CNPJ, approver and transaction limits.
- [ ] Confirm webhook token, endpoint routing and worker recovery.
- [ ] Sandbox checks: accepted, completed, rejected, duplicate, delayed, lost and
  out-of-order events, timeout and mismatch of amount/reference/destination.
- [ ] Inspect Asaas statement and KAVIAR ledger together; payouts are not funded
  automatically by SumUp.
- [ ] Arrange explicit separate authorization for any small-value real transfer.
- [ ] Only then plan backend deploy and controlled activation; this PR does neither.

## Outstanding for production rollout
Unsupported refund/reversal events require dedicated accounting handling and manual review.
Automated bank statement import, guaranteed account transfer permission API, definitive
real-money reconciliation and any production payout activation are NOT claimed here.
