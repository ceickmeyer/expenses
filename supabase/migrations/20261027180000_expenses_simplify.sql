-- Simplify to check-ins + bills.
--
-- A check-in is a date, each account's balance on that date, and main-job pay received since
-- the previous check-in. Bills are a plain list subtracted automatically. Everything else
-- (side income minus day-to-day spending) is worked out from balance growth.
--
-- Carries over existing data: entries and balance snapshots become check-ins with balances,
-- and regular costs become bills at their latest amount. Per-client income, cost actuals and
-- one-off extras are dropped.

-- New tables ---------------------------------------------------------------------------

create table public.expenses_checkins (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	checkin_date date not null,
	main_income_cents bigint not null default 0 check (main_income_cents >= 0),
	notes text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, checkin_date)
);

create table public.expenses_balances (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	checkin_id bigint not null references public.expenses_checkins on delete cascade,
	account_id bigint not null references public.expenses_accounts on delete cascade,
	balance_cents bigint not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (checkin_id, account_id)
);

create table public.expenses_bills (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	name text not null check (length(trim(name)) > 0),
	amount_cents bigint not null check (amount_cents >= 0),
	frequency text not null check (frequency in ('monthly', 'quarterly', 'annual')),
	is_tax boolean not null default false,
	sort_order int not null default 0,
	archived boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index on public.expenses_checkins (user_id, checkin_date);
create index on public.expenses_balances (checkin_id);
create index on public.expenses_balances (account_id);
create index on public.expenses_bills (user_id);

do $$
declare
	t text;
begin
	foreach t in array array['expenses_checkins', 'expenses_balances', 'expenses_bills']
	loop
		execute format(
			'create trigger set_updated_at before update on public.%I
			 for each row execute function public.expenses_set_updated_at()', t);
		execute format('alter table public.%I enable row level security', t);
		execute format(
			'create policy "Owner has full access" on public.%I for all to authenticated
			 using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
	end loop;
end;
$$;

-- Carry over existing data ---------------------------------------------------------------

insert into public.expenses_checkins (user_id, checkin_date, notes)
select user_id, d, coalesce(max(notes), '')
from (
	select user_id, entry_date as d, notes from public.expenses_entries
	union all
	select user_id, as_of as d, null from public.expenses_balance_snapshots
) dates
group by user_id, d;

insert into public.expenses_balances (user_id, checkin_id, account_id, balance_cents)
select s.user_id, c.id, s.account_id, s.balance_cents
from public.expenses_balance_snapshots s
join public.expenses_checkins c on c.user_id = s.user_id and c.checkin_date = s.as_of;

insert into public.expenses_bills (user_id, name, amount_cents, frequency, is_tax, sort_order, archived)
select
	i.user_id, i.name,
	coalesce((
		select a.amount_cents from public.expenses_cost_item_amounts a
		where a.cost_item_id = i.id
		order by a.effective_from desc limit 1
	), 0),
	i.frequency, i.is_tax, i.sort_order,
	i.end_month is not null and i.end_month < date_trunc('month', now())::date
from public.expenses_cost_items i
where i.frequency in ('monthly', 'quarterly', 'annual');

-- Remove the old model ---------------------------------------------------------------------

drop function if exists public.expenses_save_entry(jsonb);

drop table public.expenses_income_actuals;
drop table public.expenses_cost_actuals;
drop table public.expenses_monthly_extras;
drop table public.expenses_entries;
drop table public.expenses_income_source_rates;
drop table public.expenses_income_sources;
drop table public.expenses_cost_item_amounts;
drop table public.expenses_cost_items;
drop table public.expenses_balance_snapshots;

alter table public.expenses_settings
	drop column tutoring_cancellations_per_week,
	drop column dog_cancellations_per_week,
	drop column summer_tutoring_hours_per_week,
	drop column summer_tutoring_rate_cents,
	drop column reduced_weeks_by_month,
	drop column configured_at;

-- expenses_save_checkin(payload): write a check-in and its balances atomically -------------
--
-- payload = {
--   date: 'YYYY-MM-DD',
--   main_income_cents: int,      -- main-job pay received since the previous check-in
--   notes: text,
--   balances: [{ account_id, balance_cents }]
-- }
-- Balances for the check-in are replaced, not merged. Returns the check-in id.

create or replace function public.expenses_save_checkin(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_id bigint;
	item jsonb;
begin
	if auth.uid() is null then
		raise exception 'Not authenticated';
	end if;
	if (payload->>'date') is null then
		raise exception 'date is required';
	end if;

	insert into public.expenses_checkins (checkin_date, main_income_cents, notes)
	values (
		(payload->>'date')::date,
		coalesce((payload->>'main_income_cents')::bigint, 0),
		coalesce(payload->>'notes', '')
	)
	on conflict (user_id, checkin_date) do update
		set main_income_cents = excluded.main_income_cents,
			notes = excluded.notes
	returning id into v_id;

	delete from public.expenses_balances where checkin_id = v_id;

	for item in select * from jsonb_array_elements(coalesce(payload->'balances', '[]'::jsonb))
	loop
		insert into public.expenses_balances (checkin_id, account_id, balance_cents)
		values (v_id, (item->>'account_id')::bigint, (item->>'balance_cents')::bigint);
	end loop;

	return v_id;
end;
$$;

revoke execute on function public.expenses_save_checkin(jsonb) from public, anon;
grant execute on function public.expenses_save_checkin(jsonb) to authenticated;
