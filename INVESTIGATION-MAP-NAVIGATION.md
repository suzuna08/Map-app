# Investigation: Map Re-Initialization Causing Slow Page Transitions

**Date**: April 30, 2026
**Status**: Investigation complete — fix not yet implemented

---

## Summary

Navigating between `/places` and `/collections` feels slow because the MapLibre GL map is **fully destroyed and recreated** on every route change. Both pages own their own `<MapView>` instance at the page component level, and SvelteKit unmounts the old page and mounts the new one on navigation — tearing down the WebGL context, discarding loaded tiles, and rebuilding everything from scratch.

The estimated cost per transition is **400–1200ms**, dominated by MapLibre initialization and tile loading. If the map were preserved across navigations, transitions would drop to ~50–250ms.

---

## Reproduction Path

1. Navigate to `/places` — map initializes (dynamic import, WebGL context, tile load, marker sync)
2. Click "Collections" in the bottom dock → navigates to `/collections`
3. `/places/+page.svelte` fully unmounts, including its `<MapView>` / `<MobileMapShell>`
4. `onMount` cleanup in `MapView.svelte` fires `map.remove()` (line 119), destroying the WebGL context
5. `/collections/+page.svelte` mounts, creating a brand new `<MapView>` / `<MobileMapShell>`
6. A new `onMount` fires: dynamic `import('maplibre-gl')`, `new ml.Map(...)`, tile style fetch, WebGL init, marker creation
7. Navigating back to `/places` repeats the entire cycle

---

## Files and Components Involved

| File | Role |
|---|---|
| `src/routes/+layout.svelte` | Root layout — persists across all navigations. Contains `AppBottomDock` but **no map**. |
| `src/routes/places/+page.svelte` | Owns its own `<MapView>` (desktop, line 1549) and `<MobileMapShell>` (mobile, lines 1521–1530) |
| `src/routes/collections/+page.svelte` | Owns its own `<MapView>` (desktop, line 924) and `<MobileMapShell>` (mobile, line 878) |
| `src/routes/collections/[id]/+page.svelte` | Owns its own `<MapView>` (line 879) and `<MobileMapShell>` (line 647) |
| `src/lib/components/MapView.svelte` | The map component. Creates/destroys the MapLibre instance in `onMount`/cleanup (lines 48–123) |
| `src/lib/components/MobileMapShell.svelte` | Thin wrapper around `<MapView>` adding drag-to-resize behavior |
| `src/routes/places/+page.server.ts` | Server load: 4 parallel queries (places, tags, lists, photos) |
| `src/routes/collections/+page.server.ts` | Server load: 2 parallel queries (lists, photos) |

**Critical observation**: There is only ONE `+layout.svelte` in the entire app (at the root). There are **no nested layouts** under `/places` or `/collections`. Any component rendered inside `{@render children()}` in the layout is fully page-scoped and destroyed on route change.

---

## Lifecycle Findings

### What happens during Places → Collections navigation

```
1. User clicks "Collections" in AppBottomDock
2. SvelteKit client-side navigation begins
3. /collections/+page.server.ts load() runs (2 Supabase queries in parallel)
4. /places/+page.svelte UNMOUNTS:
   ├── All $state variables discarded
   ├── MapView.svelte onMount cleanup fires:
   │   ├── ResizeObserver disconnected
   │   ├── map.remove() called → WebGL context destroyed, tiles freed, DOM cleaned
   │   └── map = null, mapReady = false
   └── MobileMapShell unmounts (if mobile)
5. /collections/+page.svelte MOUNTS:
   ├── Server data hydrated into $state variables
   ├── MapView.svelte onMount fires:
   │   ├── await import('maplibre-gl')       ← dynamic import (cached by browser)
   │   ├── new ml.Map({...})                 ← full WebGL context creation
   │   ├── Style fetch from MapTiler CDN     ← network request
   │   ├── Tile rendering begins
   │   ├── GeolocateControl + AttributionControl added
   │   ├── map.on('load') → mapReady = true
   │   └── syncMarkers() + fitToMarkers()
   └── ResizeObserver starts
```

Collections → Places follows the exact same cycle in reverse.

### Key code evidence

**Destruction** — `MapView.svelte` lines 117–122:
```js
return () => {
    ro?.disconnect();
    map?.remove();
    map = null;
    mapReady = false;
};
```

**Initialization** — `MapView.svelte` lines 54–90:
```js
const mod = await import('maplibre-gl');
ml = mod.default ?? mod;
// ...
map = new ml.Map({
    container,
    style,
    center: [0, 20],
    zoom: 2,
    attributionControl: false,
});
// ... controls, event listeners, ResizeObserver
map.on('load', () => {
    mapReady = true;
    syncMarkers();
    fitToMarkers(false);
});
```

### What the map component does and does NOT do

- **Unmounted**: Yes — the entire Svelte component is destroyed
- **Destroyed**: Yes — `map.remove()` is called, killing the WebGL context
- **Recreated**: Yes — `new ml.Map()` runs from scratch on the new page
- **Rehydrated**: No — there is no state caching; map starts at `center: [0, 20], zoom: 2`
- **Re-fetching all state**: Yes — server load re-fetches all data; markers rebuilt from scratch

---

## Root Cause Analysis

### Primary cause: Page-level component ownership of the map

Both `/places/+page.svelte` and `/collections/+page.svelte` render `<MapView>` directly in their template. SvelteKit navigating between different page routes causes the old page component to fully unmount and the new one to mount. Since `<MapView>` is a child of the page component, it is destroyed and recreated every time.

### What this is NOT caused by

| Potential cause | Status | Why ruled out |
|---|---|---|
| `{#key}` blocks | ❌ Not the cause | No `{#key}` blocks around the map in any page |
| Store resets | ❌ Not the cause | Stores are stateless service modules, not reactive singletons |
| Layout remounting | ❌ Not the cause | Root layout persists correctly across navigations |
| SSR/hydration | ❌ Not the cause | Client-side navigation doesn't re-hydrate |
| Reactive statement loops | ❌ Not the cause | `$effect` guards in MapView are well-implemented with stable derived keys |

### What this IS caused by

- **SvelteKit's page component lifecycle**: different routes = different component instances = mount/unmount cycle
- **Architectural decision**: `<MapView>` is embedded inside each page rather than in a shared parent layout
- **Absence of a shared layout group**: no `(app)/+layout.svelte` grouping for map-bearing pages

---

## Performance Bottlenecks

Ranked by estimated cost per Places ↔ Collections transition:

| Operation | Est. Time | Where in code |
|---|---|---|
| **MapLibre GL initialization** (WebGL context, shader compilation) | 150–400ms | `new ml.Map()` in `MapView.svelte:63` |
| **Tile style fetch + initial tile render** | 200–500ms | MapTiler CDN fetch, depends on network/cache |
| **Dynamic import of maplibre-gl** | 10–50ms (cached) / 200ms+ (cold) | `import('maplibre-gl')` in `MapView.svelte:55` |
| **Server data load** | 50–200ms | `+page.server.ts` Supabase queries |
| **Marker creation** | 5–50ms | `syncMarkers()` creating DOM elements + Popup instances |
| **fitToMarkers / initial positioning** | 10–30ms | `fitToMarkers(false)` in `map.on('load')` |
| **Page component mount/unmount** | 5–20ms | Svelte component lifecycle |
| **Total** | **400–1200ms** | |

For comparison, if the map were preserved, navigation cost drops to **~50–250ms** (server data + marker swap only).

---

## Optimization Options Evaluated

### Option A: Lift MapView into a Shared Layout ⭐ Recommended

Create a route group layout `(app)/+layout.svelte` for `/places` and `/collections` that owns the single `<MapView>`. Pages communicate their `filteredPlaces` upward via a shared store, and the map updates markers reactively.

```
src/routes/(app)/+layout.svelte          ← NEW: contains MapView
src/routes/(app)/places/+page.svelte
src/routes/(app)/collections/+page.svelte
src/routes/(app)/collections/[id]/+page.svelte
```

| Aspect | Details |
|---|---|
| **Pros** | Map never destroyed; zero map boot cost; instant transitions; architecturally correct |
| **Cons** | Significant refactor; pages must communicate filtered places upward; mobile layout (MobileMapShell) complicates shared ownership; layout differences between pages need reconciliation |
| **Complexity** | High |
| **Risk** | Medium |

### Option B: Persistent Map Store (Module-Level Singleton)

Hold the MapLibre instance and DOM container in a module-level store. On mount, `MapView` reparents the existing canvas into the new page's map slot instead of creating a new map.

| Aspect | Details |
|---|---|
| **Pros** | Minimal template changes; map state preserved |
| **Cons** | DOM reparenting can break MapLibre's WebGL internals; careful lifecycle management needed |
| **Complexity** | Medium |
| **Risk** | Medium-High |

### Option C: Cache Map State, Fast Re-Init

Before destroying the map, save center/zoom/bearing/pitch. On next mount, restore these values instead of starting from `[0, 20] zoom 2`.

| Aspect | Details |
|---|---|
| **Pros** | Minimal code changes; preserves visual continuity |
| **Cons** | Still pays full WebGL init + tile render cost (~300–500ms); just reduces perceived jarring |
| **Complexity** | Low |
| **Risk** | Low |

### Option D: Deferred Map Initialization

Show page content immediately; lazy-load the map with a skeleton placeholder using `requestIdleCallback` or `setTimeout`.

| Aspect | Details |
|---|---|
| **Pros** | Navigation feels instant (list appears immediately); simple to implement |
| **Cons** | Map visibly loads after the rest of the page; total cost unchanged, just deferred |
| **Complexity** | Low |
| **Risk** | Low |

### Option E: Layout-Level Persistent Map with CSS Toggle

Place the map in the root layout (always rendered, always alive). Toggle visibility and data binding based on the current route.

| Aspect | Details |
|---|---|
| **Pros** | Map never destroyed; works with current structure |
| **Cons** | Map exists in DOM even when not visible (GPU memory); complex visibility/positioning logic; mobile layout differences hard to reconcile |
| **Complexity** | Medium |
| **Risk** | Medium |

---

## Recommendation

### Most likely root cause

**Page-level component boundaries.** `<MapView>` lives inside `+page.svelte` for both routes, so SvelteKit's page navigation lifecycle destroys and recreates it on every transition.

### Best recommended fix: Option A (Shared Layout)

Create a `(app)` route group with a shared layout that owns the map. This eliminates the root cause. The map persists across Places ↔ Collections navigation, markers update reactively, and transitions become near-instant.

### Lowest-risk fix: Option C + Option D

Save map center/zoom before destroy, restore on re-init, and defer initialization to after navigation paint. Implementable in `MapView.svelte` alone with no architectural changes.

### Best long-term architecture: Option A

A shared layout for map-bearing routes aligns with SvelteKit's layout model (layouts persist, pages swap), eliminates the most expensive operation (map re-init), and creates a natural boundary for shared state.

---

## Implementation Plan for Option A

1. Create `src/routes/(app)/` route group directory
2. Move `/places` and `/collections` routes under `(app)/`
3. Create `(app)/+layout.svelte` that renders the map and exposes a places-binding store
4. Create a shared map store (`src/lib/stores/map-state.svelte.ts`) for pages to set their `filteredPlaces`, `selectedPlaceId`, and `onPlaceSelect` callback
5. Remove `<MapView>` / `<MobileMapShell>` from individual page templates
6. Handle mobile vs. desktop layout differences in the shared layout
7. Ensure `+page.server.ts` files and data loading continue to work under the new route structure
8. Test all navigation paths: Places → Collections, Collections → Places, Collections → Collection Detail, direct URL access, browser back/forward

---

## Related Documentation

- **IMPLEMENTATION.md** — "Trade-off #10: Single Map Instance via CSS Repositioning" documents the within-page decision (mobile vs. desktop) but does not address cross-page persistence
- **PERFORMANCE-AUDIT.md** — Covers Supabase query optimization but not client-side map lifecycle
- **README.md** — Interactive Map feature description does not mention cross-page behavior
