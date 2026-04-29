# Performance Audit: Supabase Query Optimization

**Date:** April 4, 2026
**Scope:** All server loads, client-side stores, and API routes

> **Note**: The guidelines from this audit have been codified into `.cursor/rules/performance.mdc` for automated enforcement during development.

---

## Problem

Navigating between pages (e.g. clicking "Collections" or "Places" in the navbar) was extremely slow — multiple seconds of latency before any content appeared.

## How We Identified It

We traced the full lifecycle of a route change, from the moment the user clicks a nav link to the moment the page renders. The trace revealed that what should be a single network round-trip was actually **3–5 sequential round-trips**, each blocking the next.

The method:

1. **Start at the hooks middleware** (`hooks.server.ts`) — every request passes through here first
2. **Walk through the layout loaders** (`+layout.server.ts`, `+layout.ts`) — these run before any page load
3. **Read the page server load** (`+page.server.ts`) — this is the main data-fetching step
4. **Check for client-side re-fetches** (`$effect` blocks in `+page.svelte`) — these can throw away server data and re-query

At each step, we asked: *does this make a network call, and does it block the next step?*

## Root Causes Found

### 1. Auth validation on every request

`hooks.server.ts` called `supabase.auth.getUser()` on every single request. This makes a **network round-trip to Supabase Auth** to validate the JWT against the server. The JWT is already cryptographically signed — `getSession()` reads it locally from cookies with zero network cost.

| | Before | After |
|---|--------|-------|
| `hooks.server.ts` | `getSession()` + `getUser()` (1 network call) | `getSession()` only (0 network calls) |

`getUser()` is only needed for sensitive write operations (account changes, deletions), not for scoping read queries by user ID.

### 2. Sequential queries that should be parallel or joined

The most common pattern was a two-phase load: fetch parent rows, extract IDs client-side, then fetch child rows using `.in('id', ids)`. This forces the second query to **wait** for the first to complete.

**Example (collections page server load):**

```
// Phase 1: fetch lists
const listsRes = await supabase.from('lists').select('...').eq('user_id', userId);

// Phase 2: BLOCKED until phase 1 finishes
const listIds = listsRes.data.map(l => l.id);
const listPlacesRes = await supabase.from('list_places').select('...').in('list_id', listIds);
```

**Fix:** Use Supabase's embedded resource syntax to join in a single query:

```
const { data } = await supabase
  .from('lists')
  .select('..., list_places(place_id)')
  .eq('user_id', userId);
```

This lets Postgres handle the join server-side in one round-trip.

**Files that had this pattern:**

| File | Sequential phases | After fix |
|------|:-:|:-:|
| `routes/collections/+page.server.ts` | 2 | 1 |
| `routes/places/+page.server.ts` | 2 | 1 |
| `routes/collections/[id]/+page.server.ts` | 4 | 1 |
| `routes/c/[slug]/+page.server.ts` | 3 | 1 + 1 parallel |
| `lib/stores/collections.svelte.ts` (`loadCollectionBySlug`) | 2 | 1 |

### 3. Unfiltered junction table scans

Several queries fetched **entire junction tables** (`place_tags`, `list_places`) with no user filter — pulling every user's data when we only needed the current user's rows.

```
// Before: fetches ALL rows in place_tags for ALL users
await supabase.from('place_tags').select('place_id, tag_id');

// After: joined through the user's places, automatically scoped
await supabase.from('places').select('..., place_tags(tag_id)').eq('user_id', userId);
```

**Files that had this pattern:**

- `lib/stores/places.svelte.ts` — `loadPlacesData()`, `refreshTagsData()`
- `lib/stores/collections.svelte.ts` — `loadCollections()` (no `user_id` on `lists` query)
- `lib/stores/saved-views.svelte.ts` — `loadSavedViews()` (no `user_id` on `saved_views` query)

### 4. Client-side re-fetches that discard server data

The collections page had a color migration `$effect` that ran on every page load. If any collection had an old color, it would call `refresh()` which **re-fetched everything from Supabase**, throwing away the data the server load had already provided.

**Fix:** Update local state optimistically and fire the DB writes without awaiting or re-fetching.

### 5. N+1 check-then-insert pattern

`applyTagsToPlace()` ran **2 queries per tag** (SELECT to check existence, then conditional INSERT). For 5 tags, that's 10 round-trips.

**Fix:** Replace with a single `.upsert()` call with `ignoreDuplicates: true`:

```
await supabase
  .from('place_tags')
  .upsert(rows, { onConflict: 'place_id,tag_id', ignoreDuplicates: true });
```

Same fix was applied to `applyContextTags` in the add-by-url API route.

## Impact Summary

| Route | Before (sequential round-trips) | After |
|-------|:-:|:-:|
| Any route (auth overhead) | 1 | 0 |
| `/collections` | 2 | 1 |
| `/places` | 2 | 1 |
| `/collections/[id]` | 4 | 1 |
| `/c/[slug]` (public share) | 3 | 1 + 1 parallel |
| Tag apply (per action) | 2N | 1 |

---

## Guidelines to Prevent This in the Future

### Rule 1: Never chain queries when you can join

If your second query depends on IDs from your first query, you almost certainly want an embedded join instead.

```
// BAD: two round-trips
const { data: parents } = await supabase.from('lists').select('id').eq('user_id', uid);
const ids = parents.map(p => p.id);
const { data: children } = await supabase.from('list_places').select('*').in('list_id', ids);

// GOOD: one round-trip
const { data } = await supabase.from('lists').select('*, list_places(*)').eq('user_id', uid);
```

### Rule 2: Always scope queries by user

Every query on a user-owned table must include `.eq('user_id', userId)`. Junction tables without a `user_id` column should be accessed through a joined parent that does have one — never queried directly without a filter.

### Rule 3: Use `upsert` instead of check-then-insert

If you need to insert rows that might already exist, use `.upsert()` with `onConflict` and `ignoreDuplicates: true`. Never SELECT to check existence before INSERTing.

### Rule 4: Don't re-fetch after optimistic updates

If you've already updated local state, don't call a `refresh()` function that re-fetches everything from the server. Only re-fetch if you need data you don't already have locally.

### Rule 5: Trust the JWT for reads

`getSession()` decodes the JWT from cookies locally — zero network cost. Use this for read operations. Reserve `getUser()` (which makes a network call to Supabase Auth) for sensitive writes where you need server-side token validation.

### Rule 6: Audit new server loads with this checklist

Before merging a new `+page.server.ts` or store function, verify:

- [ ] All queries that can run in parallel are wrapped in `Promise.all()`
- [ ] No query depends on the result of a prior query (use joins instead)
- [ ] No junction table is queried without a user-scoping filter
- [ ] No full table scan exists where a filtered query would do
- [ ] Count the total sequential round-trips — the target is **1**

---

## Round 2: Client-Side & API Performance

**Date:** April 6, 2026
**Scope:** Client-side reactivity, API route efficiency, and data transfer volume

### How We Identified It

After the initial query optimization pass, the app remained sluggish as the dataset grew. We audited three additional layers:

1. **Data transfer volume** — are we fetching more rows than the view actually needs?
2. **Client-side reactivity** — do `$effect` and `$derived` blocks fire too often or too broadly?
3. **Write-path efficiency** — are mutations using more round-trips than necessary?

### Root Causes Found

#### 6. Full table scan for URL deduplication

The `add-by-url` API route fetched **every place the user owns** (with `select('*')`) into memory, then searched for a matching URL in JavaScript. As the library grows, this sends an ever-growing payload over the wire just to check for a duplicate.

```
// Before: fetches ALL places to loop through in JS
const { data: existingPlaces } = await supabase
  .from('places').select('*').eq('user_id', user.id).not('url', 'is', null);
const urlMatch = existingPlaces.find(p => normalizeUrl(p.url) === normalizedUrl);

// After: targeted DB query, zero client-side iteration
const { data: urlMatch } = await supabase
  .from('places').select('*').eq('user_id', user.id).eq('url', normalizedUrl).limit(1).maybeSingle();
```

URLs are now normalized before storage so the DB-level equality check works reliably.

| | Before | After |
|---|--------|-------|
| `add-by-url` dedup | Fetch all rows → JS filter | Single indexed query |

#### 7. Server load fetching data the page doesn't need yet

`/collections/[id]` server load fetched **every place the user owns** (with tags) on page load, solely to populate the "Add Places" modal — which most users never open during a visit.

| | Before | After |
|---|--------|-------|
| `/collections/[id]` server load | 3 parallel queries (collection + tags + **all places**) | 2 parallel queries (collection + tags) |
| "Add Places" modal data | Pre-loaded on every visit | Lazy-loaded on modal open |

#### 8. N individual UPDATEs for reorder operations

`reorderCollections()` and `reorderSavedViews()` ran one `.update()` call per item. Reordering 10 collections meant 10 HTTP round-trips.

```
// Before: N round-trips
const updates = orderedIds.map((id, i) =>
  supabase.from('lists').update({ sort_order: i }).eq('id', id));
await Promise.all(updates);

// After: 1 round-trip
const rows = orderedIds.map((id, i) => ({ id, sort_order: i }));
await supabase.from('lists').upsert(rows, { onConflict: 'id' });
```

#### 9. Aggressive full re-fetches after mutations

The `/places` page called `loadData()` (which re-fetches **all** places, tags, and collections) after every URL add, every tag apply, and every tag remove. The API response already contains the new place — adding it to local state is instant.

| Trigger | Before | After |
|---------|--------|-------|
| URL add (new place) | `loadData()` → 3 queries | Optimistic insert into local array |
| URL add (duplicate + tags applied) | `loadData()` → 3 queries | `refreshTags()` → 2 queries |
| Tag remove / apply from context | `loadData()` → 3 queries | `refreshTags()` → 2 queries |

#### 10. Reactive `$effect` firing on every data invalidation

```
$effect(() => {
  void supabase;          // tracks the supabase derived value
  refreshSavedViews();    // fires a network request
});
```

This effect re-runs whenever the layout data changes (e.g. on any SvelteKit `invalidate()` call), causing a redundant saved-views fetch on every navigation. Fixed by guarding it to run only once.

#### 11. Map marker reconciliation on unrelated state changes

The MapView `$effect` tracked the entire `places` array by reference. Editing a note, changing a rating, or toggling tags would re-run `syncMarkers()` — iterating every place and touching DOM elements — even though no coordinates changed.

```
// Before: triggers on ANY places mutation
$effect(() => {
  const _p = places;
  syncMarkers();
});

// After: only triggers when geographic data changes
let markerKey = $derived(
  places.filter(p => p.lat != null && p.lng != null)
    .map(p => `${p.id}:${p.lat}:${p.lng}`).sort().join(',')
);
$effect(() => {
  const _key = markerKey;
  syncMarkers();
});
```

#### 12. N individual DELETEs for tag removal

`removeTagsFromPlace()` fired one `DELETE` per tag. Removing 5 tags = 5 round-trips.

```
// Before: N round-trips
await Promise.all(tagIds.map(tagId =>
  supabase.from('place_tags').delete().eq('place_id', placeId).eq('tag_id', tagId)));

// After: 1 round-trip
await supabase.from('place_tags').delete().eq('place_id', placeId).in('tag_id', tagIds);
```

#### 13. Sequential enrichment blocking the response

`enrich-all` processed places one-at-a-time with a 200ms delay between each. 10 places took 5–10+ seconds. Changed to batch 3 concurrently via `Promise.allSettled` with 200ms delay only between batches.

### Round 2 Impact Summary

| Area | Before | After |
|------|--------|-------|
| `add-by-url` dedup | Full table scan | 1 indexed query |
| `/collections/[id]` page load | 3 queries (all places) | 2 queries (no eager all-places) |
| Reorder (N items) | N round-trips | 1 upsert |
| URL add re-fetch | 3 queries | 0 (optimistic) |
| Saved views init | Fires on every invalidation | Fires once |
| Map marker sync | Every `places` mutation | Only geo changes |
| Tag removal (N tags) | N round-trips | 1 query |
| Enrich-all (10 places) | ~10 sequential fetches | ~4 batches of 3 concurrent |

> **See also**: [PERFORMANCE-URL-SEARCH.md](./PERFORMANCE-URL-SEARCH.md) for a detailed latency instrumentation and analysis of the add-by-url pipeline (parallel dedup/API overlap, shortlink caching, per-stage timing).

---

## Updated Guidelines

### Rule 7: Never fetch a full table to search in JavaScript

If you're fetching rows just to `.find()` or `.filter()` in JS, you can almost always push that predicate into the query itself. Normalize data before storage so equality checks work at the DB level.

### Rule 8: Lazy-load data for modals and secondary UI

If a panel, modal, or drawer is only opened by explicit user action, don't fetch its data in the server load. Fetch it on-demand when the UI opens.

### Rule 9: Use `upsert` for batch writes, `.in()` for batch deletes

Any mutation that operates on a list of IDs should be a single query:
- **Writes:** `.upsert(rows, { onConflict: '...' })`
- **Deletes:** `.delete().in('column', ids)`
- **Never** loop `.update()` or `.delete()` per item.

### Rule 10: Scope reactive effects to the narrowest dependency

If an `$effect` only needs to react to coordinate changes, derive a stable key from coordinates — don't track the entire object array. Use guards (`if (!loaded) { loaded = true; ... }`) to prevent one-time init effects from re-firing.

### Rule 11: Optimistic-first for mutations with known results

When the server response already contains the created/updated object, insert it directly into local state. Reserve full `loadData()` calls for initial page loads or explicit "refresh" actions.

---

## Round 3: Reactivity, Rendering & Regression Sweep

**Date:** April 29, 2026
**Scope:** Server loads (photo queries), client stores (refresh patterns), component reactivity, API routes

### How We Identified It

The app had slowed down again — page loads lagging, tag operations feeling heavy, sidebar and map rendering janky as the dataset grew. We re-audited every layer using the same method: trace the full lifecycle from navigation → server load → client render → user interaction → mutation → re-render, looking for new regressions and patterns that became expensive at scale.

### Root Causes Found

#### 14. Server loads: `place_photos` query left out of `Promise.all`

Both `/places` and `/collections` page server loads added a `place_photos` query after the initial audit but placed it **sequentially** after the parallelized queries, adding a second round-trip:

```
// places/+page.server.ts — 2 sequential round-trips
const [placesRes, tagsRes, listsRes] = await Promise.all([...]); // RT 1
photosRes = await supabase.from('place_photos')...;              // RT 2

// collections/+page.server.ts — also 2 sequential round-trips
const { data: listsData } = await supabase.from('lists')...;    // RT 1
photosRes = await supabase.from('place_photos')...;              // RT 2
```

The `place_photos` query is fully independent and should be folded into the existing `Promise.all`. The `/collections` page also has no `Promise.all` at all — both its queries run sequentially.

| Route | Before (sequential RTs) | After fix |
|-------|:-:|:-:|
| `/places` | 2 | 1 |
| `/collections` | 2 | 1 |

#### 15. `refreshTagsData()` — full re-fetch after every tag mutation

The `refreshTagsData()` function fetches **all tags + all places with place_tags** (2 queries) and is called from at least 10 different places across 3 page components — after every tag apply, tag remove, tag reorder, single enrich, URL add, and TagManager change. For a user with 200+ places, this is a heavy payload fetched repeatedly when the caller already knows exactly which place and tags were affected.

```
// Called after applying tags to a single known place:
await applyTagsToPlace(supabase, placeId, tagIds);  // 1 upsert
await refreshTags();  // → 2 full-table queries (ALL tags + ALL places with place_tags)
```

A targeted `updatePlaceTagsLocally(placeId, newTagIds)` helper that patches the `placeTagsMap` in-place would eliminate most of these round-trips.

#### 16. `TagSidebar.tagCount()` — O(N×M) per render

The `tagCount(tagId)` function scans every place's tag array to count occurrences, and it's called once **per visible tag** in the sidebar template:

```
function tagCount(tagId: string): number {
    return Object.values(placeTagsMap).filter(tags =>
        tags.some(t => t.id === tagId)).length;
}
// Called in template: {#each categoryTags as tag} {@const count = tagCount(tag.id)}
// Called again for: {#each areaTags as tag} {@const count = tagCount(tag.id)}
// Called again for: {#each userTags as tag} {@const count = tagCount(tag.id)}
```

With 200 places and 30 tags, that's 6,000 iterations per render. Fix: pre-compute a `$derived` counts map in a single O(N) pass:

```
let tagCounts = $derived(
    Object.values(placeTagsMap).reduce((acc, tags) => {
        for (const t of tags) acc[t.id] = (acc[t.id] ?? 0) + 1;
        return acc;
    }, {} as Record<string, number>)
);
```

#### 17. MapView: `JSON.stringify(placePhotos)` on every effect evaluation

The photo-update `$effect` serializes the entire `placePhotos` record to detect changes:

```
$effect(() => {
    if (!mapReady || !map) return;
    const photoKey = JSON.stringify(placePhotos);  // expensive for large photo sets
    if (photoKey === prevPhotoKey) return;
    prevPhotoKey = photoKey;
    // ... update all popup HTML
});
```

This runs on every change to `mapReady`, `map`, `placePhotos`, or `places` (all read inside the body). For users with many photos, the serialization itself is expensive. Fix: derive a stable key from photo counts or IDs, similar to `markerKey`.

#### 18. MapView: selection effect iterates all markers on unrelated changes

```
$effect(() => {
    if (!mapReady || !map) return;
    const sid = selectedPlaceId;
    const offset = getFrameOffset();  // reads mapMode
    const mode = mapMode;

    markersMap.forEach((entry, id) => {
        entry.el.classList.toggle('map-marker--selected', id === sid);
    });
    // ...flyTo logic
});
```

This effect tracks `mapReady`, `map`, `selectedPlaceId`, `mapMode` — and toggles CSS classes on **every** marker whenever any of these changes. When only the selected place changes, only the old and new markers need updating.

#### 19. Search filter rebuilds haystack strings on every keystroke

`filteredPlaces` is a `$derived` that builds a `.toLowerCase()` haystack string for **every place** on every evaluation:

```
let filteredPlaces = $derived(
    scopedPlaces.filter((p) => {
        const haystack = [p.title, p.description ?? '', p.address ?? '', ...]
            .join(' ').toLowerCase();
        return terms.every(term => haystack.includes(term));
    })
);
```

With 300+ places, this runs 300+ string concatenations + lowercases on every keystroke. Fix: pre-compute the haystack as a `$derived` map keyed by place ID, so it only rebuilds when place data changes (not on every search character).

#### 20. Sort comparator creates `new Date()` objects per comparison

```
let sortedPlaces = $derived(
    [...filteredPlaces].sort((a, b) => {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
);
```

O(N log N) `Date` constructions per sort. Fix: pre-compute timestamps on the place objects or in a `$derived` map.

#### 21. `collections/[id]` — `openAddModal()` calls itself (infinite recursion)

```
async function openAddModal() {
    openAddModal();  // BUG: calls itself → stack overflow
    addSearch = '';
    // ...
}
```

This is a critical bug — `showAddModal = true;` was likely the intended first line.

#### 22. `collections/[id]` — redundant re-fetch when data is already available

`handleAddPlace` fetches the place again from Supabase even though it's already in `allPlaces` (loaded when the modal opened). Same pattern in `handleAddByUrl` where the API response already contains the place object.

```
// allPlaces already has the full place data from the modal load
const fullPlace = allPlaces.find((p) => p.id === placeId);
if (fullPlace) {
    // But then fetches it AGAIN from Supabase:
    const { data: placeData } = await supabase
        .from('places').select('...').eq('id', placeId).single();
```

#### 23. Intel-tags API: unnecessary Google API call for enriched places

`/api/places/[id]/intel-tags` calls `fetchPlaceDetails()` (a Google Places API round-trip of 200–500ms) on **every request**, even for places that are already enriched and have `primary_type` stored in the DB:

```
if (place.url && place.enriched_at) {
    const details = await fetchPlaceDetails(place.url, place.title);  // why?
    // primary_type is already in place.primary_type!
}
```

Both the `if` and `else if` branches do the exact same thing. The stored `primary_type` from enrichment should be used directly.

#### 24. Admin intel-catalog: check-then-insert loop (2N sequential queries)

The catalog seeder loops each entry with a SELECT + conditional INSERT/UPDATE — the exact anti-pattern from Rule 3. For N catalog types + M mappings, this fires `2*(N+M)` sequential queries:

```
for (const entry of GOOGLE_PLACE_TYPE_CATALOG) {
    const { data: existing } = await supabase.from(...).select('id').eq(...).single(); // query 1
    if (existing) await supabase.from(...).update({...}).eq(...);  // query 2a
    else          await supabase.from(...).insert({...});          // query 2b
}
```

Fix: replace both loops with single `.upsert()` calls, reducing hundreds of queries to 2.

#### 25. Collections: full `refresh()` after create/delete

`createCollection` returns the full collection object, but the caller discards it and re-fetches all collections. Same for `deleteCollection` — the ID is known so an optimistic filter-out would suffice:

```
await createCollection(supabase, userId, name, opts);  // returns the new collection
await refresh();  // → re-fetches ALL collections (discards return value)
```

### Round 3 Impact Summary

| Area | Before | After |
|------|--------|-------|
| `/places` page load | 2 sequential RTs | 1 (photo query in `Promise.all`) |
| `/collections` page load | 2 sequential RTs | 1 (add `Promise.all`) |
| Tag mutations (each) | 2 full-table queries via `refreshTags()` | 0 (optimistic local update) |
| TagSidebar render (30 tags × 200 places) | 6,000 iterations | 200 iterations (pre-computed map) |
| MapView photo sync | `JSON.stringify` entire record per eval | Lightweight derived key |
| MapView selection | Iterates all markers | Touch only old + new |
| Search per keystroke | 300+ haystack rebuilds | Pre-computed, only on data change |
| Sort (newest/oldest) | O(N log N) Date objects | Pre-computed timestamps |
| `collections/[id]` add modal | **Crashes** (infinite recursion) | `showAddModal = true` |
| `collections/[id]` add place | 1 redundant Supabase query | 0 (use existing data) |
| Intel-tags API | Unnecessary Google API call (~300ms) | Use stored `primary_type` |
| Admin catalog seed (N+M items) | 2(N+M) sequential queries | 2 upserts |
| Collection create/delete | Full re-fetch after each | Optimistic update |

---

## Updated Guidelines

### Rule 12: Pre-compute expensive derived values in a single pass

If a function is called per-item in a template loop (e.g., `tagCount(tagId)` inside `{#each}`), extract it into a single `$derived` map computed once, not per-item. O(N) total beats O(N×M).

### Rule 13: Use lightweight derived keys for `$effect` change detection

Never use `JSON.stringify()` on large objects inside `$effect` to detect changes. Derive a stable key from the minimal set of fields that matter (counts, IDs, or hashes). Follow the `markerKey` pattern:

```ts
let photoKey = $derived(
  Object.entries(placePhotos).map(([id, urls]) => `${id}:${urls.length}`).sort().join(',')
);
```

### Rule 14: Pre-compute search haystacks outside the filter

When filtering by text search, build the searchable string per item in a `$derived` map that only recomputes when the source data changes — not on every keystroke:

```ts
let haystacks = $derived(
  Object.fromEntries(places.map(p => [p.id,
    [p.title, p.address ?? '', p.area ?? ''].join(' ').toLowerCase()
  ]))
);
```

### Rule 15: Scope `$effect` dependencies to the narrowest trigger

When an `$effect` only needs to react to one field (e.g., `selectedPlaceId`), avoid reading unrelated reactive values inside the body. If you need multiple values, read them via `$derived` intermediaries so the effect only fires when the relevant value changes.

### Rule 16: Skip queries for data the view won't display

When feature flags or settings control data visibility, check the flag before issuing the query — don't fetch data that will be discarded. For example, the `/c/[slug]` public share page checks `share_photos` and `share_tags` booleans before deciding whether to query `place_photos` and `place_tags`:

```ts
const fetches: Promise<any>[] = [];
if (sharePhotos && placeIds.length > 0) {
  fetches.push(supabase.from('place_photos').select('...').in('place_id', placeIds));
} else {
  fetches.push(Promise.resolve({ data: [] }));
}
// Same pattern for tags
const [photosRes, tagsRes] = await Promise.all(fetches);
```

This avoids wasting bandwidth and Supabase compute on data the page won't render.
