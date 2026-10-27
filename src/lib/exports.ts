// CSV exports: URL name -> table, with a label for the settings page.
export const EXPORTS = {
	accounts: { table: 'expenses_accounts', label: 'Accounts' },
	balances: { table: 'expenses_balance_snapshots', label: 'Balances' },
	income_sources: { table: 'expenses_income_sources', label: 'Income sources' },
	income_rates: { table: 'expenses_income_source_rates', label: 'Income rates' },
	cost_items: { table: 'expenses_cost_items', label: 'Costs' },
	cost_amounts: { table: 'expenses_cost_item_amounts', label: 'Cost amounts' },
	entries: { table: 'expenses_entries', label: 'Entries' },
	income_actuals: { table: 'expenses_income_actuals', label: 'Income actuals' },
	cost_actuals: { table: 'expenses_cost_actuals', label: 'Cost actuals' },
	extras: { table: 'expenses_monthly_extras', label: 'One-off items' },
	settings: { table: 'expenses_settings', label: 'Settings' }
} as const;
