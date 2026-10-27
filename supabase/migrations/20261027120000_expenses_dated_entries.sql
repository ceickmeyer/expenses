-- Entries are dated check-ins instead of whole months. An entry records balances as of its
-- date, plus income and costs since the previous entry.
--
-- Existing month entries move to the last day of their month, so they keep meaning
-- "everything in that month". Balance snapshots move with them.

alter table public.expenses_monthly_entries rename to expenses_entries;
alter table public.expenses_entries rename column month to entry_date;
alter table public.expenses_balance_snapshots rename column month to as_of;

-- Drop the "must be the 1st of a month" checks on those two columns, whatever they're named.
do $$
declare
	c record;
begin
	for c in
		select conrelid::regclass as tbl, conname
		from pg_constraint
		where contype = 'c'
			and conrelid in ('public.expenses_entries'::regclass, 'public.expenses_balance_snapshots'::regclass)
			and pg_get_constraintdef(oid) ~ '(entry_date|as_of)'
	loop
		execute format('alter table %s drop constraint %I', c.tbl, c.conname);
	end loop;
end;
$$;

update public.expenses_entries
set entry_date = (entry_date + interval '1 month' - interval '1 day')::date
where extract(day from entry_date) = 1;

update public.expenses_balance_snapshots
set as_of = (as_of + interval '1 month' - interval '1 day')::date
where extract(day from as_of) = 1;

drop function if exists public.expenses_save_month(jsonb);

-- expenses_save_entry(payload): write a whole entry atomically ----------------
--
-- payload = {
--   date: 'YYYY-MM-DD',
--   discretionary_spent_cents: int | null,     -- spending since the previous entry
--   notes: text,
--   balances:  [{ account_id, balance_cents }],   -- as of `date`
--   income:    [{ income_source_id, amount_cents }],
--   costs:     [{ cost_item_id, amount_cents }],
--   extras:    [{ kind: 'income'|'cost', name, amount_cents }],
--   cost_amount_changes: [{ cost_item_id, amount_cents }],   -- effective from the entry's month
--   new_income_sources:  [{ name, category, frequency, rate_cents, quantity, summer_quantity, amount_cents }],
--   new_cost_items:      [{ name, frequency, due_month, is_tax, is_variable, amount_cents }]
-- }
-- Actuals and extras for the entry are replaced, not merged. Returns the entry id.

create or replace function public.expenses_save_entry(payload jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_date date := (payload->>'date')::date;
	v_month date := date_trunc('month', (payload->>'date')::date)::date;
	v_entry_id bigint;
	v_new_id bigint;
	v_sort int;
	item jsonb;
begin
	if auth.uid() is null then
		raise exception 'Not authenticated';
	end if;
	if v_date is null then
		raise exception 'date is required';
	end if;

	insert into public.expenses_entries (entry_date, discretionary_spent_cents, notes)
	values (
		v_date,
		(payload->>'discretionary_spent_cents')::bigint,
		coalesce(payload->>'notes', '')
	)
	on conflict (user_id, entry_date) do update
		set discretionary_spent_cents = excluded.discretionary_spent_cents,
			notes = excluded.notes
	returning id into v_entry_id;

	delete from public.expenses_income_actuals where entry_id = v_entry_id;
	delete from public.expenses_cost_actuals where entry_id = v_entry_id;
	delete from public.expenses_monthly_extras where entry_id = v_entry_id;

	for item in select * from jsonb_array_elements(coalesce(payload->'balances', '[]'::jsonb))
	loop
		insert into public.expenses_balance_snapshots (account_id, as_of, balance_cents)
		values ((item->>'account_id')::bigint, v_date, (item->>'balance_cents')::bigint)
		on conflict (account_id, as_of) do update set balance_cents = excluded.balance_cents;
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

revoke execute on function public.expenses_save_entry(jsonb) from public, anon;
grant execute on function public.expenses_save_entry(jsonb) to authenticated;
