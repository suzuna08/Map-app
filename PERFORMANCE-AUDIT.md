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
| `routes/c/[slug]/+page.server.ts` | 3 | 1 |
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
| `/c/[slug]` (public share) | 3 | 1 |
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
