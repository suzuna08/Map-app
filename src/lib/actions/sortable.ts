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

	let pointerPending = false;
	let pendingTarget: HTMLElement | null = null;
	let suppressNextClick = false;

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressTriggered = false;
	let pendingTouchMoveHandler: ((e: TouchEvent) => void) | null = null;

	let lastInsertIdx = -1;
	let rafId: number | null = null;
	let latestPointerX = 0;
	let latestPointerY = 0;

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
			willChange: 'left, top',
			transform: 'scale(1.06)',
			boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
			borderRadius: getComputedStyle(el).borderRadius,
			opacity: '0.92',
			cursor: 'grabbing',
			transition: 'transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease'
		});
		document.body.appendChild(ghostEl);

		el.style.visibility = 'hidden';
	}

	function moveGhost(clientX: number, clientY: number) {
		if (!ghostEl) return;
		ghostEl.style.left = `${clientX - offsetX}px`;
		ghostEl.style.top = `${clientY - offsetY}px`;
	}

	function findInsertIndex(cx: number, cy: number): number {
		let closest = -1;
		let bestDist = Infinity;

		for (let i = 0; i < items.length; i++) {
			if (items[i].id === dragId) continue;
			const target = items[i];

			const sameRow = Math.abs(cy - target.midY) < target.rect.height * 0.6;

			let dist: number;
			if (sameRow) {
				dist = Math.abs(cx - target.midX);
			} else {
				const dx = cx - target.midX;
				const dy = cy - target.midY;
				dist = Math.sqrt(dx * dx + dy * dy);
			}

			if (dist < bestDist) {
				bestDist = dist;
				closest = i;
			}
		}

		if (closest < 0) return 0;

		const target = items[closest];
		const closestOrderIdx = currentOrder.indexOf(target.id);

		const sameRow = Math.abs(cy - target.midY) < target.rect.height * 0.6;
		if (sameRow) {
			return cx > target.midX ? closestOrderIdx + 1 : closestOrderIdx;
		}
		return cy > target.midY ? closestOrderIdx + 1 : closestOrderIdx;
	}

	function prepareItemsForDrag() {
		for (const item of items) {
			if (item.id === dragId) continue;
			item.el.style.willChange = 'transform';
			item.el.style.transition = 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)';
		}
	}

	function applyShifts(newOrder: string[]) {
		for (const item of items) {
			if (item.id === dragId) continue;
			const oldIdx = originalOrder.indexOf(item.id);
			const newIdx = newOrder.indexOf(item.id);
			if (oldIdx === newIdx) {
				item.el.style.transform = 'translate3d(0,0,0)';
				continue;
			}

			const targetPositionItem = items.find((it) => it.id === originalOrder[newIdx]);
			if (targetPositionItem) {
				const dx = targetPositionItem.rect.left - item.rect.left;
				const dy = targetPositionItem.rect.top - item.rect.top;
				item.el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
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
		lastInsertIdx = -1;
		node.setAttribute('data-sortable-dragging', '');
		document.body.style.cursor = 'grabbing';

		items = getItems();
		originalOrder = getOrderedIds();
		currentOrder = [...originalOrder];

		createGhost(el, clientX, clientY);
		prepareItemsForDrag();

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

		if (insertIdx !== lastInsertIdx) {
			lastInsertIdx = insertIdx;
			const newOrder = reorderArray(originalOrder, dragId, insertIdx);

			if (newOrder.join(',') !== currentOrder.join(',')) {
				currentOrder = newOrder;
				applyShifts(newOrder);
			}
		}
	}

	function endDrag() {
		if (!dragging) return;
		dragging = false;
		lastInsertIdx = -1;
		node.removeAttribute('data-sortable-dragging');
		document.body.style.cursor = '';

		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}

		if (ghostEl && dragEl) {
			const targetRect = getDropTargetRect();
			if (targetRect) {
				ghostEl.style.transition = 'all 0.15s cubic-bezier(0.2, 0, 0, 1)';
				ghostEl.style.left = `${targetRect.left}px`;
				ghostEl.style.top = `${targetRect.top}px`;
				ghostEl.style.transform = 'scale(1)';
				ghostEl.style.opacity = '0.6';
				ghostEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';

				const ghost = ghostEl;
				const el = dragEl;
				setTimeout(() => {
					ghost.remove();
					el.style.visibility = '';
					cleanupItemStyles();
					emitAndReset();
				}, 150);
			} else {
				ghostEl.remove();
				dragEl.style.visibility = '';
				cleanupItemStyles();
				emitAndReset();
			}
			ghostEl = null;
		} else {
			if (dragEl) dragEl.style.visibility = '';
			cleanupItemStyles();
			emitAndReset();
		}

		document.removeEventListener('pointermove', onDragPointerMove);
		document.removeEventListener('pointerup', onDragPointerUp);
		document.removeEventListener('touchmove', onDragTouchMove);
		document.removeEventListener('touchend', onTouchEnd);
		document.removeEventListener('touchcancel', onTouchEnd);

		setTimeout(() => { suppressNextClick = false; }, 0);
	}

	function getDropTargetRect(): { left: number; top: number } | null {
		if (!dragId || currentOrder.length === 0) return null;
		const dropIdx = currentOrder.indexOf(dragId);
		if (dropIdx < 0) return null;
		const targetOriginalId = originalOrder[dropIdx];
		if (targetOriginalId === dragId) {
			const dragItem = items.find((it) => it.id === dragId);
			return dragItem ? { left: dragItem.rect.left, top: dragItem.rect.top } : null;
		}
		const targetItem = items.find((it) => it.id === targetOriginalId);
		return targetItem ? { left: targetItem.rect.left, top: targetItem.rect.top } : null;
	}

	function cleanupItemStyles() {
		for (const item of items) {
			item.el.style.transform = '';
			item.el.style.transition = '';
			item.el.style.willChange = '';
		}
	}

	function emitAndReset() {
		if (currentOrder.join(',') !== originalOrder.join(',')) {
			options.onReorder(currentOrder);
		}
		dragEl = null;
		dragId = '';
		items = [];
		currentOrder = [];
		originalOrder = [];
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

	function onDragStart(e: DragEvent) {
		if (pointerPending || dragging) {
			e.preventDefault();
		}
	}

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
		latestPointerX = e.clientX;
		latestPointerY = e.clientY;
		if (rafId !== null) return;
		rafId = requestAnimationFrame(() => {
			rafId = null;
			updateDrag(latestPointerX, latestPointerY);
		});
	}

	function onDragPointerUp() {
		endDrag();
	}

	// ─── Touch events ─────────────────────────────────────────────────

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
			} else {
				ev.preventDefault();
			}
		};
		document.addEventListener('touchmove', pendingTouchMoveHandler, { passive: false });
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
	node.addEventListener('dragstart', onDragStart);

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
			node.removeEventListener('dragstart', onDragStart);
			document.removeEventListener('pointermove', onDragPointerMove);
			document.removeEventListener('pointerup', onDragPointerUp);
			document.removeEventListener('touchmove', onDragTouchMove);
			document.removeEventListener('touchend', onTouchEnd);
			document.removeEventListener('touchcancel', onTouchEnd);
			cleanupPendingPointer();
			cleanupPendingTouch();
			if (rafId !== null) cancelAnimationFrame(rafId);
			if (ghostEl) ghostEl.remove();
			node.style.cursor = '';
			node.style.webkitUserSelect = '';
			node.style.userSelect = '';
			(node.style as unknown as Record<string, string>).webkitTouchCallout = '';
		}
	};
}
