export interface Toast {
	id: number;
	type: 'success' | 'duplicate' | 'error' | 'info';
	title: string;
	message: string;
	actions?: Array<{ label: string; handler: () => void }>;
}

let toasts = $state<Toast[]>([]);
let counter = 0;

export function getToasts() {
	return toasts;
}

export function showToast(
	type: Toast['type'],
	title: string,
	message: string,
	actions?: Toast['actions']
) {
	const id = ++counter;
	toasts = [...toasts, { id, type, title, message, actions }];
	const delay = type === 'error' ? 4000 : actions ? 5000 : 2500;
	setTimeout(() => {
		toasts = toasts.filter((t) => t.id !== id);
	}, delay);
}

export function dismissToast(id: number) {
	toasts = toasts.filter((t) => t.id !== id);
}
