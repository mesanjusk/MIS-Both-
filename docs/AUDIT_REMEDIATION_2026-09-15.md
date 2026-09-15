# Remediation of the 15 September 2026 audit

Tracks what was fixed in code, what must be run against the database, and
what only you can do.

Each finding below was verified against the code at `50d00715` before any
change was made. All twenty held.

## What still needs a person

These three cannot be fixed by changing code.

### 1. Rotate the exposed MongoDB credential — do this first

`AUDIT_REPORT_2026-07-21.md:18` contains a full connection string with a real
username and password. The application code was cleaned earlier, but this copy
remained, and the credential has been in git history since `65f7ba7`.

**Deleting the file does not help.** Anyone who has ever cloned the repository
still has the credential. Rotation at the provider is the only fix.

1. Change the password for that database user in MongoDB Atlas.
2. Update `MONGO_URI` in the Render environment.
3. Redeploy so the new secret is picked up.
4. Review Atlas access logs for connections you do not recognise.
5. Then remove the literal from the document, and turn on secret scanning so
   the next one is caught at push time.

Do not paste the old credential into an issue, a commit message, or a new
report while doing this.

### 18. Verify backups, and install indexes on the deployed database

`docs/DATABASE_BACKUP_RESTORE.md` says provider-side scheduled backups have
never been verified. An unverified backup is not a backup.

- Restore the most recent backup into a scratch database and confirm the data
  is there and readable. Until that has been done once, assume you cannot
  recover.
- Production runs with `autoIndex` disabled and does not call `syncIndexes`,
  so an index declared in a schema does **not** exist on the server. Run the
  index script below.
- The server begins listening outside the awaited database connection, and the
  health endpoint does not report database readiness — so a green health check
  does not mean the application can serve traffic. Splitting liveness from
  readiness is worth doing and is not included here.
- A hardcoded accounting data migration still runs at startup, outside any
  feature toggle. It belongs in a versioned migration, not in the boot path.

### 20. Multi-tenant isolation, if you intend to onboard other businesses

Customers, orders, users, accounts and transactions share collections and are
queried globally, with no tenant discriminator. The business profile and Drive
settings are global too. This is a single-business system, and it serves your
agency correctly as one.

It is not safe to put another company's data in the same database and
application instance. Doing that needs a tenant key on every record, scoped
uniqueness, separated file storage, and tests that prove one tenant cannot read
another. That is a project, not a patch — decide whether you want it before
promising anyone a login.

## Run these against the database after deploying

Both report by default and write only with `--apply`. **Take a backup first.**

```bash
cd MISBackend

# What balances are wrong, and by how much.
node scripts/reconcile-account-balances.js

# Correct them.
node scripts/reconcile-account-balances.js --apply

# Indexes that production cannot create for itself (autoIndex is off):
# the Event_key duplicate guard, plus TTL indexes for shared links and
# OAuth state.
node scripts/create-accounting-indexes.js
node scripts/create-accounting-indexes.js --apply
```

The reconciliation is not optional. Editing and deleting transactions has been
drifting stored balances away from the journal for as long as those routes have
existed; the code no longer drifts, but it does not retroactively repair what
already did.

## Fixed in code

| # | Finding | What changed |
|---|---|---|
| 2 | Financial routes had no permission checks | Reads need `canViewAccounts`; posting, editing and deleting are separate permissions. `Created_by` comes from the session. Mutations are recorded in an append-only audit trail. |
| 3 | Editing and deleting corrupted balances | Movements net the old journal out and the new one in over one write. Deletes reverse. Failures are logged and reported, not swallowed. |
| 4 | Journal validation accepted invalid types | Every line must name a debit or credit side; a journal needs both; totals are derived from the validated lines, not trusted from the request. |
| 5 | OAuth callbacks lacked verified state | State is server-issued, scoped to one flow, and redeemable once. Starting the Drive flow needs an admin. |
| 6 | Deleted or demoted users kept access | Every token is checked against its account. Roles come from the current record. A password or role change ends existing sessions. |
| 7 | WhatsApp broadcast to every socket | Events go to permission-scoped rooms. A sweep disconnects revoked sessions. |
| 8 | Shared documents trusted client data | Payee and store identity come from the business profile; receipt figures from the transaction. Expired and withdrawn links return 410. |
| 9 | Stock consumption could race | The claim is conditional on the quantity that was read. A failed stock movement returns the quantity. |
| 10 | Numbering and duplicate guards not atomic | One shared allocator. Postings that must happen once carry a unique `Event_key`. |
| 11 | Webhook acknowledged before processing | Deliveries are recorded before the 200, processed from the stored payload, and retried by a sweep. |
| 12 | Scheduled jobs could duplicate or lose work | Scheduled messages are claimed atomically with a lease. Daily jobs claim their own day with a conditional update. |
| 13 | Uploads could exhaust memory | Per-file, file-count and whole-request limits; receipts restricted to images. |
| 14 | Local development retried against production | The cross-environment retry is gone. |
| 15 | Sanitizer ran before body parsing | It runs after; `rawBody` is still captured for webhook signatures. |
| 16 | Attendance identity and timezone | Staff act on themselves, managers on their staff. One Asia/Kolkata business-day definition across the attendance code. |
| 17 | Sensitive actions needed authorization | Gmail connect/disconnect needs an admin; sending mail and Drive mutations need their own permissions. |
| 19 | Rate limiting keyed badly | Route buckets instead of literal paths, IPv6 keyed by /64, `trust proxy` configured. |

## Known limits of this work

- Nine backend suites need a real MongoDB, which the environment these changes
  were written in could not download. They run in CI, which is the gate that
  matters for them.
- Socket payloads were scoped to permitted rooms but not trimmed; the room is
  what decides who receives a message.
- Daily jobs are at-most-once. A job that fails partway has already messaged
  some employees, so it is not retried automatically — the failure is logged
  for a person to act on. Exactly-once would need per-recipient delivery state.
- Invoice line items and totals are still built by the client. The payee, store
  identity and receipt figures are not, which is where the money risk was.
