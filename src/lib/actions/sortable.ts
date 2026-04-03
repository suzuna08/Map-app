export interface SortableOptions {
	onReorder: (orderedIds: string[]) => void;
	itemSelector: string;
	idAttribute: string;
	longPressMs?: number;
	disabled?: boolean;
	/**
	 * CSS selector for elements that should NOT trigger drag.
	 * Touch events on matching elements pass through to the element's own handler.
	 * For desktop, we use a click-delay approach instead so drag handles and
	 * clickable elements can coexist.
	 */
	ignoreDragFrom?: string;
}

interface ItemRect {
	id: string;
	el: HTMLElement;
	rect: DOMRect;
	midX: number;
	midY: number;
}

const TOUCH_MOVE_THRESHOLD = 64;
const POINTER_DRAG_THRESHOLD = 9;

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
	let items: ItemRect[] = [];
	let currentOrder: string[] = [];
	let originalOrder: string[] = [];

	// Desktop: delayed drag activation to distinguish click from drag
	let pointerPending = false;
	let pendingTarget: HTMLElement | null = null;
	let suppressNextClick = false;

	// Touch: long-press to activate drag
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTriggered = false;
	let pendingTouchMoveHandler: ((e: TouchEvent) => void) | null = null;

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
		Object.assign(ghostEl.style, {
			position: 'fixed',
			zIndex: '9999',
			pointerEvents: 'none',
			width: `${rect.width}px`,
			height: `${rect.height}px`,
			left: `${clientX - offsetX}px`,
			top: `${clientY - offsetY}px`,
			transition: 'transform 0.15s ease, box-shadow 0.15s ease',
			transform: 'scale(1.06)',
			boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
			borderRadius: getComputedStyle(el).borderRadius,
			opacity: '0.95',
			cursor: 'grabbing'
		});
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

		const isAfter =
			cy > target.midY + target.rect.height * 0.3 ||
			(Math.abs(cy - target.midY) <= target.rect.height * 0.3 && cx > target.midX);

		const closestOrderIdx = currentOrder.indexOf(target.id);
		return isAfter ? closestOrderIdx + 1 : closestOrderIdx;
	}

	function applyShifts(newOrder: string[]) {
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
		if (options.disabled || dragging) return;

		window.getSelection()?.removeAllRanges();

		dragEl = el;
		dragId = el.getAttribute(options.idAttribute) || '';
		dragging = true;
		node.setAttribute('data-sortable-dragging', '');

		items = getItems();
		originalOrder = getOrderedIds();
		currentOrder = [...originalOrder];

		createGhost(el, clientX, clientY);

		if (touch) {
			document.addEventListener('touchmove', onDragTouchMove, { passive: false });
			document.addEventListener('touchend', onTouchEnd);
			document.addEventListener('touchcancel', onTouchEnd);
		} else {
			document.addEventListener('pointermove', onDragPointerMove);
			document.addEventListener('pointerup', onDragPointerUp);
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
		node.removeAttribute('data-sortable-dragging');

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

		document.removeEventListener('pointermove', onDragPointerMove);
		document.removeEventListener('pointerup', onDragPointerUp);
		document.removeEventListener('touchmove', onDragTouchMove);
		document.removeEventListener('touchend', onTouchEnd);
		document.removeEventListener('touchcancel', onTouchEnd);

		setTimeout(() => { suppressNextClick = false; }, 0);
	}

	function cleanupPendingPointer() {
		pointerPending = false;
		pendingTarget = null;
		document.removeEventListener('pointermove', onPendingPointerMove);
		document.removeEventListener('pointerup', onPendingPointerUp);
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

	// ─── Desktop pointer events ───────────────────────────────────────
	// Two-phase: pointerdown records start position, pointermove beyond
	// threshold activates drag, pointerup without movement lets the
	// click through to the element's own onclick handler.

	function onPointerDown(e: PointerEvent) {
		if (options.disabled || e.button !== 0 || dragging) return;
		if (e.pointerType === 'touch') return;

		if (shouldIgnoreTarget(e.target as HTMLElement)) return;

		const target = (e.target as HTMLElement).closest(options.itemSelector) as HTMLElement | null;
		if (!target || !node.contains(target)) return;

		startX = e.clientX;
		startY = e.clientY;
		pointerPending = true;
		pendingTarget = target;

		document.addEventListener('pointermove', onPendingPointerMove);
		document.addEventListener('pointerup', onPendingPointerUp);
	}

	function onPendingPointerMove(e: PointerEvent) {
		if (!pointerPending || !pendingTarget) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		if (dx * dx + dy * dy > POINTER_DRAG_THRESHOLD) {
			const target = pendingTarget;
			cleanupPendingPointer();
			suppressNextClick = true;
			startDrag(target, e.clientX, e.clientY, false);
		}
	}

	function onPendingPointerUp() {
		cleanupPendingPointer();
	}

	function onClickCapture(e: MouseEvent) {
		if (suppressNextClick) {
			const target = (e.target as HTMLElement).closest(options.itemSelector);
			if (target && node.contains(target)) {
				e.stopPropagation();
				e.preventDefault();
			}
			suppressNextClick = false;
		}
	}

	function onDragPointerMove(e: PointerEvent) {
		if (!dragging) return;
		e.preventDefault();
		updateDrag(e.clientX, e.clientY);
	}

	function onDragPointerUp() {
		endDrag();
	}

	// ─── Touch events ─────────────────────────────────────────────────
	// Long-press to activate drag. During the wait, a passive touchmove
	// listener cancels if the finger moves (allowing scroll). Once the
	// long-press fires, non-passive touchmove prevents scroll during drag.

	function onNativeTouchStart(e: TouchEvent) {
		if (options.disabled || dragging) return;

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
		if (!touch || !dragging) return;

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

	function onTouchEnd() {
		if (dragging) endDrag();
		cleanupPendingTouch();
		longPressTriggered = false;
	}

	// ─── Lifecycle ────────────────────────────────────────────────────

	function applyStyles() {
		if (options.disabled) {
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
	node.addEventListener('click', onClickCapture, true);

	applyStyles();

	return {
		update(newOpts: SortableOptions) {
			options = newOpts;
			applyStyles();
		},
		destroy() {
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('touchstart', onNativeTouchStart);
			node.removeEventListener('click', onClickCapture, true);
			document.removeEventListener('pointermove', onDragPointerMove);
			document.removeEventListener('pointerup', onDragPointerUp);
			document.removeEventListener('touchmove', onDragTouchMove);
			document.removeEventListener('touchend', onTouchEnd);
			document.removeEventListener('touchcancel', onTouchEnd);
			cleanupPendingPointer();
			cleanupPendingTouch();
			if (ghostEl) ghostEl.remove();
			node.style.cursor = '';
			node.style.webkitUserSelect = '';
			node.style.userSelect = '';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = '';
		}
	};
}
