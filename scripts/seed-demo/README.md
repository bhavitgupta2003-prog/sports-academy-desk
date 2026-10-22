# Demo data for Sports Academy Desk

Fills your own account with realistic, **fictional** data so the app can be shown with a full database: 7 batches, 100 students, about two months of attendance and a varied payment history. Everything goes through the normal app database tables. Nothing in the app is faked: the dashboard, lists and AI Summary read these rows like any others.

## What it creates (as of 22 Oct 2026; dates always follow today's date in India)

| Table | Rows | Notes |
|---|---|---|
| `batches` | 7 | Cricket U-12 and U-16, Football U-14, Badminton Juniors, Tennis Beginners, Swimming Learners, Basketball U-16. The weekly schedule is in the batch name. |
| `students` | 100 | Fictional names, fictional coaches, joined across the last ~7 months, a few with discounted fees. Parent phones look like `00000 00042`: real Indian mobile numbers never start with 0. |
| `attendance` | ~2,175 | The last 61 days on each batch's real weekdays, plus today for some batches. Different students attend at different rates. |
| `fee_payments` | ~490 | UPI, cash and bank transfers, some in instalments. |

Fee balances and statuses are **not stored**. The app works them out from the students and payments with its own fee rules (fee due on the 5th). On 22 Oct 2026 that gives about 69 Paid, 3 Due soon and 28 Overdue, with about Rs 1.0 lakh outstanding.

## How it stays safe

- It **signs in as you** (your email and password) with the same public key the website uses. Row Level Security stays on and every row automatically belongs to you. **No service-role key is used anywhere.**
- Your password is typed in your own terminal. It is held only in memory while the script runs, never printed, saved or committed.
- It **only inserts**, and skips any row that already exists (every demo row has a fixed id). It never updates or deletes your other records. Running it twice on the same day adds nothing.
- Only the real table columns are written. The schema, RLS and authentication are not changed.
- It stops if a demo student's name matches one of your existing students (use `--allow-name-clash` to override).

## How to run it

Run these from the project folder. `npm run seed:demo --` passes the options through.

```bash
# 1. Preview. No network and no password. Safe to run any time.
npm run seed:demo

# 2. Tell the script who you are (type your Supabase password when asked; it is not shown or saved)
export SEED_EMAIL="you@example.com"
read -s "SEED_PASSWORD?Password: "; export SEED_PASSWORD; echo

# 3. Read-only check of your account (writes nothing)
npm run seed:demo -- --check

# 4. Insert the demo data (this writes to your real database)
npm run seed:demo -- --apply --yes

# 5. Forget the password when you are done
unset SEED_PASSWORD SEED_EMAIL
```

(`read -s "VAR?Prompt"` is for zsh, the default macOS shell. In bash use `read -s -p "Password: " SEED_PASSWORD`.)

After `--apply` the script reads the rows back and prints the counts, how many students are linked to a batch, and the fee status mix exactly as the website will show it.

## Removing the demo data

```bash
npm run seed:demo -- --remove-demo          # preview: counts what would be deleted, deletes nothing
npm run seed:demo -- --remove-demo --yes    # deletes ONLY the demo rows
```

It finds the demo rows by their fixed ids, so your own students, batches, attendance and payments are never touched. Notes:

- Anything you add to a *demo student* yourself (a payment, an attendance mark) is deleted along with that student.
- A demo batch is kept if one of your own students has been put in it.
- If you ever need to do it by hand in the Supabase SQL Editor: `delete from students where parent_phone like '00000 %';` removes the demo students and, through the table links, their attendance and payments. Then delete the 7 demo batches in the Table Editor. The script is safer because it matches exact ids, not a pattern.

## Running it again later

- The same day: nothing new is added.
- A later day: students, batches and old payments are skipped, and the newer days of attendance are added.
- To start fresh: `--remove-demo --yes`, then `--apply --yes`.
- Use `--as-of YYYY-MM-DD` only to finish a run that was interrupted, with the same date as the first run. Do not use a date earlier than the first run.

## Files

- `data.ts`: the batches, coaches and name lists.
- `generate.ts`: builds the dataset in memory (no network) and checks it against the schema rules.
- `preview.ts`: the printout used by the dry run.
- `seed.ts`: the command line (`--dry-run`, `--check`, `--apply`, `--remove-demo`).
- `ids.ts`: fixed ids, so reruns and removal find the same rows.
- `*.test.ts`: automated tests (run with `npm test`). They check the data and read the script files for unsafe code. They do not talk to your database.
