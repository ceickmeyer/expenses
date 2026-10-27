# Money Dashboard — Build Spec for Claude Code

## 1. What this app is

A private, single-user web app for a self-employed tutor and dog walker. Once a month I enter my account balances, what I actually earned from each income source, and what I actually paid in costs (monthly totals only — no per-purchase logging). The app turns that into one clear answer: **how much I can safely spend per day, per week, and per month**, while still covering quarterly taxes, rent, bills, and the summer income dip.

Scope: my income and accounts only (not household). Retirement planning is out of scope.

## 2. Tech stack

- **SvelteKit** with **Svelte 5** (runes: `$state`, `$derived`, `$props`), TypeScript, strict mode.
- **Supabase** (Postgres + Auth) using `@supabase/supabase-js` and `@supabase/ssr` for server-side sessions in SvelteKit.
- **Migrations:** Supabase CLI, SQL files in `supabase/migrations/`. Generate types with `supabase gen types typescript` into `src/lib/database.types.ts`.
- **Hosting: Vercel** with `@sveltejs/adapter-vercel`.
- **Charts:** Chart.js wrapped in a small Svelte component.
- **Validation:** Zod for all form actions.
- **Tests:** Vitest for the budget engine (section 6).
- Plain CSS with custom properties (no UI kit). Light and dark mode via `prefers-color-scheme`.

### Environment variables

```
PUBLIC_SUPABASE_URL=https://<project>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
```

No service-role key in the app.

## 3. Authentication (required — this is personal financial data on a public URL)

- **Supabase Auth, email + password.** I am the only user.
- In the Supabase dashboard: **disable new sign-ups** and create my user manually. Document this in the README.
- `/login` page (email, password, "Log in" button). No sign-up page.
- `hooks.server.ts` creates the Supabase server client per request (`@supabase/ssr` cookie handling), validates the session with `supabase.auth.getUser()`, and redirects every route except `/login` to `/login` when there is no user.
- Logout button in the nav.
- **Row Level Security on every table** (section 4).

## 4. Data model (Postgres)

Conventions:
- Every table has `user_id uuid not null default auth.uid() references auth.users on delete cascade`.
- RLS enabled on every table with one policy for all operations: `using (user_id = auth.uid()) with check (user_id = auth.uid())`.
- All money stored as **integer cents** (`bigint`).
- Months stored as `date` set to the first of the month (e.g. `2026-10-01`).
- `created_at` / `updated_at timestamptz default now()`.

### `accounts`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| name | text | "Checking", "Savings", "Tax reserve" |
| type | text check | `checking` \| `savings` \| `tax_reserve` \| `investment` \| `credit_card` \| `other` |
| counts_toward_spending | boolean | true for checking; false for tax reserve and investments |
| sort_order | int | |
| archived | boolean | default false |

### `balance_snapshots`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| account_id | fk → accounts | |
| month | date | |
| balance_cents | bigint | credit cards entered as negative |
| unique(account_id, month) | | |

### `income_sources`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| name | text | |
| category | text check | `tutoring` \| `dog_walking` \| `other` |
| frequency | text check | `weekly` \| `biweekly` \| `monthly` |
| start_month | date | first month it counts |
| end_month | date null | last month it counts (null = ongoing) |
| sort_order | int | |

Rate and quantity live in `income_source_rates` so changes apply from a given month without rewriting history.

### `income_source_rates`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| income_source_id | fk → income_sources (cascade) | |
| effective_from | date | first month this rate applies |
| rate_cents | bigint | per session / per week |
| quantity | int | number of students/clients at this rate |
| summer_quantity | int | how many continue in reduced weeks (0 = stops) |
| unique(income_source_id, effective_from) | | |

### `cost_items`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| name | text | "Rent", "Phone", "Car insurance" |
| frequency | text check | `monthly` \| `quarterly` \| `annual` \| `one_time` |
| due_month | int null | 1–12; for `annual` (which month it's paid) |
| is_tax | boolean | true for estimated tax payments (drives the tax reserve check) |
| is_variable | boolean | amount changes month to month (e.g. utilities); prefilled with the average of the last 3 actuals instead of the set amount |
| start_month | date | first month it applies; for `one_time`, the month it's paid |
| end_month | date null | last month it applies (null = ongoing) |
| sort_order | int | |

### `cost_item_amounts`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| cost_item_id | fk → cost_items (cascade) | |
| effective_from | date | first month this amount applies |
| amount_cents | bigint | per payment (per month, per quarter, per year, or the one-time amount) |
| unique(cost_item_id, effective_from) | | |

**Resolving an amount for a month:** use the row with the latest `effective_from` ≤ that month. Items are counted only between `start_month` and `end_month`. Nothing is ever hard-deleted once it has actuals; it gets an `end_month` instead.

### `monthly_entries`
| column | type | notes |
|---|---|---|
| id | bigint identity pk | |
| month | date | unique per user |
| discretionary_spent_cents | bigint null | my total spending beyond fixed costs for the month (optional) |
| notes | text | |

### `income_actuals`
`entry_id` fk → monthly_entries (cascade), `income_source_id` fk, `amount_cents bigint`, unique(entry_id, income_source_id).

### `cost_actuals`
`entry_id` fk → monthly_entries (cascade), `cost_item_id` fk, `amount_cents bigint`, unique(entry_id, cost_item_id).

### `monthly_extras`
One-off income or expenses that belong to a single month only (a vet bill, a one-time tutoring workshop).
`entry_id` fk → monthly_entries (cascade), `kind` (`income` \| `cost`), `name text`, `amount_cents bigint`.

### `settings` (one row per user, `user_id` is the pk)
| field | default |
|---|---|
| tutoring_cancellations_per_week | 0 |
| dog_cancellations_per_week | 0 |
| summer_tutoring_hours_per_week | 0 |
| summer_tutoring_rate_cents | 0 |
| monthly_savings_goal_cents | 0 |
| reduced_weeks_by_month | jsonb, all twelve months set to 0 |

`reduced_weeks_by_month` = how many weeks in each month run on the reduced (summer/holiday) schedule, keyed `"01"`–`"12"`. Editable in Settings as 12 number inputs.

### Saving a month
Saving the entry form must write the entry, all income actuals, cost actuals, monthly extras, balance snapshots, and any items or amount changes created from the form **atomically**. Implement as a Postgres function `save_month(payload jsonb)` (`security invoker`, so RLS still applies) called via `supabase.rpc`.

## 5. First run (no preloaded data)

The app starts empty. I enter all of my own accounts, income sources and costs.

- On the first authenticated load, if no `settings` row exists, create one with the neutral defaults from section 4 (`ensure_settings()` RPC). Nothing else is created.
- While accounts, income sources or costs are missing, the dashboard shows a short setup checklist instead of the headline numbers:
  1. Add your accounts
  2. Add your income sources
  3. Add your regular costs
  4. Set your schedule (cancellations, summer hours, reduced weeks) — optional
  5. Enter your first month
  Each item links to its page and shows as done once it has at least one row (item 4 once settings have been saved once).
- Every list page has an empty state that explains what belongs there with one example, e.g. "Add each client or group of students you bill. Example: 10 weekly students at $90."

## 5b. Quick changes (flexibility is a core requirement)

Adding or changing anything should take a few taps and never require leaving the current screen.

**Quick add (available everywhere).** A persistent "Add" button in the nav opens a sheet with three tabs: Expense, Income, Account.
- Expense: name, amount, how often (monthly / quarterly / yearly / one time), starting month (defaults to this month), "changes month to month" toggle, "this is a tax payment" toggle.
- Income: name, category, rate, how often, number of clients, number who continue in summer, starting month.
- Account: name, type, counts toward spending.
- Save → toast "Expense added" → dashboard numbers recalculate immediately.

**Change an amount (rent goes up, a client raises their rate).** On every list row the amount is tap-to-edit. Editing shows "Applies from: [month]" (defaults to this month) and saves a new row in `cost_item_amounts` / `income_source_rates`. Past months keep the old amount. Each row has a small "History" disclosure listing past amounts and dates, where a mistaken change can be removed.

**Stop something (a dog client leaves, a subscription is cancelled).** "Stop after [month]" sets `end_month`. Stopped items move to a collapsed "Ended" group and can be restarted.

**From the monthly entry form:**
- "+ Add expense" and "+ Add income" rows at the bottom of each section. Each new row asks "Just this month" (saved to `monthly_extras`) or "Every month / repeating" (creates a real item starting this month).
- When an actual amount differs from what was expected for a non-variable item, show an inline prompt: "Rent was $1,650, expected $1,500. Use $1,650 from now on?" Accepting adds an amount row effective this month.

**Reordering:** drag to reorder on list pages; order carries through to the entry form.

## 6. Budget engine (`src/lib/budget.ts`) — the core of the app

Pure, framework-free TypeScript functions that take plain data (sources, costs, settings, entries, balances) and return numbers. No Supabase imports. Full Vitest coverage.

### 6.1 Expected weekly income
All amounts below are resolved per month (section 4, "Resolving an amount"), so a rate change or ended item only affects months from that point.

- **Full-schedule week:**
  sum over sources active that month of `rate × quantity × (1 if weekly, 0.5 if biweekly, 12/52.18 if monthly)`
  − `tutoring_cancellations_per_week × average tutoring rate`
  − `dog_cancellations_per_week × average dog rate`.
- **Reduced week:**
  `summer_tutoring_hours_per_week × summer_tutoring_rate`
  + same formula using `summer_quantity` instead of `quantity` for non-tutoring sources
  − dog cancellations as above.

### 6.2 Expected monthly income
`weeksInMonth = daysInMonth / 7`
`expected = (weeksInMonth − reducedWeeks) × fullWeek + reducedWeeks × reducedWeek`

### 6.3 Annual projection (rolling 12 months)
Window = the last 6 entered months plus the next months needed to make 12. Use **actuals** for months with an entry and **expected** values for the rest. Same for costs.

### 6.4 Costs
For each month, expected cost = sum over items active that month of:
- `monthly`: amount.
- `quarterly`: amount ÷ 3 every month (accrued smoothly). Tax items additionally drive section 6.8.
- `annual`: amount ÷ 12 every month for the spending window; the full amount in `due_month` for the set-aside calculation (6.6) so I see it coming.
- `one_time`: full amount in its month.
- Variable items: average of the last 3 actuals, falling back to the set amount.
Actuals replace expected values for months with an entry; `monthly_extras` add to that month's actuals.

### 6.5 The spending window (headline numbers)
```
annualDiscretionary = projectedAnnualIncome
                    − projectedAnnualCosts
                    − monthly_savings_goal × 12

perMonth = annualDiscretionary / 12
perWeek  = annualDiscretionary / 52.18
perDay   = annualDiscretionary / 365
```
This smooths the seasonal swing so I spend the same amount all year.

### 6.6 Seasonal reserve ("Set aside this month")
For each month: `setAside = income − costs − perMonth − savingsGoal`.
- Positive → amount to move into savings to cover leaner months.
- Negative → amount to draw from that reserve.
Also compute the **reserve target**: the largest cumulative drawdown across the next 12 months.

### 6.7 Spending vs window
When `discretionary_spent_cents` is entered for a month, compare it with `perMonth`: "Under by $X" or "Over by $X", plus a 6-month average.

### 6.8 Tax reserve check
- Next due date from Apr 15, Jun 15, Sep 15, Jan 15.
- Months accrued since the last due date × (sum of active `is_tax` quarterly amounts ÷ 3) vs latest balance of the `tax_reserve` account → "On track" or "Short by $X".

### 6.9 Reconciliation
For a month with balances entered for this month and last month:
`expectedChange = actualIncome − actualCosts − discretionary_spent`
`actualChange = Σ balance changes across all non-archived accounts`
Show the difference as "Unaccounted for: $X". If discretionary spent is blank, instead show "Implied spending: $X" (= actualIncome − actualCosts − actualChange), which is my real spending for the month without logging purchases.

### 6.10 Required tests
These use a fixture defined only in `budget.test.ts` (never written to the database): 26 weekly students at $90, one biweekly at $200, one weekly at $75, dog clients at $175/$100/$40/$60 weekly (summer_quantity 1); costs of $6,000 quarterly tax, $1,500 rent, $1,750 bills; 1.5 tutoring and 1 dog cancellation per week; 6.5 summer hours at $90; reduced weeks `{01:1, 03:1, 06:2.5, 07:4.4, 08:2.5, 11:1, 12:2}`, others 0.

- Full-schedule week ≈ **$2,660** (±$15).
- Reduced week ≈ **$866** (±$15).
- Projected annual income with no actuals ≈ **$111,000** (±$3,000).
- perMonth with savings goal 0 falls between **$3,700 and $4,400**.
- A July month produces a negative set-aside; an October month produces a positive one.
- Biweekly and monthly frequencies convert correctly; summer_quantity 0 removes a source in reduced weeks.
- Implied spending is correct for a hand-built two-month example.
- Changing rent to $1,650 effective a future month raises costs from that month only; earlier months are unchanged.
- An income source with `end_month` set stops contributing after that month.
- A $1,200 annual expense adds $100/month to the spending window calculation and appears in full in its due month's set-aside.
- A one-time expense and a `monthly_extras` cost each affect only their own month.

## 7. Pages

### `/` Dashboard
1. **Headline:** "You can spend **$X a day**" as the dominant element, with per-week and per-month beside it in smaller type.
2. **This month:** expected vs actual income and costs, and a "Set aside $X" or "Draw $X from reserve" instruction.
3. **Last month's spending:** entered or implied spending vs the monthly window.
4. **12-month cash flow chart:** bars for income per month (actual solid, expected outlined), a line for total costs, months where income < costs visibly marked.
5. **Balances:** latest balance per account, month-over-month change, total spendable (accounts with `counts_toward_spending`).
6. **Tax reserve status** and next due date.
7. **Seasonal reserve:** savings vs reserve target with a progress bar.
8. Before setup is complete, the setup checklist from section 5 replaces all of the above. Once setup is done but no month is entered: "Enter your first month to see your spending window" with a button to the entry page.

### `/entry/[month]` Monthly entry (the most-used screen — make it fast)
- Month picker defaulting to last month.
- Sections in order: **Balances** (one input per account, prefilled with last month's value), **Income** (one input per source active that month, prefilled with expected, plus "+ Add income"), **Costs** (prefilled with expected, plus "+ Add expense"; see section 5b for the change prompt), **Total spending this month** (optional, with a hint that it will be estimated from balances if left blank), **Notes**.
- Live totals at the top as I type (same budget engine, client-side).
- "Save month" button → toast "Month saved" → redirect to dashboard.
- Tab moves through inputs in order; Enter does not submit mid-form.
- Currency inputs accept "1,500", "1500", "$1,500.00".

### `/history`
Table of all months: income, costs, spending (entered or implied), balance change, unaccounted amount. Click a row to edit.

### `/sources`, `/costs`, `/accounts`
Lists showing each item's current amount and how often, with tap-to-edit amounts, "Applies from" month, amount history, "Stop after", drag to reorder, and an "Add" button at the top (section 5b). Each list shows its monthly total at the top (e.g. "Regular costs: $5,250 a month").

### `/settings`
Cancellation assumptions, summer tutoring hours/rate, savings goal, reduced weeks per month, CSV export of all data.

## 8. Design direction

- A calm, trustworthy personal tool checked once a month and glanced at weekly. Clarity over decoration.
- Pick a deliberate palette (4–6 named colors) and one or two typefaces with a clear type scale; avoid generic SaaS card kits and default color schemes. Tabular numerals for all money.
- Positive/negative money distinguishable by more than color (sign and wording, e.g. "Set aside $1,200" vs "Draw $900").
- Mobile-first: dashboard and entry form comfortable at 375px wide.
- Visible keyboard focus, sufficient contrast, respects `prefers-reduced-motion`.
- Sentence-case copy, plain words: "Spend per day", not "Daily discretionary allocation".

## 9. Project structure

```
src/
  lib/
    budget.ts             # pure engine (section 6)
    budget.test.ts
    money.ts              # cents <-> display helpers, input parsing
    database.types.ts     # generated by supabase CLI
    server/
      data.ts             # typed queries used by load functions/actions
  routes/
    +layout.svelte        # nav, theme
    +layout.server.ts     # session, ensure_settings on first login
    +page.svelte / +page.server.ts   # dashboard
    login/
    entry/[month]/
    history/
    sources/  costs/  accounts/  settings/
  hooks.server.ts         # supabase server client + auth guard
supabase/
  migrations/             # tables, RLS policies, save_month(), ensure_settings()
```

## 10. Build order for Claude Code

1. Scaffold SvelteKit + TypeScript + adapter-vercel; add supabase-js, @supabase/ssr, Zod, Chart.js, Vitest.
2. Write migrations (tables, RLS, `save_month`, `ensure_settings`); apply with `supabase db push`; generate types.
3. Budget engine + tests (section 6.10) — **all tests passing before any UI work.**
4. Auth: hooks, login, logout, route guard, first-login settings row.
5. Accounts, income sources and costs pages with amount history, stop/restart, and the global quick-add sheet.
6. Monthly entry page.
7. Dashboard with setup checklist.
8. History, settings, CSV export.
9. README: Supabase setup (create project, disable sign-ups, create my user, push migrations), Vercel env vars, local dev.

## 11. Done when

- I can log in, enter a month in under two minutes, and see per-day/week/month spending numbers update.
- I can add a new expense from any screen in under 15 seconds, and a rent change applies from the month I choose without altering past months.
- A fresh account starts completely empty and the setup checklist walks me through adding my own data.
- Budget engine tests pass with the test fixture.
- RLS is on for every table; an unauthenticated request returns no data.
- Every page works on a phone and in dark mode.