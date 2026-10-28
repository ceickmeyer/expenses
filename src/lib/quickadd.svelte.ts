export type QuickAddTab = 'bill' | 'account';

export const quickAdd = $state<{ open: boolean; tab: QuickAddTab }>({ open: false, tab: 'bill' });

export function openQuickAdd(tab: QuickAddTab = 'bill') {
	quickAdd.tab = tab;
	quickAdd.open = true;
}
