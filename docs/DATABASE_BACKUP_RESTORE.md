# Database backup and restore runbook

This is the procedure for backing up and restoring the MIS production database.
It is written to be followed by a person, at a terminal, with time to read it.

**Nothing in this repository takes a production backup on a schedule, and
nothing in it can restore to production.** That is deliberate. The scheduled
backup lives with the database provider, where it survives this repository, the
deploy host, and the person who set it up. The restore side is manual because
every accidental-restore story starts with an automated one.

> **Status as of this release:** the provider-side backup schedule described in
> [§1](#1-provider-side-automated-backups-do-this-first) has **not** been
> verified as configured. It requires a login to the database provider's
> dashboard, which is not available from this repository. Treat §1 as an
> outstanding manual action, not as something already done.

---

## 0. Which provider is this?

The application reads its connection string from the `MONGO_URI` environment
variable and nothing else (`MISBackend/src/config/mongo.js`). The repository
holds no provider-specific configuration, so **the provider cannot be
determined from the code** — you have to look at the value.

On the deploy host (Render → the backend service → Environment), look at the
*scheme and host* of `MONGO_URI` without copying the whole value anywhere:

| What you see | Provider | Backups configured in |
|---|---|---|
| `mongodb+srv://…@*.mongodb.net` | **MongoDB Atlas** | Atlas UI → Backup |
| `mongodb://…@*.compose.direct`, `*.mlab.com`, `*.digitalocean.com`, … | Managed third party | that provider's console |
| `mongodb://…@` a bare IP or your own host | **Self-hosted** | your own cron + `mongodump` |

Atlas is the common case for a `mongodb+srv://` string. Confirm before relying
on §1 — the steps differ per provider and guessing produces a backup schedule
that does not exist.

**Never** paste the connection string into a ticket, a chat message, a commit,
or a shell history file. If it has been exposed, rotate the database user's
password in the provider console and update `MONGO_URI` on the deploy host.

---

## 1. Provider-side automated backups (do this first)

This is the backup that matters. The manual dump in §2 is for a specific
moment — before a migration, before a risky release. It is not a backup
strategy on its own, because it only runs when someone remembers.

### MongoDB Atlas

1. Atlas → your project → **Database** → the cluster → **Backup** tab.
2. Turn on **Cloud Backup** if it is off.
   *On M0/M2/M5 shared tiers Cloud Backup is unavailable.* You must either
   upgrade to M10+ or run §2 on a schedule from a machine you control. There is
   no third option — a shared-tier cluster with nobody running §2 has no
   backups at all.
3. Edit the **Backup Policy** to match the retention in §1.1.
4. Enable **Point-in-Time Restore** (M10+) if the tier offers it. It turns "we
   lost today's orders" from a day of lost work into minutes of it.
5. Screenshot the finished policy screen and attach it to the release ticket.
   That screenshot is the evidence the schedule exists; "someone set it up" is
   not.

### Self-hosted / other providers

Run `MISBackend/scripts/backup-mongo.sh` (§2) from cron on a host that is *not*
the database host, writing to storage that is *not* the database's disk. A
backup on the same disk as the database does not survive the failure it exists
for.

### 1.1 Retention recommendation

Sized for a business whose data loss is measured in orders and payments, where
an error can go unnoticed for weeks:

| Cadence | Keep for | Answers |
|---|---|---|
| Hourly snapshot (or PIT window) | 48 hours | "the last deploy corrupted something an hour ago" |
| Daily | 35 days | "this customer's ledger has been wrong since some day last month" |
| Weekly | 12 weeks | "the reconciliation from the quarter looks wrong" |
| Monthly | 12 months | year-end and statutory questions |

The daily tier is the one to argue up rather than down. Silent data problems —
a bad import, a mis-scoped update — are usually found long after the day they
happened, and a 7-day window routinely expires before anyone notices.

Keep at least one copy outside the provider account. A backup that only exists
inside the account that can be lost, suspended, or billed into suspension is
not an independent copy.

---

## 2. Manual backup with `mongodump`

Use before a schema migration, a bulk edit, or a risky release.

### Prerequisites

- **MongoDB Database Tools** installed (`mongodump --version` works).
  <https://www.mongodb.com/docs/database-tools/installation/>
- A database user with read access on the databases being dumped.
- Free disk space of roughly the database's storage size.

### Run it

```bash
cd MISBackend

# Type the URI into this shell only. `read -rs` keeps it off the screen and out
# of your shell history — do NOT use `export MONGO_URI=mongodb+srv://...`
# inline, which lands verbatim in ~/.bash_history.
read -rs MONGO_URI && export MONGO_URI

npm run backup:db          # or: ./scripts/backup-mongo.sh
```

The script writes `backups/mis-<UTC timestamp>.archive.gz` in the repository
root. That directory is in `.gitignore`, along with `*.archive`, `*.archive.gz`
and `*.bson` — **a dump must never be committed or pushed.** It is the entire
customer database in one file.

Close the shell when you are done, or `unset MONGO_URI`.

What the script does and does not do:

- Reads `MONGO_URI` **only** from the environment; there is no flag or file to
  pass it another way.
- Never prints the URI. It is passed to `mongodump` through a private temporary
  config file rather than as a command-line argument, because arguments are
  visible to every user on the machine via `ps`.
- Refuses to run — with a distinct exit code — if `MONGO_URI` is unset (`2`),
  if `mongodump` is missing (`3`), if the backup directory is not writable
  (`4`), or if the dump fails or produces an empty file (`5`).
- Deletes a partial archive if the dump fails, so a directory listing never
  shows a truncated file that looks like a real backup.
- Has no restore mode and contains no `--drop`.

### Off-machine copy

An archive on your laptop is not a backup. Copy it to the same storage the
provider backups go to, verify the copy's size and checksum, then remove the
local file.

---

## 3. Restoring — into an isolated test database first, always

**Never restore into the production database as a first step.** Not to "check
something", not when the archive is definitely fine. A restore is the one
operation that destroys the thing you are trying to protect, and it is
routinely run in the panic immediately after something has already gone wrong.

Every restore starts here, without exception:

```bash
# A LOCAL database with a name that could not be mistaken for production.
mongorestore \
  --uri="mongodb://localhost:27017" \
  --nsFrom='<sourceDb>.*' --nsTo='mis_restore_test.*' \
  --archive=backups/mis-<timestamp>.archive.gz --gzip
```

Rules for this step:

- The target is a **local or throwaway** cluster. Never the production URI.
- Use a target database name that is obviously not production
  (`mis_restore_test`).
- Do **not** use `--drop` here. You are inspecting an archive, not replacing
  anything.
- Find `<sourceDb>` with `mongorestore --archive=… --gzip --dryRun -v`.

### 3.1 Verification checklist

Work through all of it before the archive counts as verified. An unrestored
backup is a hypothesis.

- [ ] `mongorestore` finished with no errors and a non-zero document count.
- [ ] Collection count matches production's order of magnitude.
- [ ] **Users** — count is plausible; a known user exists; `Password` values are
      hashed, not plaintext.
- [ ] **Attendance** — records exist for the expected recent dates.
- [ ] **Orders** — the most recent order predates the backup by minutes, not
      days. A stale newest record means the archive is older than its filename.
- [ ] **Transactions** — spot-check one customer's ledger against a known
      balance.
- [ ] **Responsibilities** — the P1–P4 chains and Backup 1–4 slots are
      populated as configured.
- [ ] Point the backend at the restored database
      (`MONGO_URI=…/mis_restore_test npm start`) and confirm login, an order
      list, and Team Operations all load.
- [ ] Record the archive timestamp, who verified it, and the date, on the
      release ticket.

### 3.2 Restore drill

Do this **quarterly**, on a schedule, when nothing is wrong. A backup procedure
that has never been executed is a plan, not a capability, and the first
execution should not be during an outage. Run §3 end-to-end against the latest
archive and tick §3.1. Record the date and the time it took — the elapsed time
is your real recovery-time estimate.

---

## 4. Production restore — approval checklist

Only after §3 has passed **on the exact archive you intend to restore**.

A production restore discards every write made between the archive's timestamp
and now. Orders taken this morning, payments recorded an hour ago: gone. Know
that number before you start.

- [ ] The archive has been restored to an isolated database and passed §3.1.
- [ ] The data loss window is written down and **accepted in writing** by the
      business owner. Not implied, not assumed — written.
- [ ] A **fresh backup of the current, broken production database** has been
      taken and verified (§2 + §3). The current state may be damaged, but it is
      the only copy of everything written since the archive, and a restore
      overwrites it permanently.
- [ ] The maintenance window is agreed and staff are told to stop entering
      data — a write during the restore is lost silently.
- [ ] The backend is stopped or in maintenance mode, so nothing writes mid-restore.
- [ ] Someone other than the operator is present to read the commands back.
- [ ] The rollback plan (§5) has been read *before* starting.
- [ ] The exact `mongorestore` command has been written out and checked by both
      people — specifically that `--uri` is the intended target.

Prefer the provider's own restore (Atlas → Backup → Restore) over
`mongorestore --drop` where it is available. It is transactional, it is
logged, and it does not depend on a correctly typed URI at 2am.

If you must use the CLI, restore into a **new database name** and switch
`MONGO_URI` to it, rather than dropping and overwriting the live one. The old
database then still exists if the restore turns out to be wrong, and switching
back is an environment-variable change instead of another restore.

---

## 5. Rollback

**If the restore has not started:** stop. Nothing has changed. Re-plan.

**If the restore is running:** let it finish. Interrupting `mongorestore`
leaves a half-restored database that is worse than either state — some
collections new, some old, referential integrity broken.

**If the restore finished and is wrong:**

1. Do not restore again immediately. A second panicked restore is how the
   pre-restore backup gets overwritten too.
2. Put the backend in maintenance mode so nothing writes to the wrong data.
3. If you restored into a new database name (recommended above), roll back by
   pointing `MONGO_URI` at the previous database and redeploying. This is fast
   and loses nothing.
4. If you overwrote the live database, restore the **pre-restore backup** taken
   in §4 into a new database, verify it with §3.1, then point `MONGO_URI` at it.
5. Only once the application is serving correct data, work out what went wrong.

**Recovering data written during the wrong window:** if orders or payments were
entered against the wrong dataset, export those collections from it before
switching away. They are usually reconcilable by hand afterwards, but only if
they still exist.

---

## 6. What this repository does *not* do

Stated so nobody assumes otherwise:

- No automated production backup runs from this repository or its CI.
- No command here can restore to production.
- No credentials for the database are stored in this repository.
- The provider-side schedule in §1 is **not** configured by deploying this
  code. Someone has to open the provider console and do it.
