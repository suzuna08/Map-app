/**
 * Lightweight timing instrumentation for the URL-add pipeline.
 *
 * Server-side: timings are collected per-request and returned in
 *   the JSON response under `__timing` (only when DEBUG_URL_TIMING is truthy).
 *
 * Client-side: timings are logged to the console and merged with
 *   the server-reported breakdown.
 *
 * To enable:  set env  DEBUG_URL_TIMING=1  (server)
 *             or call  enableUrlTiming()    (browser console)
 */

// ── Server flag ──────────────────────────────────────────────
let _enabled: boolean | null = null;

export function isUrlTimingEnabled(): boolean {
	if (_enabled !== null) return _enabled;
	if (typeof window !== 'undefined') {
		try { _enabled = !!window.localStorage.getItem('DEBUG_URL_TIMING'); } catch { _enabled = false; }
		return _enabled;
	}
	// Server-side: _enabled must be set explicitly via setUrlTimingEnabled()
	// since $env/dynamic/private can't be imported in a shared module.
	return false;
}

/** Called from server routes to propagate the env flag into this module. */
export function setUrlTimingEnabled(val: boolean): void {
	_enabled = val;
}

/** Call from the browser console to enable client-side timing. */
export function enableUrlTiming(): void {
	if (typeof window !== 'undefined') {
		window.localStorage.setItem('DEBUG_URL_TIMING', '1');
		_enabled = true;
		console.log('[url-timing] enabled — reload to apply everywhere');
	}
}

export function disableUrlTiming(): void {
	if (typeof window !== 'undefined') {
		window.localStorage.removeItem('DEBUG_URL_TIMING');
		_enabled = false;
		console.log('[url-timing] disabled');
	}
}

// ── Timer ────────────────────────────────────────────────────
export interface TimingEntry {
	label: string;
	ms: number;
}

export interface TimingContext {
	mark: (label: string) => void;
	entries: () => TimingEntry[];
	summary: () => Record<string, number>;
	totalMs: () => number;
}

export function createTimingContext(): TimingContext {
	const marks: { label: string; ts: number }[] = [];

	function mark(label: string) {
		marks.push({ label, ts: performance.now() });
	}

	function entries(): TimingEntry[] {
		const result: TimingEntry[] = [];
		for (let i = 1; i < marks.length; i++) {
			result.push({
				label: `${marks[i - 1].label} → ${marks[i].label}`,
				ms: Math.round((marks[i].ts - marks[i - 1].ts) * 100) / 100,
			});
		}
		return result;
	}

	function summary(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const e of entries()) {
			out[e.label] = e.ms;
		}
		if (marks.length >= 2) {
			out['total'] = Math.round((marks[marks.length - 1].ts - marks[0].ts) * 100) / 100;
		}
		return out;
	}

	function totalMs(): number {
		if (marks.length < 2) return 0;
		return Math.round((marks[marks.length - 1].ts - marks[0].ts) * 100) / 100;
	}

	return { mark, entries, summary, totalMs };
}

// ── Pretty-print helper ──────────────────────────────────────
export function logTimingSummary(
	tag: string,
	ctx: TimingContext,
	extra?: Record<string, number>,
): void {
	const s = { ...ctx.summary(), ...extra };
	const lines = Object.entries(s).map(
		([k, v]) => `  ${k.padEnd(40)} ${String(v).padStart(8)} ms`,
	);
	console.log(`[${tag}] latency breakdown:\n${lines.join('\n')}`);
}

export function logTimingObject(tag: string, obj: Record<string, number>): void {
	const lines = Object.entries(obj).map(
		([k, v]) => `  ${k.padEnd(40)} ${String(v).padStart(8)} ms`,
	);
	console.log(`[${tag}] latency breakdown:\n${lines.join('\n')}`);
}
