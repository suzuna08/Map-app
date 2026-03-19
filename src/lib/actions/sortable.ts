export interface SortableOptions {
	onReorder: (orderedIds: string[]) => void;
	itemSelector: string;
	idAttribute: string;
	longPressMs?: number;
	disabled?: boolean;
	/** CSS selector for elements that should NOT trigger drag (e.g. 'button, input, a') */
	ignoreDragFrom?: string;
}

interface ItemRect {
	id: string;
	el: HTMLElement;
	rect: DOMRect;
	midX: number;
	midY: number;
}

const TOUCH_MOVE_THRESHOLD = 64; // px² — cancel long-press if finger moves more than 8px
const HAPTIC_STYLE_CLASS = 'sortable-dragging';

export function sortable(node: HTMLElement, opts: SortableOptions) {
	let options = opts;

	let dragging = false;
	let dragEl: HTMLElement | null = null;
	let ghostEl: HTMLElement | null = null;
	let dragId = '';
	let startX = 0;
	let startY = 0;
	let offsetX = 0;
	let offsetY = 0;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTriggered = false;
	let items: ItemRect[] = [];
	let currentOrder: string[] = [];
	let originalOrder: string[] = [];
	let pendingTouchMoveHandler: ((e: TouchEvent) => void) | null = null;

	function isTouchDevice(): boolean {
		return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
	}

	function shouldIgnoreTarget(target: HTMLElement): boolean {
		if (!options.ignoreDragFrom) return false;
		return !!target.closest(options.ignoreDragFrom);
	}

	function getItems(): ItemRect[] {
		const els = Array.from(node.querySelectorAll(options.itemSelector)) as HTMLElement[];
		return els.map((el) => {
			const rect = el.getBoundingClientRect();
			return {
				id: el.getAttribute(options.idAttribute) || '',
				el,
				rect,
				midX: rect.left + rect.width / 2,
				midY: rect.top + rect.height / 2
			};
		});
	}

	function getOrderedIds(): string[] {
		return items.map((i) => i.id);
	}

	function createGhost(el: HTMLElement, clientX: number, clientY: number) {
		const rect = el.getBoundingClientRect();
		offsetX = clientX - rect.left;
		offsetY = clientY - rect.top;

		ghostEl = el.cloneNode(true) as HTMLElement;
		ghostEl.style.position = 'fixed';
		ghostEl.style.zIndex = '9999';
		ghostEl.style.pointerEvents = 'none';
		ghostEl.style.width = `${rect.width}px`;
		ghostEl.style.height = `${rect.height}px`;
		ghostEl.style.left = `${clientX - offsetX}px`;
		ghostEl.style.top = `${clientY - offsetY}px`;
		ghostEl.style.transition = 'transform 0.15s ease, box-shadow 0.15s ease';
		ghostEl.style.transform = 'scale(1.06)';
		ghostEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
		ghostEl.style.borderRadius = getComputedStyle(el).borderRadius;
		ghostEl.style.opacity = '0.95';
		ghostEl.style.cursor = 'grabbing';
		document.body.appendChild(ghostEl);

		el.style.opacity = '0.25';
		el.style.transition = 'opacity 0.15s ease';
	}

	function moveGhost(clientX: number, clientY: number) {
		if (!ghostEl) return;
		ghostEl.style.left = `${clientX - offsetX}px`;
		ghostEl.style.top = `${clientY - offsetY}px`;
	}

	function findInsertIndex(cx: number, cy: number): number {
		let closest = 0;
		let bestDist = Infinity;

		for (let i = 0; i < items.length; i++) {
			if (items[i].id === dragId) continue;
			const dx = cx - items[i].midX;
			const dy = cy - items[i].midY;
			const dist = dx * dx + dy * dy;
			if (dist < bestDist) {
				bestDist = dist;
				closest = i;
			}
		}

		const target = items[closest];
		if (!target) return 0;

		const isAfter = cy > target.midY + target.rect.height * 0.3 ||
			(Math.abs(cy - target.midY) <= target.rect.height * 0.3 && cx > target.midX);

		const closestOrderIdx = currentOrder.indexOf(target.id);
		return isAfter ? closestOrderIdx + 1 : closestOrderIdx;
	}

	function applyShifts(newOrder: string[]) {
		const oldPositions = new Map<string, { x: number; y: number }>();
		for (const item of items) {
			oldPositions.set(item.id, { x: item.rect.left, y: item.rect.top });
		}

		for (const item of items) {
			if (item.id === dragId) continue;
			const oldIdx = originalOrder.indexOf(item.id);
			const newIdx = newOrder.indexOf(item.id);
			if (oldIdx === newIdx) {
				item.el.style.transform = '';
				item.el.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
				continue;
			}

			const originalItem = items.find((it) => it.id === originalOrder[newIdx]);
			const targetItem = items.find((it) => it.id === originalOrder[oldIdx]);
			if (originalItem && targetItem) {
				const dx = originalItem.rect.left - targetItem.rect.left;
				const dy = originalItem.rect.top - targetItem.rect.top;
				item.el.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';
				item.el.style.transform = `translate(${dx}px, ${dy}px)`;
			}
		}
	}

	function reorderArray(arr: string[], fromId: string, toIndex: number): string[] {
		const newArr = arr.filter((id) => id !== fromId);
		const clampedIdx = Math.min(toIndex, newArr.length);
		newArr.splice(clampedIdx, 0, fromId);
		return newArr;
	}

	function startDrag(el: HTMLElement, clientX: number, clientY: number, touch: boolean) {
		if (options.disabled) return;

		window.getSelection()?.removeAllRanges();

		dragEl = el;
		dragId = el.getAttribute(options.idAttribute) || '';
		dragging = true;

		items = getItems();
		originalOrder = getOrderedIds();
		currentOrder = [...originalOrder];

		createGhost(el, clientX, clientY);

		if (touch) {
			document.addEventListener('touchmove', onDragTouchMove, { passive: false });
			document.addEventListener('touchend', onTouchEnd);
			document.addEventListener('touchcancel', onTouchEnd);
		} else {
			document.addEventListener('pointermove', onPointerMove);
			document.addEventListener('pointerup', onPointerUp);
		}
	}

	function updateDrag(clientX: number, clientY: number) {
		moveGhost(clientX, clientY);

		const insertIdx = findInsertIndex(clientX, clientY);
		const newOrder = reorderArray(originalOrder, dragId, insertIdx);

		if (newOrder.join(',') !== currentOrder.join(',')) {
			currentOrder = newOrder;
			applyShifts(newOrder);
		}
	}

	function endDrag() {
		if (!dragging) return;
		dragging = false;

		if (ghostEl) {
			ghostEl.remove();
			ghostEl = null;
		}

		if (dragEl) {
			dragEl.style.opacity = '';
			dragEl.style.transition = '';
		}

		for (const item of items) {
			item.el.style.transform = '';
			item.el.style.transition = '';
		}

		if (currentOrder.join(',') !== originalOrder.join(',')) {
			options.onReorder(currentOrder);
		}

		dragEl = null;
		dragId = '';
		items = [];
		currentOrder = [];
		originalOrder = [];

		document.removeEventListener('pointermove', onPointerMove);
		document.removeEventListener('pointerup', onPointerUp);
		document.removeEventListener('touchmove', onDragTouchMove);
		document.removeEventListener('touchend', onTouchEnd);
		document.removeEventListener('touchcancel', onTouchEnd);
		cleanupPendingTouch();
	}

	function cleanupPendingTouch() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
		if (pendingTouchMoveHandler) {
			document.removeEventListener('touchmove', pendingTouchMoveHandler);
			document.removeEventListener('touchend', onPendingTouchEnd);
			document.removeEventListener('touchcancel', onPendingTouchEnd);
			pendingTouchMoveHandler = null;
		}
	}

	// --- Desktop pointer events ---

	function onPointerDown(e: PointerEvent) {
		if (options.disabled || e.button !== 0) return;

		const target = (e.target as HTMLElement).closest(options.itemSelector) as HTMLElement | null;
		if (!target || !node.contains(target)) return;

		if (e.pointerType === 'touch') return;

		if (shouldIgnoreTarget(e.target as HTMLElement)) return;

		e.preventDefault();
		startDrag(target, e.clientX, e.clientY, false);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		e.preventDefault();
		updateDrag(e.clientX, e.clientY);
	}

	function onPointerUp() {
		endDrag();
	}

	// --- Touch events: two-phase approach ---
	// Phase 1 (pending): Listen for touchmove during long-press wait to cancel if finger moves
	// Phase 2 (dragging): After long-press fires, handle drag movement

	function onNativeTouchStart(e: TouchEvent) {
		if (options.disabled) return;

		const touch = e.touches[0];
		if (!touch) return;

		const target = (e.target as HTMLElement).closest(options.itemSelector) as HTMLElement | null;
		if (!target || !node.contains(target)) return;

		if (shouldIgnoreTarget(e.target as HTMLElement)) return;

		startX = touch.clientX;
		startY = touch.clientY;
		longPressTriggered = false;

		const el = target;
		const cx = touch.clientX;
		const cy = touch.clientY;

		// Track movement during the long-press wait (passive, so scrolling isn't blocked)
		pendingTouchMoveHandler = (ev: TouchEvent) => {
			const t = ev.touches[0];
			if (!t) return;
			const dx = t.clientX - startX;
			const dy = t.clientY - startY;
			if (dx * dx + dy * dy > TOUCH_MOVE_THRESHOLD) {
				cleanupPendingTouch();
			}
		};
		document.addEventListener('touchmove', pendingTouchMoveHandler, { passive: true });
		document.addEventListener('touchend', onPendingTouchEnd);
		document.addEventListener('touchcancel', onPendingTouchEnd);

		longPressTimer = setTimeout(() => {
			longPressTriggered = true;
			cleanupPendingTouch();
			startDrag(el, cx, cy, true);
		}, options.longPressMs ?? 400);
	}

	function onPendingTouchEnd() {
		cleanupPendingTouch();
		longPressTriggered = false;
	}

	function onDragTouchMove(e: TouchEvent) {
		const touch = e.touches[0];
		if (!touch) return;

		if (dragging) {
			e.preventDefault();
			updateDrag(touch.clientX, touch.clientY);

			const containerRect = node.getBoundingClientRect();
			const edgeZone = 40;
			const scrollSpeed = 3;
			if (touch.clientX < containerRect.left + edgeZone) {
				node.scrollLeft -= scrollSpeed;
			} else if (touch.clientX > containerRect.right - edgeZone) {
				node.scrollLeft += scrollSpeed;
			}
		}
	}

	function onTouchEnd() {
		if (dragging) {
			endDrag();
		}
		cleanupPendingTouch();
		longPressTriggered = false;
	}

	function applyStyles() {
		const isTouch = isTouchDevice();
		if (options.disabled) {
			node.style.cursor = '';
			node.style.webkitUserSelect = '';
			node.style.userSelect = '';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = '';
		} else if (isTouch) {
			// On touch: don't force grab cursor or block user-select globally
			// These are applied only during active drag via the ghost element
			node.style.cursor = '';
			node.style.webkitUserSelect = '';
			node.style.userSelect = '';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = '';
		} else {
			node.style.cursor = 'grab';
			node.style.webkitUserSelect = 'none';
			node.style.userSelect = 'none';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = 'none';
		}
	}

	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('touchstart', onNativeTouchStart, { passive: true });

	applyStyles();

	return {
		update(newOpts: SortableOptions) {
			options = newOpts;
			applyStyles();
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('touchstart', onNativeTouchStart);
			document.removeEventListener('pointermove', onPointerMove);
			document.removeEventListener('pointerup', onPointerUp);
			document.removeEventListener('touchmove', onDragTouchMove);
			document.removeEventListener('touchend', onTouchEnd);
			document.removeEventListener('touchcancel', onTouchEnd);
			cleanupPendingTouch();
			if (ghostEl) ghostEl.remove();
			node.style.cursor = '';
			node.style.webkitUserSelect = '';
			node.style.userSelect = '';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = '';
		}
	};
}
