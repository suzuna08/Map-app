# URL Search Latency — Instrumentation & Analysis

## Overview

When a user pastes a Google Maps URL into the search field and presses Enter,
the full pipeline from keystroke to rendered map marker takes **~800–1,200 ms**
for a typical request (after optimizations). Shortened URLs on first paste add
~400–600 ms for redirect resolution; repeated pastes of the same shortlink
hit a 10-minute in-memory cache and skip resolution entirely.

This document explains where the time goes, how to measure it, what
optimizations are in place, and what could be done next.

---

## How to enable instrumentation

### Server-side (Vercel / Node)

Set the environment variable:

```
DEBUG_URL_TIMING=1
```

The server route (`+server.ts`) calls `setUrlTimingEnabled(!!env.DEBUG_URL_TIMING)`
on each request. When enabled, the server logs a per-request latency breakdown
to `stdout` and includes a `__timing` object in the JSON response.

### Client-side (browser console)

```js
// Enable (persists in localStorage):
localStorage.setItem('DEBUG_URL_TIMING', '1');
location.reload();

// Disable:
localStorage.removeItem('DEBUG_URL_TIMING');
```

When enabled, the browser logs a combined client + server breakdown to
the console after every URL add.

---

## Where logs appear

| Context      | Location                         | Tag              |
|--------------|----------------------------------|------------------|
| Server       | stdout / Vercel function logs    | `[add-by-url]`   |
| Browser      | DevTools console                 | `[addPlace]`     |

---

## Pipeline stages (current architecture)

The server handler runs dedup round 1 **in parallel** with the Google API call,
and parallelizes the two queries within each dedup round. The flow:

```
Frontend
  1. prep (submit → fetch)                                1–5 ms
  2. network: client → server                           50–150 ms

Server
  3. parse + clean URL                                     <1 ms
  4. resolve shortlink (cache hit → skip)      0 ms or 400–600 ms
  ┌─────────── Promise.all ───────────┐
  │ 5a. dedup round 1                 │
  │     ┌ query by google_place_id ┐  │
  │     └ query by url             ┘  │       30–80 ms
  │       (parallel via Promise.all)  │
  │                                   │
  │ 5b. Google Places API call        │      250–460 ms  ★ bottleneck
  └───────────────────────────────────┘
  6. dedup round 2                                       30–80 ms
     ┌ query by google_place_id ┐
     └ query by title + address ┘
       (parallel via Promise.all)
  7. insert place                                        20–50 ms
  8. apply context tags                                  20–40 ms (if any)

Frontend
  9. network: server → client                           50–150 ms
 10. JSON parse                                            <5 ms
 11. state update + Svelte render                         5–20 ms
 12. MapView: syncMarkers + fitToMarkers                  5–15 ms
```

Because steps 5a and 5b overlap, dedup round 1 is effectively free — its
~50 ms finishes well before the ~300 ms Google API call.

---

## Measured latency by scenario

| Scenario                              | Typical total | Notes |
|---------------------------------------|---------------|-------|
| Long URL (no shortlink resolution)    | 800–1,000 ms  | Direct `google.com/maps/...` URL |
| Short URL, first paste (cache miss)   | 1,100–1,200 ms | `maps.app.goo.gl/...` — resolution adds ~400–600 ms |
| Short URL, repeat paste (cache hit)   | ~560 ms       | Resolution skipped via in-memory cache |
| Duplicate detected in dedup round 1   | 300–500 ms    | Early exit, no Google API call needed |

Network variance can push individual requests higher (e.g. 2,400 ms observed
when Google's redirect servers and Supabase both spiked simultaneously).

### Measured breakdown (real example — long URL, non-duplicate)

| Bucket                   | Measured  | Share | Notes |
|--------------------------|-----------|-------|-------|
| **Google Places API**    | 250–460 ms | 40–55% | `POST /v1/places:searchText` or `GET /v1/places/{ChIJ...}` |
| **URL resolution**       | 0–600 ms  | 0–35% | Only for shortened/share links; skipped when cached |
| **Supabase (all rounds)**| 80–180 ms | 10–20% | 4–6 parallel queries + 1 insert |
| **Network overhead**     | 100–200 ms | 15–20% | RTT between browser ↔ Vercel ↔ Supabase/Google |
| **Frontend**             | <20 ms    | <2%  | Negligible |

---

## How to interpret the timing breakdown

### Example server log (optimized — parallel dedup + API)

```
[add-by-url] latency breakdown:
  req:received → parse:clean                            0.10 ms
  parse:clean → resolve:start                           0.03 ms
  resolve:start → resolve:done                          0.01 ms   ← not shortened
  resolve:done → dedup1+api:start                       0.02 ms
  dedup1:start → dedup1:done                           48.20 ms   ← parallel queries
  google-api:start → google-api:done                  312.50 ms   ★ Google API
  dedup1+api:start → dedup1+api:done                  313.10 ms   ← wall clock (max of above)
  dedup2:start → dedup2:done                           42.80 ms   ← parallel queries
  insert:start → insert:done                           28.40 ms
  total                                               385.60 ms
```

### Example client log

```
[addPlace] latency breakdown:
  frontend prep (submit → fetch)                        2.10 ms
  network round-trip (fetch → response)               562.00 ms
  response parse (JSON)                                 1.20 ms
  frontend render + state update                        9.80 ms
  total client-side                                   575.10 ms
  --- SERVER BREAKDOWN ---
    server: dedup1+api:start → dedup1+api:done        313.10 ms
    server: google-api:start → google-api:done        312.50 ms
    server: total                                     385.60 ms
```

Key observations:
- **Google API** took ~313 ms (81% of server time)
- **Supabase** took ~119 ms across parallel queries + insert (31%), but most of
  it was hidden behind the Google API call
- **Network overhead** (562 − 386) = ~176 ms (RTT between browser and Vercel)
- **Frontend** was negligible (~13 ms)

---

## Optimizations implemented

### 1. Parallel dedup round 1 + Google API overlap

Dedup round 1 and the Google Places API call now run simultaneously via
`Promise.all` in `+server.ts`. Since dedup1 typically finishes in ~50 ms and
the API call takes ~300 ms, dedup1 is effectively free.

```ts
const [dedup1Match, details] = await Promise.all([dedup1Promise, googleApiPromise]);
```

### 2. Parallel queries within each dedup round

Both queries in dedup round 1 (`by google_place_id` and `by url`) and both
queries in dedup round 2 (`by google_place_id` and `by title + address`) run
via `Promise.all` instead of sequentially. Saves ~30 ms per round.

### 3. Shortlink URL cache

Resolved shortlink URLs are cached in an in-memory `Map` with a 10-minute TTL
in `src/lib/google-places.ts`. Repeated pastes of the same `maps.app.goo.gl`
or `share.google` link skip the 400–600 ms redirect resolution entirely.

```ts
const resolvedUrlCache = new Map<string, { url: string; ts: number }>();
const RESOLVE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
```

---

## Comparison to other flows

| Flow              | Typical latency | Google API? | Notes |
|-------------------|-----------------|-------------|-------|
| **Add by URL**    | 800–1,200 ms    | Yes         | Full pipeline: resolve + dedup + fetch + insert |
| **CSV import**    | 50–200 ms/batch | No          | Client-side parse + Supabase insert; places arrive unenriched |
| **Enrich single** | 400–700 ms      | Yes         | 1 Supabase read + 1 API call + 1 update; no URL resolution or dedup |
| **Enrich all**    | 2–4 s (10 places) | Yes       | Batches of 3 concurrent, 200 ms gap between batches |

Add-by-URL is the slowest single-place operation because it includes URL
resolution and two rounds of dedup that other flows skip. The Google Places
API call (~300 ms) is a constant cost shared by all flows that touch Google.

---

## Potential future optimizations

### Pre-resolve on paste

Start resolving the shortlink as soon as the user pastes a URL (before they
press Enter). The ~400–600 ms resolution would happen during idle time while
the user reviews the URL. This eliminates the resolution cost from the
perceived wait after pressing Enter.

### Google Places API response cache

Cache `fetchPlaceDetails` results keyed by `google_place_id`. When a duplicate
is detected in dedup round 2 (post-fetch), the API call was wasted — a cache
would avoid this on re-adds. Deprioritized because hit rate is low in typical
single-user usage patterns.

### Optimistic UI

Show a placeholder card immediately when the user presses Enter, then fill in
real data when the API responds. Doesn't reduce actual latency but makes the
wait feel shorter. Tricky on mobile where keyboard takes up half the screen.

---

## Files modified

| File | Change |
|------|--------|
| `src/lib/url-timing.ts` | **New** — timing utility (`createTimingContext`, `mark`, `summary`, `logTimingSummary`); server flag via `setUrlTimingEnabled` |
| `src/lib/google-places.ts` | Added `timing` param to `resolveGoogleMapsUrl` and `fetchPlaceDetails`; added in-memory shortlink cache (`resolvedUrlCache` with 10-min TTL) |
| `src/routes/api/places/add-by-url/+server.ts` | Timing marks throughout; `Promise.all` for dedup1 + Google API overlap; parallel queries within each dedup round; returns `__timing` in debug mode |
| `src/routes/places/+page.svelte` | Client-side `performance.now()` measurements around fetch, parse, render; logs combined client+server breakdown |

All instrumentation is gated behind the `DEBUG_URL_TIMING` flag and has zero
performance impact when disabled. The parallelization and caching optimizations
are always active.
