# Performance Audit: Supabase Query Optimization

**Date:** April 4, 2026
**Scope:** All server loads, client-side stores, and API routes

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
