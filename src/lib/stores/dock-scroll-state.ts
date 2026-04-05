import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type DockMode = 'active' | 'passive';

export const dockMode = writable<DockMode>('active');

const SCROLL_THRESHOLD = 8;
const IDLE_DELAY_MS = 400;
const DIRECTION_LOCK_DELTA = 3;

let lastScrollY = 0;
let cumulativeDelta = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let currentMode: DockMode = 'active';
let ticking = false;
let initialized = false;

function setMode(mode: DockMode) {
	if (mode === currentMode) return;
	currentMode = mode;
	dockMode.set(mode);
}

function resetIdleTimer() {
	clearTimeout(idleTimer);
	idleTimer = setTimeout(() => setMode('active'), IDLE_DELAY_MS);
}

function onScroll(scrollY: number) {
	const delta = scrollY - lastScrollY;
	lastScrollY = scrollY;

	if (Math.abs(delta) < DIRECTION_LOCK_DELTA) return;

	if (delta > 0) {
		cumulativeDelta = Math.max(cumulativeDelta + delta, 0);
		if (cumulativeDelta > SCROLL_THRESHOLD) {
			setMode('passive');
			resetIdleTimer();
		}
	} else {
		cumulativeDelta = 0;
		setMode('active');
		clearTimeout(idleTimer);
	}
}

function handleWindowScroll() {
	if (!ticking) {
		ticking = true;
		requestAnimationFrame(() => {
			onScroll(window.scrollY);
			ticking = false;
		});
	}
}

function handleCapturedScroll(e: Event) {
	const target = e.target;
	if (target === document || target === document.documentElement) return;
	if (!(target instanceof HTMLElement)) return;

	const scrollTop = target.scrollTop;
	if (!ticking) {
		ticking = true;
		requestAnimationFrame(() => {
			onScroll(scrollTop);
			ticking = false;
		});
	}
}

function handleTouchEnd() {
	resetIdleTimer();
}

export function initDockScrollWatcher() {
	if (!browser || initialized) return () => {};
	initialized = true;
	lastScrollY = window.scrollY;

	window.addEventListener('scroll', handleWindowScroll, { passive: true });
	document.addEventListener('scroll', handleCapturedScroll, { capture: true, passive: true });
	document.addEventListener('touchend', handleTouchEnd, { passive: true });

	return () => {
		initialized = false;
		clearTimeout(idleTimer);
		window.removeEventListener('scroll', handleWindowScroll);
		document.removeEventListener('scroll', handleCapturedScroll, { capture: true } as EventListenerOptions);
		document.removeEventListener('touchend', handleTouchEnd);
		setMode('active');
	};
}
