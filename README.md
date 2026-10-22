# Sports Academy Desk

A small web portal for sports academy owners and coaches to keep students, attendance and fees in one place, instead of spreadsheets and paper. Built as a hackathon MVP for one academy.

## What it does today

- **Staff login** with email and password (Supabase Auth). Each account sees only its own data.
- **Dashboard:** total students, today's attendance, outstanding fees, a list of students with overdue fees, and quick actions. Every number comes from your own records.
- **Students:** add a student (name, batch, coach, parent contact, monthly fee, joining date), see them in a list, open their details. Warns when another student has the same name, but still lets you save.
- **Fees:** the outstanding balance is worked out from the joining month, the monthly fee and the payments recorded. Staff record payments by hand (cash, UPI, etc.). There is no online payment.
- **Fee status:** every student shows **Paid**, **Due soon** or **Overdue**. Each month's fee is due on the 5th (the joining month: the later of the 5th and the joining day). The list can be searched by name and filtered by batch and fee status.
- **Attendance:** pick a batch and a date, mark each student Present or Absent. Future dates are refused. Student names link to their details page.
- **AI Summary:** one button. The server sends a small summary of the last 30 days (first name + last initial, batch, attendance counts, fee balances; no phone numbers or parent names) to a Google Gemini model through OpenRouter and shows suggested follow-ups next to the facts it used. The AI only suggests; it never changes data and the numbers always come from the app's own calculations.
- **Dates use India time (Asia/Kolkata)** everywhere.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (login + Postgres with Row Level Security) · OpenRouter (model `google/gemini-3.7-flash`, Google-served only) · GitHub · Vercel.

## Run it on your computer

1. Install Node.js (LTS) and git.
2. Install the packages:
   ```bash
   npm install
   ```
3. Create a Supabase project, then in its **SQL Editor** run `supabase/schema.sql` once. Turn off **Authentication → Sign In / Providers → Email → Confirm email** if you want to sign up without email confirmation.
4. Create a file named `.env.local` in the project folder (never commit it) with these three names:

   | Name | What it is | Where to find it |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project address | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public key (safe in the browser; the database rules protect the data) | Same page |
   | `OPENROUTER_API_KEY` | **Secret.** Used only on the server for the AI Summary | Your OpenRouter account |

   `.env.example` lists the same names with no values.
5. Start the app and open http://localhost:3000:
   ```bash
   npm run dev
   ```

## Environment variables by place

| Place | Needs |
|---|---|
| Local development (`.env.local`) | all three |
| Vercel **Production** | all three |
| Vercel **Preview** (branch/pull-request deployments) | all three, if you use previews |

Never give the secret key a `NEXT_PUBLIC_` prefix, and never use Supabase's `service_role` / secret key in this app.

## Checks

```bash
node --test lib/*.test.ts   # automated tests (fee maths, dates, validation, session logic, security rules)
npx tsc --noEmit            # type check
npm run lint                # code style
npm run build               # production build
```

The automated tests check the app's logic and read project files for mistakes (for example, a secret key name in browser code). **They do not test the live Supabase database or the screens in a browser.** Check those by hand (see below).

## Database safety

Every table has Row Level Security: a login can read and change only rows whose `owner_id` is its own. Links between tables (student → batch, attendance/payment → student) also require the same `owner_id`.

- New project: run `supabase/schema.sql`.
- Project created from the first version of the schema: run `supabase/migrations/001_same_account_references.sql` once.
- To check isolation: run `supabase/tests/isolation_check.sql` in the SQL Editor. It uses two made-up users and always rolls itself back, so nothing is saved. Read the PASS / FAIL lines in the message it ends with.

## Deploy (GitHub → Vercel)

1. Push the code to a GitHub repository (secrets stay out because `.env*` is git-ignored).
2. In Vercel choose **Add New → Project**, import the repository (Framework: Next.js).
3. In **Settings → Environment Variables** add the three names above for Production (and Preview if wanted).
4. Deploy. After that, every push to `main` redeploys automatically.
5. Open the site, create an account and try the main screens.

## Known limitations

- **One academy per login.** Data belongs to the account that created it, so a coach with a separate login would see an empty app. Sharing one login works.
- **Sign-up is open** to anyone with the link (each account is isolated). Turn off sign-ups in Supabase if this matters.
- **AI cooldown is only a speed bump.** It is kept in one server's memory (15 seconds per user), so on Vercel it cannot stop a determined person. For a real limit, set a spending cap on the OpenRouter key.
- **AI Summary needs data:** at least one student and some attendance in the last 30 days. Its suggestions can be wrong; the "Facts used" table shows the real numbers.
- No edit or delete for students, batches, attendance or payments yet. No password reset. No notifications of any kind (no WhatsApp, SMS or email), no online payments.
- Fee status uses a fixed due day (the 5th) set by `DUE_DAY` in `lib/fees.ts`.
- The logic is covered by automated tests, but the logged-in screens have only been partly checked in a browser. Click through them by hand after each deploy.
