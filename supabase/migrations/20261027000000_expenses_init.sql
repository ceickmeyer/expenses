-- Money dashboard schema. All money is integer cents; months are dates on the 1st.

create or replace function public.expenses_set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

-- accounts ---------------------------------------------------------------

create table public.expenses_accounts (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	name text not null check (length(trim(name)) > 0),
	type text not null check (type in ('checking', 'savings', 'tax_reserve', 'investment', 'credit_card', 'other')),
	counts_toward_spending boolean not null default false,
	sort_order int not null default 0,
	archived boolean not null default false,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create table public.expenses_balance_snapshots (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	account_id bigint not null references public.expenses_accounts on delete cascade,
	month date not null check (extract(day from month) = 1),
	balance_cents bigint not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (account_id, month)
);

-- income -----------------------------------------------------------------

create table public.expenses_income_sources (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	name text not null check (length(trim(name)) > 0),
	category text not null check (category in ('tutoring', 'dog_walking', 'other')),
	frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
	start_month date not null check (extract(day from start_month) = 1),
	end_month date check (extract(day from end_month) = 1),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (end_month is null or end_month >= start_month)
);

create table public.expenses_income_source_rates (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	income_source_id bigint not null references public.expenses_income_sources on delete cascade,
	effective_from date not null check (extract(day from effective_from) = 1),
	rate_cents bigint not null check (rate_cents >= 0),
	quantity int not null default 1 check (quantity >= 0),
	summer_quantity int not null default 0 check (summer_quantity >= 0),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (income_source_id, effective_from)
);

-- costs ------------------------------------------------------------------

create table public.expenses_cost_items (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	name text not null check (length(trim(name)) > 0),
	frequency text not null check (frequency in ('monthly', 'quarterly', 'annual', 'one_time')),
	due_month int check (due_month between 1 and 12),
	is_tax boolean not null default false,
	is_variable boolean not null default false,
	start_month date not null check (extract(day from start_month) = 1),
	end_month date check (extract(day from end_month) = 1),
	sort_order int not null default 0,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	check (end_month is null or end_month >= start_month)
);

create table public.expenses_cost_item_amounts (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	cost_item_id bigint not null references public.expenses_cost_items on delete cascade,
	effective_from date not null check (extract(day from effective_from) = 1),
	amount_cents bigint not null check (amount_cents >= 0),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (cost_item_id, effective_from)
);

-- monthly entries --------------------------------------------------------

create table public.expenses_monthly_entries (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	month date not null check (extract(day from month) = 1),
	discretionary_spent_cents bigint,
	notes text not null default '',
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (user_id, month)
);

create table public.expenses_income_actuals (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	entry_id bigint not null references public.expenses_monthly_entries on delete cascade,
	income_source_id bigint not null references public.expenses_income_sources on delete restrict,
	amount_cents bigint not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (entry_id, income_source_id)
);

create table public.expenses_cost_actuals (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	entry_id bigint not null references public.expenses_monthly_entries on delete cascade,
	cost_item_id bigint not null references public.expenses_cost_items on delete restrict,
	amount_cents bigint not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now(),
	unique (entry_id, cost_item_id)
);

create table public.expenses_monthly_extras (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references auth.users on delete cascade,
	entry_id bigint not null references public.expenses_monthly_entries on delete cascade,
	kind text not null check (kind in ('income', 'cost')),
	name text not null check (length(trim(name)) > 0),
	amount_cents bigint not null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- settings ---------------------------------------------------------------

create table public.expenses_settings (
	user_id uuid primary key default auth.uid() references auth.users on delete cascade,
	tutoring_cancellations_per_week numeric not null default 0 check (tutoring_cancellations_per_week >= 0),
	dog_cancellations_per_week numeric not null default 0 check (dog_cancellations_per_week >= 0),
	summer_tutoring_hours_per_week numeric not null default 0 check (summer_tutoring_hours_per_week >= 0),
	summer_tutoring_rate_cents bigint not null default 0 check (summer_tutoring_rate_cents >= 0),
	monthly_savings_goal_cents bigint not null default 0 check (monthly_savings_goal_cents >= 0),
	reduced_weeks_by_month jsonb not null default
		'{"01":0,"02":0,"03":0,"04":0,"05":0,"06":0,"07":0,"08":0,"09":0,"10":0,"11":0,"12":0}'::jsonb,
	-- Set the first time settings are saved from the settings page (setup checklist item 4).
	configured_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- indexes for foreign keys and per-user lookups ----------------------------

create index on public.expenses_accounts (user_id);
create index on public.expenses_balance_snapshots (user_id, month);
create index on public.expenses_income_sources (user_id);
create index on public.expenses_income_source_rates (income_source_id);
create index on public.expenses_cost_items (user_id);
create index on public.expenses_cost_item_amounts (cost_item_id);
create index on public.expenses_income_actuals (income_source_id);
create index on public.expenses_cost_actuals (cost_item_id);
create index on public.expenses_monthly_extras (entry_id);

-- updated_at triggers + RLS ----------------------------------------------

do $$
declare
	t text;
begin
	foreach t in array array[
		'expenses_accounts', 'expenses_balance_snapshots', 'expenses_income_sources', 'expenses_income_source_rates',
		'expenses_cost_items', 'expenses_cost_item_amounts', 'expenses_monthly_entries', 'expenses_income_actuals',
		'expenses_cost_actuals', 'expenses_monthly_extras', 'expenses_settings'
	]
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

-- expenses_ensure_settings(): create the settings row on first login --------------

create or replace function public.expenses_ensure_settings()
returns public.expenses_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
	result public.expenses_settings;
begin
	if auth.uid() is null then
		raise exception 'Not authenticated';
	end if;

	insert into public.expenses_settings (user_id) values (auth.uid())
	on conflict (user_id) do nothing;

	select * into result from public.expenses_settings where user_id = auth.uid();
	return result;
end;
$$;

-- expenses_save_month(payload): write a whole month atomically ----------------------
--
-- payload = {
--   month: 'YYYY-MM-01',
--   discretionary_spent_cents: int | null,
--   notes: text,
--   balances:  [{ account_id, balance_cents }],
--   income:    [{ income_source_id, amount_cents }],
--   costs:     [{ cost_item_id, amount_cents }],
--   extras:    [{ kind: 'income'|'cost', name, amount_cents }],
--   cost_amount_changes: [{ cost_item_id, amount_cents }],   -- "use from now on", effective this month
--   new_income_sources:  [{ name, category, frequency, rate_cents, quantity, summer_quantity, amount_cents }],
--   new_cost_items:      [{ name, frequency, due_month, is_tax, is_variable, amount_cents }]
-- }
-- Actuals and extras for the month are replaced, not merged. Returns the entry id.

create or replace function public.expenses_save_month(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_month date := (payload->>'month')::date;
	v_entry_id bigint;
	v_new_id bigint;
	v_sort int;
	item jsonb;
begin
	if auth.uid() is null then
		raise exception 'Not authenticated';
	end if;
	if v_month is null or extract(day from v_month) <> 1 then
		raise exception 'month must be the first day of a month';
	end if;

	insert into public.expenses_monthly_entries (month, discretionary_spent_cents, notes)
	values (
		v_month,
		(payload->>'discretionary_spent_cents')::bigint,
		coalesce(payload->>'notes', '')
	)
	on conflict (user_id, month) do update
		set discretionary_spent_cents = excluded.discretionary_spent_cents,
			notes = excluded.notes
	returning id into v_entry_id;

	delete from public.expenses_income_actuals where entry_id = v_entry_id;
	delete from public.expenses_cost_actuals where entry_id = v_entry_id;
	delete from public.expenses_monthly_extras where entry_id = v_entry_id;

	for item in select * from jsonb_array_elements(coalesce(payload->'balances', '[]'::jsonb))
	loop
		insert into public.expenses_balance_snapshots (account_id, month, balance_cents)
		values ((item->>'account_id')::bigint, v_month, (item->>'balance_cents')::bigint)
		on conflict (account_id, month) do update set balance_cents = excluded.balance_cents;
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'income', '[]'::jsonb))
	loop
		insert into public.expenses_income_actuals (entry_id, income_source_id, amount_cents)
		values (v_entry_id, (item->>'income_source_id')::bigint, (item->>'amount_cents')::bigint);
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'costs', '[]'::jsonb))
	loop
		insert into public.expenses_cost_actuals (entry_id, cost_item_id, amount_cents)
		values (v_entry_id, (item->>'cost_item_id')::bigint, (item->>'amount_cents')::bigint);
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'extras', '[]'::jsonb))
	loop
		insert into public.expenses_monthly_extras (entry_id, kind, name, amount_cents)
		values (v_entry_id, item->>'kind', item->>'name', (item->>'amount_cents')::bigint);
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'cost_amount_changes', '[]'::jsonb))
	loop
		insert into public.expenses_cost_item_amounts (cost_item_id, effective_from, amount_cents)
		values ((item->>'cost_item_id')::bigint, v_month, (item->>'amount_cents')::bigint)
		on conflict (cost_item_id, effective_from) do update set amount_cents = excluded.amount_cents;
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'new_income_sources', '[]'::jsonb))
	loop
		select coalesce(max(sort_order), -1) + 1 into v_sort from public.expenses_income_sources;

		insert into public.expenses_income_sources (name, category, frequency, start_month, sort_order)
		values (item->>'name', item->>'category', item->>'frequency', v_month, v_sort)
		returning id into v_new_id;

		insert into public.expenses_income_source_rates (income_source_id, effective_from, rate_cents, quantity, summer_quantity)
		values (
			v_new_id, v_month,
			(item->>'rate_cents')::bigint,
			coalesce((item->>'quantity')::int, 1),
			coalesce((item->>'summer_quantity')::int, 0)
		);

		insert into public.expenses_income_actuals (entry_id, income_source_id, amount_cents)
		values (v_entry_id, v_new_id, (item->>'amount_cents')::bigint);
	end loop;

	for item in select * from jsonb_array_elements(coalesce(payload->'new_cost_items', '[]'::jsonb))
	loop
		select coalesce(max(sort_order), -1) + 1 into v_sort from public.expenses_cost_items;

		insert into public.expenses_cost_items (name, frequency, due_month, is_tax, is_variable, start_month, sort_order)
		values (
			item->>'name', item->>'frequency',
			case when item->>'frequency' = 'annual'
				then coalesce((item->>'due_month')::int, extract(month from v_month)::int) end,
			coalesce((item->>'is_tax')::boolean, false),
			coalesce((item->>'is_variable')::boolean, false),
			v_month, v_sort
		)
		returning id into v_new_id;

		insert into public.expenses_cost_item_amounts (cost_item_id, effective_from, amount_cents)
		values (v_new_id, v_month, (item->>'amount_cents')::bigint);

		insert into public.expenses_cost_actuals (entry_id, cost_item_id, amount_cents)
		values (v_entry_id, v_new_id, (item->>'amount_cents')::bigint);
	end loop;

	return v_entry_id;
end;
$$;

-- Lock functions down to signed-in users.
revoke execute on function public.expenses_ensure_settings() from public, anon;
revoke execute on function public.expenses_save_month(jsonb) from public, anon;
grant execute on function public.expenses_ensure_settings() to authenticated;
grant execute on function public.expenses_save_month(jsonb) to authenticated;
