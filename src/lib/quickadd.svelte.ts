export type QuickAddTab = 'expense' | 'income' | 'account';

export const quickAdd = $state<{ open: boolean; tab: QuickAddTab }>({ open: false, tab: 'expense' });

export function openQuickAdd(tab: QuickAddTab = 'expense') {
	quickAdd.tab = tab;
	quickAdd.open = true;
}
