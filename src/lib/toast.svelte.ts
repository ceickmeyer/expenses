// Tiny global toast queue.

export interface Toast {
	id: number;
	message: string;
	tone: 'ok' | 'error';
}

let next = 0;
export const toasts = $state<Toast[]>([]);

export function toast(message: string, tone: Toast['tone'] = 'ok') {
	const id = next++;
	toasts.push({ id, message, tone });
	setTimeout(() => {
		const i = toasts.findIndex((t) => t.id === id);
		if (i !== -1) toasts.splice(i, 1);
	}, tone === 'error' ? 6000 : 3000);
}
