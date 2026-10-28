# Money

A private, single-user money dashboard. About once a month you check in: each account's
balance and the main-job pay you received since last time. Bills are a fixed list. The app
works out everything else (side income minus day-to-day spending) from how your balances grew,
and shows how much extra room you have to spend each day after your savings goal.

SvelteKit 3 + Svelte 5, Supabase (Postgres + Auth), deployed on Vercel.

## How it fits together

- `src/lib/budget.ts` — the engine: pure functions, no Supabase or Svelte. Tested in
  `src/lib/budget.test.ts`.
- `src/lib/server/data.ts` — loads all of your data in one round of queries. The root layout
  loads it once; pages compute from it.
- `src/lib/server/actions.ts` + `src/lib/schemas.ts` — form actions, each validated with Zod.
- `supabase/migrations/` — tables, row level security, `expenses_save_checkin()` (saves a
  check-in and its balances atomically) and `expenses_ensure_settings()`.

All tables and functions are prefixed `expenses_` because the Supabase project is shared with
other apps.

## The math

Between two check-ins:

|                 |                                                               |
| --------------- | ------------------------------------------------------------- |
| Growth          | change in balances of accounts that count toward growth       |
| Bills           | monthly bill total (quarterly ÷ 3, yearly ÷ 12) × days ÷ 30.4 |
| Everything else | growth − main pay + bills                                     |

The headline averages the last ~90 days of check-ins: **extra room per day** = (monthly growth
− savings goal) ÷ 30.4. Positive means you could spend that much more each day; negative means
cut back by that much.

Accounts you skip at a check-in are treated as unchanged. An account's first balance isn't
counted as growth. Investments and a tax reserve usually shouldn't count toward growth
(market swings and money already set aside) — that's a per-account setting.

## Supabase setup

You need one Supabase project. It can be shared with other apps.

1. **Disable sign-ups.** Dashboard → Authentication → Sign In / Providers → turn off
   **Allow new users to sign up**. Nobody else can create an account; the login page has no
   sign-up form.

   > This setting applies to the whole project. If another app on the same project needs
   > public sign-ups, leave it on: RLS still keeps every row private to its owner, but anyone
   > who signs up through another app could then log in here and see an empty dashboard of
   > their own.

2. **Create your user.** Authentication → Users → **Add user** → **Create new user**. Enter
   your email and a password and tick **Auto confirm user**.

3. **Apply the migrations**, oldest first. Either:

   - **CLI** (installed as a dev dependency):

     ```sh
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npm run db:push
     ```

     If another app has pushed migrations to this project with the CLI, `db push` refuses
     because the remote history has migrations it doesn't know about. Use
     `npx supabase db push --include-all`, or use the SQL editor instead.

   - **SQL editor:** paste each file in `supabase/migrations/` into Dashboard → SQL Editor and
     run them oldest first, skipping any you've already run.

4. **Regenerate types** (optional; `src/lib/database.types.ts` is hand-written to match the
   migration):

   ```sh
   npm run db:types
   ```

   This includes other apps' tables in the same schema, which is harmless.

## Environment variables

```
PUBLIC_SUPABASE_URL=https://<project>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

Copy `.env.example` to `.env` for local development. The app never uses a service-role key;
every query runs as the logged-in user so RLS applies.

## Local development

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # budget engine tests
npm run check      # type check
```

## Deploying to Vercel

1. Import the repository in Vercel. The framework preset is detected as SvelteKit and the
   build uses `@sveltejs/adapter-vercel`.
2. Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` under Settings → Environment
   Variables.
3. Deploy, then log in with the user you created.

## First run

The app starts empty. The dashboard walks you through adding accounts and bills and making a
first check-in. Growth and the per-day number appear from your second check-in.
