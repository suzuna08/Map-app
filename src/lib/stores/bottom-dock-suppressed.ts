import { writable } from 'svelte/store';

/** When true, AppBottomDock is hidden (e.g. place action sheet / modal). */
export const bottomDockSuppressed = writable(false);
