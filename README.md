# Money

A private, single-user dashboard for self-employed income. Once a month you enter account
balances, what each income source paid, and what your costs were. The app works out how much
you can safely spend per day, week and month while covering quarterly taxes, bills and the
summer income dip.

SvelteKit 3 + Svelte 5, Supabase (Postgres + Auth), deployed on Vercel.

## How it fits together

- `src/lib/budget.ts` — the budget engine: pure functions, no Supabase or Svelte. Tested in
  `src/lib/budget.test.ts`.
- `src/lib/server/data.ts` — loads all of your data in one round of queries and maps it to
  engine types. The root layout loads it once; pages compute from it.
- `src/lib/server/actions.ts` + `src/lib/schemas.ts` — form actions, each validated with Zod.
- `supabase/migrations/` — tables, row level security, `expenses_save_month()` (saves a whole
  month atomically) and `expenses_ensure_settings()`.

All tables and functions are prefixed `expenses_` because the Supabase project is shared with
other apps.

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

3. **Apply the migration.** Either:

   - **CLI** (installed as a dev dependency):

     ```sh
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npm run db:push
     ```

     If another app has pushed migrations to this project with the CLI, `db push` refuses
     because the remote history has migrations it doesn't know about. Use
     `npx supabase db push --include-all`, or use the SQL editor instead.

   - **SQL editor:** paste `supabase/migrations/20261027000000_expenses_init.sql` into
     Dashboard → SQL Editor and run it.

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

The app starts empty. The dashboard shows a checklist until you've added accounts, income
sources and costs; after that it asks you to enter your first month. Every list page explains
what belongs on it.
