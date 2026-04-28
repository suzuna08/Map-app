# Implementation Notes

Detailed documentation of the architecture, design decisions, trade-offs, and bugs encountered while building MapOrganizer.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Authentication](#authentication)
- [Data Model & Database](#data-model--database)
- [CSV Import Pipeline](#csv-import-pipeline)
- [Google Places Enrichment](#google-places-enrichment)
- [URL Import & Deduplication](#url-import--deduplication)
- [Contextual Capture (Auto-Tagging)](#contextual-capture-auto-tagging)
- [Tagging System](#tagging-system)
- [Filtering & Sorting](#filtering--sorting)
- [Personal Rating System](#personal-rating-system)
- [Saved Views](#saved-views)
- [Collections](#collections)
- [Intel Tagging System](#intel-tagging-system)
- [Map Integration](#map-integration)
- [UI Components & Interactions](#ui-components--interactions)
- [Root Layout & Global Concerns](#root-layout--global-concerns)
- [Responsive Design](#responsive-design)
- [Configuration & Tooling](#configuration--tooling)
- [Performance Optimization](#performance-optimization)
- [Trade-offs](#trade-offs)
- [Bugs & Fixes](#bugs--fixes)
- [Known Inconsistencies](#known-inconsistencies)
- [Playground Migration](#playground-migration)

> **See also**: [UI-DESIGN.md](./UI-DESIGN.md) for a detailed visual design specification covering color palettes, component anatomy, layout measurements, and interaction patterns.

---

## Architecture Overview

The app follows SvelteKit's file-based routing with a clear separation:

- **Pages** (`src/routes/`) handle layout, navigation, and page-level state
- **Components** (`src/lib/components/`) are reusable UI elements (PlaceCard, TagInput, MapView, MobileMapShell, etc.)
- **Stores** (`src/lib/stores/`) contain shared reactive state and data-access helpers (places data loading, toast notifications)
- **Library code** (`src/lib/`) contains business logic (CSV parsing, Google API, tag colors & ordering, tag name normalization, intel tagging engine, URL timing instrumentation)
- **Actions** (`src/lib/actions/`) contain Svelte actions (drag-and-drop sortable)
- **API routes** (`src/routes/api/`) are server-side endpoints for operations that need secrets (Google Places API key) and admin operations (intel catalog seeding)

All data fetching on the places page happens client-side via the Supabase JS client, while enrichment and URL import go through server-side API routes because they need the private `GOOGLE_PLACES_API_KEY`. The map view uses MapLibre GL JS with MapTiler tiles, loaded client-side only via dynamic import to avoid SSR issues.

**Server-side data preloading**: Pages with heavy data requirements (`places`, `collections`, `collections/[id]`, `c/[slug]`) use `+page.server.ts` files to preload data on the server before hydration. All server loads use Supabase's embedded resource syntax (e.g., `places.select('..., place_tags(tag_id)')`) to fetch parent rows and their related junction data in a single query, eliminating sequential round-trips. Independent queries are wrapped in `Promise.all()` for parallel execution. For example, `places/+page.server.ts` runs three parallel queries — places (with embedded place_tags), tags, and lists (with embedded list_places) — in a single wall-clock round-trip. `collections/+page.server.ts` fetches lists with embedded `list_places(place_id)`, ordered by `updated_at` descending. `collections/[id]/+page.server.ts` uses a deep nested join (`list_places(place_id, places(...))`) to fetch the collection, its member places, and full place details in one query, alongside a parallel tags query. `c/[slug]/+page.server.ts` uses the same deep nested join pattern to load the public collection and all its places in a single query. See [PERFORMANCE-AUDIT.md](./PERFORMANCE-AUDIT.md) for the full optimization history.

State management uses Svelte 5 runes throughout:
- `$state` for mutable reactive variables
- `$derived` for computed values (filtered lists, tag counts, etc.)
- `$effect` for side effects (session redirects, data loading)
- `$props` for component inputs (replaces Svelte 4's `export let`)

Shared state is extracted into `.svelte.ts` modules in `src/lib/stores/`:
- **`places.svelte.ts`**: Data-access functions (`loadPlacesData`, `refreshTagsData`, `buildPlaceTagsMap`, `removeTagsFromPlace`, `applyTagsToPlace`, `applyTagToPlaces`) that encapsulate Supabase queries and the placeTagsMap join logic. Queries use embedded joins (e.g., `places.select('..., place_tags(tag_id)')`) to fetch junction data through user-scoped parent rows rather than scanning unfiltered junction tables. `applyTagsToPlace` uses a single `.upsert()` call with `ignoreDuplicates: true` instead of per-tag check-then-insert. These are plain async functions, not Svelte stores -- the reactive state lives in the page components that call them.
- **`collections.svelte.ts`**: Async CRUD module for the `lists` / `list_places` tables. Provides `loadCollections`, `createCollection`, `updateCollection`, `deleteCollection`, `reorderCollections`, `addPlaceToCollection`, `addPlacesToCollection`, `removePlaceFromCollection`, `enableSharing`, `disableSharing`, `loadCollectionBySlug`, `loadCollectionPlaces`, and optimistic client-side helpers. See [Collections](#collections).
- **`saved-views.svelte.ts`**: Async CRUD for the `saved_views` table. Provides `loadSavedViews`, `createSavedView`, `updateSavedView`, `deleteSavedView`, `reorderSavedViews`, and `buildFiltersSnapshot`. See [Saved Views](#saved-views).
- **`toasts.svelte.ts`**: A module-level `$state` array of toast notifications with `showToast()`, `getToasts()`, and `dismissToast()` exports. This enables toasts to be triggered from any component (page, API callback, undo handler) without prop-drilling.
- **`bottom-dock-suppressed.ts`**: A classic Svelte `writable` boolean store. Set to `true` by modals (e.g., `PlaceActionMenu`) that need to temporarily hide the `AppBottomDock`.
- **`dock-scroll-state.ts`**: Scroll-direction-aware dock visibility controller. Exports `dockMode` (writable `'active'` | `'passive'`) and `initDockScrollWatcher()` which attaches scroll/touch listeners and returns a cleanup function. See [Navigation: AppBottomDock](#navigation-appbottomdock).

Runes are enabled project-wide via `svelte.config.js` with `dynamicCompileOptions` -- all non-`node_modules` files are compiled in runes mode. There is no per-file `<svelte:options runes />` needed.

---

## Authentication

### Supabase SSR Setup

Auth is handled through `@supabase/ssr` with a server hook (`hooks.server.ts`) and a universal layout load (`+layout.ts`).

**Server hook** (`hooks.server.ts`): Creates a server-side Supabase client that reads/writes cookies for session persistence. It exposes a `safeGetSession` helper on `event.locals`. Cookie options include `httpOnly: false` (required for the Supabase browser client to manage sessions), `sameSite: 'lax'`, and a 30-day `maxAge` for session persistence across browser restarts.

**The `safeGetSession` pattern**: `getSession()` reads the session from the JWT in the cookie locally with zero network cost — the JWT is cryptographically signed so it can be trusted for read operations. If there's no session, it returns null. If there is, it returns `{ session, user: session.user }` directly from the JWT without calling `getUser()`. This eliminates the network round-trip to Supabase Auth that previously occurred on every request. The trade-off is that a revoked session won't be detected until the JWT expires, but RLS policies enforce row-level access control as a second layer of defense. `getUser()` (which makes a network call to validate the token server-side) is reserved for sensitive write operations, not routine page loads.

**Universal layout** (`+layout.ts`): Creates a browser or server Supabase client depending on context. On the browser side, it uses `createBrowserClient`; on the server, `createServerClient` with empty cookie stubs (the real cookie handling happens in the hook).

**Auth state sync**: The root layout (`+layout.svelte`) subscribes to `onAuthStateChange` and calls `invalidate('supabase:auth')` when the session changes. To avoid unnecessary refetches, the listener compares `newSession?.expires_at` with the current session's `expires_at` and only invalidates if the expiry actually changed.

**Proactive token refresh**: The root layout schedules a timer to refresh the session 5 minutes before the JWT expires (`REFRESH_MARGIN_MS = 5 * 60 * 1000`). `scheduleTokenRefresh()` calculates the delay as `expiresAt - now - margin` and calls `supabase.auth.refreshSession()` when it fires. If the refresh fails (e.g., session revoked server-side), the user is redirected to `/login`. The timer is cleared and rescheduled on every auth state change.

**Visibility-based session check**: A `visibilitychange` listener detects when the browser tab returns to the foreground. If the session is near expiry (within the 5-minute margin), it triggers an immediate refresh. If there's no current session, it invalidates to update the UI.

**Server-side route protection**: `hooks.server.ts` defines a `PROTECTED_ROUTES` array (`/places`, `/upload`, `/api/places`, `/collections`, `/settings`). If there's no session and the request path starts with any protected route, the hook issues a `303` redirect to `/login?redirect=<intended_path>`. This is the primary access control mechanism, replacing the previous client-side-only `$effect` redirect approach.

**Login page redirect**: The login page reads the `redirect` query param and uses `getSafeRedirect()` to validate it before navigating. The function rejects non-relative paths, double-slash prefixes (protocol-relative URLs), and paths that point back to `/login` itself. Invalid redirects fall back to `/places`.

**Email confirmation** (`auth/confirm/+server.ts`): A GET endpoint that handles email confirmation callbacks. Supports both PKCE flows (via `code` query param and `exchangeCodeForSession`) and magic link flows (via `token_hash` + `type` params and `verifyOtp`). On success, redirects to the `next` query param (defaults to `/login`). On failure, redirects to `/login?error=invalid-confirmation-link`.

---

## Data Model & Database

### Tables

**`places`** -- The core table. Originally just the CSV fields (title, note, url, tags, comment, source_list), later extended with enrichment columns (google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at). Personal rating columns (`user_rating`, `user_rated_at`) allow the user to rate places on a 0.5–5.0 scale; the Google-sourced `rating`/`rating_count` columns are retained in the DB but no longer shown in the UI.

**`tags`** -- A separate tags table with three source types:
- `category` -- auto-created from Google Places type data (e.g., "Restaurants", "Cafes")
- `area` -- auto-created from address components (e.g., "Shibuya", "Shinjuku")
- `user` -- manually created by the user

**`place_tags`** -- Junction table linking places to tags (many-to-many).

**`profiles`** -- User profile data synced from Supabase Auth. Columns: `id` (references `auth.users`), `email`, `name`, `avatar_url`, `created_at`, `updated_at`. Auto-populated via two database triggers:
- `on_auth_user_created`: Fires after insert on `auth.users`. Copies `email`, `full_name` (or `name`), and `avatar_url` from `raw_user_meta_data` into the profiles row.
- `on_auth_user_updated`: Fires after update on `auth.users`. Keeps `email`, `name`, and `avatar_url` in sync when the user's auth data changes.

Both triggers use `security definer` with `search_path = ''` to safely access the `auth` schema.

**`lists`** and **`list_places`** -- Used for the Collections feature. `lists` stores user-created collections with name, description, color, optional `emoji` (a single emoji character for the collection icon), visibility (`'private'` or `'link_access'`), optional `share_slug` for public sharing, and `sort_order` (integer for user-defined ordering). `list_places` is the junction table linking places to collections. Extended via `add_collections_columns.sql`, `add_list_places_position.sql`, `add_emoji_column.sql`, and `add_list_sort_order.sql` migrations.

**`saved_views`** -- Persists user-defined filter/sort/layout presets. Stores `filters_json` (JSONB with category, area, custom tag IDs and source), `sort_by`, `layout_mode`, and `order_index` (integer for user-defined ordering). See [Saved Views](#saved-views).

**`google_place_type_catalog`** -- Stores the official Google Places API (New) type keys with metadata: `type_key`, `can_be_primary`, `table_group` (A/B/C), `status` (active/deprecated/unmapped). Read-only for authenticated users; admin writes happen via service role or the `/api/admin/intel-catalog` endpoint.

**`intel_tag_mappings`** -- Maps Google type keys to internal product-level classifications: `primary_category`, `operational_status`, `market_niche`, `discussion_pillar`, `suggested_tags` (JSONB array), and `market_context` (free-text context for market discussion). References `google_place_type_catalog` via foreign key. This is the editable layer that separates external taxonomy from internal business intelligence.

**`place_intel_tags`** -- Optional per-place cache of computed intel tag results. Stores the resolved classification, source types, and an `approved` flag for future user-approval workflows. Unique on `place_id`.

### Row-Level Security

All tables have RLS enabled. Policies ensure users can only see/modify their own data. For `list_places`, the policy checks ownership through the parent `lists` table. For `tags` and `place_tags`, ownership is verified through the parent `places` table (place_tags) or directly via `user_id` (tags). Shared collections (`visibility = 'link_access'`) have additional read-only policies allowing anonymous SELECT on tags and place_tags that belong to places inside a shared collection.

### Migration Gap

The `migration.sql` file only defines `places`, `lists`, and `list_places`. The `tags` and `place_tags` tables (along with enrichment columns on `places`) were added later directly in Supabase. The TypeScript types in `database.ts` reflect the full schema.

A separate `add_tag_order_index.sql` migration adds the `order_index` column to `tags` for drag-and-drop reordering. Because this column may not exist on older deployments, all code that reads or writes `order_index` checks the Supabase `{ error }` response and falls back silently on failure (see [Tag Reordering](#tag-reordering--drag-and-drop)).

A third migration file, `add_profiles_table.sql`, creates the `profiles` table with RLS policies and the two auth triggers. This migration is independent of the others and can be run at any time.

A fourth migration file, `add_saved_views.sql`, creates the `saved_views` table with full CRUD RLS policies scoped to `auth.uid() = user_id`.

A fifth migration file, `add_collections_columns.sql`, adds `visibility` and `share_slug` columns to `lists` and creates three public-access RLS policies for link-accessible collections.

A sixth migration file, `add_list_places_position.sql`, adds a `position` integer column to `list_places` for manual ordering within collections.

A seventh migration file, `add_intel_tag_system.sql`, creates three tables for the intel tagging system: `google_place_type_catalog` (type registry), `intel_tag_mappings` (classification rules), and `place_intel_tags` (per-place computed cache). Catalog and mappings are read-only for authenticated users; place intel tags have full CRUD policies scoped to the owning user.

An eighth migration file, `add_user_rating.sql`, adds `user_rating` (numeric(2,1)) and `user_rated_at` (timestamptz) columns to `places` with a CHECK constraint enforcing 0.5–5.0 half-star values.

A ninth migration file, `fix_rls_data_isolation.sql`, enables RLS on the `tags` and `place_tags` tables (which were previously missing it) and creates full CRUD policies scoped to the owning user. Additional read-only policies allow anonymous SELECT on tags and place_tags for places that belong to a `link_access` collection (currently unused by the public share page, but available for future tag display).

A tenth migration file, `add_emoji_column.sql`, adds an optional `emoji` text column to the `lists` table. It stores a single emoji character (e.g. a food emoji) as the collection icon; `NULL` means no emoji is set and the UI falls back to the default color-circle icon.

### Type Name vs. Table Name

In `database.ts`, the tags table is keyed as `tags_table` in the type definition, but the Supabase client queries it as `.from('tags')`. The actual Postgres table name is `tags`. This mismatch is cosmetic -- the type is only used for `Tag = Database['public']['Tables']['tags_table']['Row']`, not for query building.

---

## CSV Import Pipeline

### Flow

1. User drops or selects CSV files on the upload page
2. PapaParse parses each file with `header: true` to get objects with Title, Note, URL, Tags, Comment fields
3. Results are previewed in the UI with file names and place counts
4. On "Import", the app fetches existing URLs from the database for deduplication
5. New places are inserted in bulk per file, with `source_list` set to the filename (minus `.csv`)

### Deduplication

During CSV import, deduplication is URL-based only. The app loads all existing URLs for the user, builds a `Set`, and skips any place whose URL is already present. This is simpler than the URL import deduplication (which also checks google_place_id and title+address) because CSV imports typically haven't been enriched yet.

---

## Google Places Enrichment

### Three-Strategy Lookup (`fetchPlaceDetails`)

The enrichment system tries multiple strategies to find a place, falling back to the next if one fails:

**Pre-strategy -- `share.google` scraping**: If the URL is a `share.google` link and no search text, coordinates, or chip place ID could be extracted from it, the function fetches the share page HTML and attempts to extract a place name from the `og:title` meta tag or the `<title>` tag (stripping Google-branded suffixes). This name becomes the `searchText` for Strategy 2.

**Strategy 1 -- Place ID lookup**: If the Google Maps URL contains a `ChIJ...` identifier (found via regex), it makes a direct GET request to `places/{placeId}`. This is the most accurate method.

**Strategy 2 -- Text search**: Extracts the place name from the URL path (`/maps/place/Place+Name`) or query params (`?q=...`). Sends a text search request, optionally biased by coordinates extracted from the URL (`@lat,lng`). The location bias uses a 500m radius circle.

**Strategy 3 -- Coordinate fallback**: If there are coordinates but no usable text, searches for `*` with a tight 50m radius bias. This is a last resort that may return the wrong place.

### Category Mapping

Google Places types (like `restaurant`, `cafe`, `bakery`) are mapped to user-friendly categories through a hardcoded `TYPE_TO_CATEGORY` dictionary. This groups ~40 specific types into ~12 broader categories (Restaurants, Cafes, Bars & Nightlife, etc.). Unmapped types fall back to "Other".

### Area Extraction

Area is extracted from `addressComponents` with a priority order:
1. `sublocality_level_1`
2. `sublocality`
3. `locality`
4. `administrative_area_level_2`
5. `administrative_area_level_1`

There's special handling for Japanese addresses: values that are purely numeric or contain "chome" (a Japanese address subdivision) are skipped. If address components don't yield a useful result, the system falls back to parsing the `formattedAddress` string.

### Batch Enrichment

The `/api/places/enrich-all` endpoint processes up to 10 unenriched places per request. Places are processed in batches of 3 concurrent requests via `Promise.allSettled`, with a 200ms delay between batches to stay under Google's rate limits. The frontend shows the result count and reloads data on completion.

### System Tag Creation

System tags (category and area) are no longer auto-created during enrichment. The original `upsertSystemTags` function has been removed. Category and area information from Google Places enrichment is stored directly on the `places` row (`category`, `area` columns) and used for filtering without creating separate tag rows. The intel tagging system provides richer classification via `suggested_tags` in the enrichment response.

The `tag-utils.ts` module still exists and exports two utility functions used throughout the tagging system: `normalizeTagName(name)` (lowercases, trims, collapses whitespace for deduplication) and `toDisplayName(name)` (title-cases all-lowercase input while preserving mixed-case). These are used by TagInput, TagManager, TagContextMenu, and the upload page for consistent tag name handling.

---

## URL Import & Deduplication

### URL Resolution

Google Maps URLs come in many forms:
- Full URLs: `https://www.google.com/maps/place/...`
- Shortened: `https://maps.app.goo.gl/abc123`
- Share links: `https://share.google/...`
- With tracking params: `?g_st=ic`

The `resolveGoogleMapsUrl` function handles shortened links by following redirects. It first strips tracking params with `cleanGoogleMapsUrl`, then tries `fetch` with `redirect: 'follow'`. If that fails, it tries `redirect: 'manual'` and follows the `Location` header step by step.

**`share.google` handling**: Share links (`share.google/*`) often can't be resolved via HTTP redirects alone -- they may return an HTML page rather than redirecting. The resolver attempts multiple extraction strategies from the HTML response: `<meta>` refresh tags, direct Google Maps URLs in the page body, and `maps.google.*` links. If none of these yield a valid Maps URL, the function returns the original `share.google` URL and the caller falls back to search-based place lookup.

For unresolvable share URLs, the `add-by-url` endpoint skips URL-based extraction (place ID, coordinate parsing) and relies entirely on the Places API text search. After the API call returns a `google_place_id`, a deferred duplicate check runs against that ID. The stored URL is rewritten to a canonical `google.com/maps/place/...?ftid=` form via `buildGoogleMapsUrl()` so that future duplicate checks work correctly.

### Three-Layer Deduplication

When adding a place by URL, the system checks for duplicates in three ways:

1. **Google Place ID**: If the resolved URL contains a hex place ID (`0x...:0x...`), check if any existing place has the same `google_place_id`
2. **Normalized URL**: Strip trailing slashes and query params, then compare against all existing URLs
3. **Title + Address**: After fetching details from Google, check if a place with the exact same title and address already exists (catches CSV-imported places that were later enriched)

If a duplicate is found at any layer, the API returns `{ duplicate: true }` with the existing place data instead of inserting. If context tagging is active (see [Contextual Capture](#contextual-capture-auto-tagging)), the duplicate response also includes `contextTagsApplied` indicating how many new tags were linked to the existing place.

For newly inserted places, the endpoint also computes intel tags via `computeIntelTags()` using the Google-returned `primary_type` and `types` array. The intel result (`primary_category`, `operational_status`, `market_niche`, `discussion_pillar`, `suggested_tags`) is included in the response for client-side consumption.

### URL Normalization

The `add-by-url` endpoint has its own `normalizeUrl()` function that's distinct from `cleanGoogleMapsUrl()` in `google-places.ts`. It selectively strips tracking parameters (`g_st`, `utm_*`, etc.) while keeping place-identifying params (`q`, `query`, `center`, `ftid`). The enrichment code's `cleanGoogleMapsUrl` is more aggressive, stripping all query params from shortened URLs. This difference exists because the endpoint needs a clean URL for database comparison, while the enrichment code just needs to avoid consent-page redirects.

### Source List Tagging

Places added via URL import get `source_list: 'url-import'`, while CSV-imported places get the filename (minus `.csv`) as their `source_list`. This enables filtering by import source, though there is currently no standalone UI to select a source — source filters can only be activated through Saved Views (which persist a `source` field in `filters_json`). An active source filter is shown as a dismissible chip in the filter summary row.

### Inline URL Detection in Search

The search bar doubles as a URL input. A regex (`isGoogleMapsUrl`) detects when the search field contains a Google Maps URL (matching `maps.google.*`, `google.*/maps`, `maps.app.goo.gl`, `goo.gl/maps`, `share.google`). When a URL is detected:

- The search filter is bypassed (`matchesSearch` returns true when `detectedUrl !== null`), so all places remain visible
- A "Press Enter to add" hint replaces the search icon
- Pressing Enter triggers `addPlaceFromUrl()` instead of filtering
- On success/duplicate/error, a toast is shown and the search field is cleared and refocused

This avoids the need for a separate "Add Place" dialog for the common case of pasting a link.

---

## Contextual Capture (Auto-Tagging)

When the user has custom tag filters active (e.g., viewing places tagged "Date Night"), new places added via URL import can be automatically tagged with those same tags. This creates a natural workflow: filter to a tag view, paste URLs, and they're automatically organized.

### How It Works

1. The places page tracks `selectedCustomIds` (currently active custom tag filter IDs) and `selectedCustomTagNames` (their display names)
2. When a URL is detected in the search bar and custom tags are selected, a **contextual capture banner** appears below the search bar showing "Adding into: Tag1 + Tag2"
3. The banner includes an "Auto-tag ON/OFF" toggle (`autoApplyCurrentViewTags` state) so users can disable it without clearing their filters
4. When the URL is submitted, `contextTagIds` and `autoApplyContextTags` are sent in the POST body to `/api/places/add-by-url`

### Server-Side Tag Application (`applyContextTags`)

The endpoint validates context tag IDs before applying them:
1. Queries the `tags` table to confirm each ID belongs to the current user and has `source: 'user'` (prevents linking to other users' tags or system tags)
2. Uses a single `.upsert()` with `onConflict: 'place_id,tag_id'` and `ignoreDuplicates: true` to link all valid tags in one round-trip, skipping any that already exist
3. Returns the count of newly applied tags

### Toast Feedback

The response includes `contextTagsApplied` and `contextTagsRequested` counts, enabling nuanced toast messages:

- **New place + tags applied**: "Added to Date Night" with an Undo action
- **Duplicate + tags applied**: "Already saved. Added tags: Date Night" with an Undo action
- **Duplicate + tags already present**: "Already saved in this view"
- **New place + no tags + not visible in current filters**: "Added, but doesn't match this view" with "Tag to current view" and "Clear filters" actions
- **Undo**: Calls `removeTagsFromPlace()` to unlink the auto-applied tags, then reloads data

---

## Tagging System

### Three Tag Sources

- **Category tags** (gray, `#6b7280`): Auto-generated from Google Places types. Not editable by the user.
- **Area tags** (blue, `#3b82f6`): Auto-generated from address components. Not editable by the user.
- **User tags** (custom colors): Created and managed by the user. Support rename, recolor, and delete.

### Tag Colors

User tags get deterministic colors via `colorForTag`: the tag name is normalized (lowercase, trimmed, single spaces), then hashed with djb2, and the hash modulo the palette length picks from a curated 6-color muted palette (muted gold, stone sage, slate blue, terracotta, muted teal, dusty purple). The same name always gets the same color, but users can override it.

A `textColorForBg(bg)` helper is intended to return dark text (`#3a3028`) on light backgrounds and white (`#ffffff`) on dark ones. However, the `LIGHT_BG_SET` used for the check is currently empty, so the function always returns white. This means user-overridden light background colors will have white (low-contrast) text until the set is populated.

### TagInput Component

The inline tag input on each place card uses a portal pattern: the dropdown suggestions are appended to `document.body` instead of rendered in place. This avoids z-index and overflow clipping issues caused by the card's `overflow: hidden` and 3D transform context.

The input supports:
- Typing to filter existing tags
- Enter to add the top suggestion or create a new tag
- Escape to dismiss
- "Create" option shown only when no exact match exists

Tag names are auto-capitalized (title case) if typed in all-lowercase, but mixed-case input is preserved as-is.

### TagInput -- Focus Management

The tag dropdown uses two timing tricks to handle the blur/click race condition:

- **`onmousedown` with `preventDefault`**: Dropdown items use `onmousedown` instead of `onclick`. The `preventDefault()` stops the input from losing focus before the selection handler fires. Without this, the blur event would close the dropdown before the click registers.
- **Blur delay**: The `onblur` handler uses `setTimeout(..., 150)` before closing suggestions. This window lets the `mousedown` on a suggestion fire first. The 150ms is long enough for the click to register but short enough to feel instant.

### TagContextMenu

Right-clicking a user tag opens a context menu with rename, recolor, and delete options. The menu position is clamped to the viewport edges (`window.innerWidth - 216` and `window.innerHeight - 220`) so it doesn't overflow off-screen.

### Tag Reordering / Drag-and-Drop

Tags in all three groups (category, area, custom) support drag-and-drop reordering via a custom Svelte action (`use:sortable` in `sortable.ts`).

**Sortable action**: Implements drag-and-drop with both mouse and touch support. On touch devices, a configurable long-press initiates drag (default 400ms; the mobile tag strip on the places page uses 500ms). The action accepts configuration: `onReorder` callback, `itemSelector`, `idAttribute`, `longPressMs`, and `disabled`.

**Ghost element**: During drag, a cloned element follows the cursor with `position: fixed`, `z-index: 9999`, `scale(1.06)`, and `box-shadow` for visual feedback. The original element gets `opacity: 0.3`.

**Drop position**: Insert position is calculated using distance to item midpoints. An item is placed "after" when `cy > midY + 30% * height` or when vertically centered and `cx > midX`. Edge zones (40px from container edges) trigger horizontal auto-scroll during drag.

**Persistence** (`tag-order.ts`): After reorder, `saveTagOrder()` writes the new `order_index` values to the `tags` table. `getNextOrderIndex()` assigns the next available index to new tags. `reindexAfterDelete()` renumbers remaining tags after a deletion. All functions check the Supabase `{ error }` response and fall back silently when the `order_index` column doesn't exist (added via a separate migration).

---

## Filtering & Sorting

### Filter Logic (Mixed AND/OR)

The filter combines different tag types with different logic:

- **Category tags**: OR within the group -- a place matches if it has ANY of the selected category tags
- **Area tags**: OR within the group -- a place matches if it has ANY of the selected area tags
- **Custom tags**: Configurable AND/OR via a `filterMode` toggle. Default is AND (a place must have ALL selected custom tags). When set to `any`, a place matches if it has ANY of the selected custom tags.

Between groups, the logic is AND: a place must satisfy category OR, AND area OR, AND custom AND/OR (depending on `filterMode`), AND search text, AND source filter.

A segmented "and / or" control appears inline in the filter summary row when 2+ custom tags are selected. The toggle immediately switches between `selectedCustomIds.every(...)` and `selectedCustomIds.some(...)` in the derived `filteredPlaces` computation.

This was chosen because categories and areas are mutually exclusive (a place is typically one category, one area), so OR makes sense for broadening results. Custom tags default to AND as additive descriptors (e.g., "date night" + "outdoor seating"), but the OR option lets users broaden (e.g., "show me anything tagged Italian OR Japanese").

### Active Tags Only

The filter UI only shows tags that are currently in use by at least one place. An `activeTagIds` derived set is built from `placeTagsMap` and used to filter `categoryTags` and `areaTags` before rendering. This prevents the UI from showing stale tags for places that have been deleted.

### Stale Filter Auto-Cleanup

An `$effect` watches the valid tag IDs and compares them against the currently selected filter tags (`selectedTagIds`). If any selected tags no longer exist in the dataset (e.g., after a place was deleted and it was the only place with that tag), they're automatically removed from `selectedTagMap`. This prevents ghost filters that match nothing.

Similarly, an `$effect` monitors `selectedSource` against the current `sourceLists`. If the selected source no longer exists in the dataset, it resets to `'all'`.

### Search

Search is case-insensitive and checks across six fields: title, description, address, category, area, and tag names. All matching is done client-side — the fields are joined into a single lowercase haystack and each search term is tested with `String.includes()`.

### Sorting

Seven sort options, all client-side:
- Newest/oldest by `created_at`
- A-Z/Z-A by `title` with `localeCompare`
- Rating (descending by `user_rating`, nulls last)
- Most tagged (by count of tags in `placeTagsMap`)
- Tag group (alphabetically by first user tag name, untagged places sorted last via `\uffff`)

---

## Personal Rating System

### What It Is

A personal half-star rating system that replaces the read-only Google rating display. Users can rate any place on a 0.5–5.0 scale by tapping a compact inline display and dragging across a 5-star scrubber popover. The Google-sourced `rating` and `rating_count` columns remain in the database but are no longer rendered anywhere in the UI.

### Data Model

Two new nullable columns on `places` (migration: `supabase/add_user_rating.sql`):

- **`user_rating`** (`numeric(2,1)`) — Stores values from 0.5 to 5.0 in 0.5 steps. A CHECK constraint enforces the range and step size: `user_rating >= 0.5 AND user_rating <= 5.0 AND user_rating * 2 = FLOOR(user_rating * 2)`.
- **`user_rated_at`** (`timestamptz`) — Timestamp of when the rating was last set or changed. Set to `now()` on save, cleared to `NULL` on clear.

### Component Architecture

The rating UI is split into three pieces:

**`RatingDisplay.svelte`** — The compact trigger shown on every PlaceCard and PlaceListItem. Renders `4.5 ★` (rated) or `Not rated` (unrated) as a clickable button. On click, it captures the button's bounding rect via `getBoundingClientRect()` and opens the `RatingEditor` popover positioned relative to that rect. Handles optimistic state updates and Supabase persistence — on save, it immediately calls `onRatingChanged` to update the parent's local state, then fires the async `supabase.update()`. If the DB write fails, it rolls back to the previous value.

**`RatingEditor.svelte`** — The popover star scrubber. Renders a full-width invisible backdrop (z-index 9998) and a positioned white card (z-index 9999) with 5 interactive star SVGs, a numeric value label, and a "Clear" button. Supports three interaction modes: tap a star half, click a star position, or drag across the star row.

**DOM teleport (portal)** — Because `RatingEditor` is rendered inside PlaceCard's 3D-transform hierarchy (`perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`), CSS `position: fixed` elements would be contained by the transformed ancestor instead of the viewport. To escape this, the editor wraps its backdrop and popover in a single `<div>` that is moved to `document.body` via `onMount(() => document.body.appendChild(wrapperEl))`. The wrapper starts with `display: none` and becomes visible after teleportation to prevent a flash. Svelte's reactivity continues to work because it tracks the component tree, not DOM position. Cleanup removes the element on unmount.

### Star Scrubber Interaction

The scrubber uses pointer events for unified mouse and touch handling:

1. **`pointerdown`** — Sets `dragging = true`, computes an initial preview rating from `clientX`, and calls `setPointerCapture()` on the target element to ensure all subsequent pointer events are routed to the scrubber even if the finger/cursor moves outside it.

2. **`pointermove`** — While dragging, converts `clientX` to a position within the star row (5 stars × 28px + 4 gaps × 2px = 148px total). The position is normalized to a 0–5 ratio, then snapped to 0.5 steps: `Math.max(0.5, Math.round(raw * 2) / 2)`. The snapped value updates the `preview` state, which reactively repaints the star fills (full gold / half gold + half gray / full gray) via a `starFill()` function.

3. **`pointerup`** — Ends dragging, computes the final snapped rating from the release position, clears `preview`, and calls `onSave(rating)`. The popover closes immediately.

4. **Tap fallback** — Each star SVG also has an `onclick` handler. It computes whether the click landed on the left or right half of the star (via `clientX - starLeft < STAR_W / 2`), yielding a half-step (e.g., 2.5) or full-step (e.g., 3.0).

5. **Clear** — A "Clear" button (visible only when a rating exists) calls `onClear()`, which sets `user_rating` and `user_rated_at` to `NULL`.

### Half-Star SVG Rendering

Each star SVG uses clip paths for the half-star state:

- **Full**: Single `<path>` filled with `#f59e0b` (amber)
- **Half**: Two overlapping `<path>` elements clipped by `<clipPath>` rects — left half filled amber, right half filled `#e5e0d8` (warm gray)
- **Empty**: Single `<path>` filled with `#e5e0d8`

Clip path IDs are scoped per star index (`star-left-0`, `star-right-0`, etc.) to avoid SVG ID collisions when multiple editors are theoretically on screen.

### Integration Points

- **PlaceCard** and **PlaceListItem**: Both components accept an `onRatingChanged?: (placeId: string, rating: number | null) => void` prop. The `RatingDisplay` is placed in the same visual position as the former Google rating — top-right of the header row on cards, inline in the data row on list items.
- **MapView popup**: Shows `My rating: 4.5 ★` as display-only text. No editor inside the popup to keep it lightweight.
- **Sorting**: The `rating` sort option sorts by `user_rating` (descending, nulls last) and the dropdown label reads "Rating".
- **Collection pages**: `/collections/[id]` uses `user_rating` for display and sorting. The public share page (`/c/[slug]`) shows the owner's personal rating read-only (no sort controls).
- **Server queries**: All `+page.server.ts` files and the `PLACES_COLUMNS` constant in `places.svelte.ts` include `user_rating` and `user_rated_at` in their SELECT lists.

### Click Isolation

The rating button uses `e.stopPropagation()` and `e.preventDefault()` in its `onclick` handler. This prevents the click from bubbling to PlaceCard's `handleDesktopFlip` / `handleMobileTap` handlers, which would otherwise flip the card or toggle selection. The card's flip handler also has an existing guard: `if (target.closest('a, button, input, textarea, [role="button"]')) return;` — since `RatingDisplay` is a `<button>`, this guard also catches it as a secondary defense.

---

## Saved Views

### What They Are

Saved Views are lightweight user-defined presets that capture the current browsing/filter state on the places page. They are **not** collections of places -- they save the filter configuration, not a set of place IDs. They let users quickly return to a preferred filtered/sorted view without re-selecting tags and sort options each time.

### What Is Stored

Each saved view persists:
- **Filter state**: selected custom tag IDs (via `tagGroups` with per-group AND/OR mode), source filter
- **Sort option**: the current `sortBy` value (newest, oldest, A-Z, etc.)
- **Layout mode**: grid or list

The `filters_json` JSONB column stores a `SavedViewFilters` object containing optional `tagGroups` (an array of `{ id, tagIds, mode: 'any' | 'all' }`) alongside a legacy `customTagIds` flat array. When restoring, `tagGroups` takes priority; `customTagIds` is used as a fallback for views saved before the tag-group migration.

Not stored: category/area tag selections (these are derived from the data), map center/zoom, selected place, collection scope, search text.

### Data Model

**`saved_views`** table (migration: `supabase/add_saved_views.sql`, `supabase/add_saved_views_order.sql`):
- `id` (uuid, PK)
- `user_id` (uuid, FK to `auth.users`)
- `name` (text)
- `filters_json` (jsonb) -- stores `{ customTagIds?, source? }`
- `sort_by` (text, default `'newest'`)
- `layout_mode` (text, default `'grid'`)
- `order_index` (integer, default `0`) -- user-defined ordering
- `created_at`, `updated_at` (timestamptz)

RLS policies restrict all operations to `auth.uid() = user_id`.

### Architecture

Follows the same patterns as the existing codebase:

- **Data-access helpers** (`src/lib/stores/saved-views.svelte.ts`): Pure async functions (`loadSavedViews`, `createSavedView`, `updateSavedView`, `deleteSavedView`, `reorderSavedViews`, `buildFiltersSnapshot`) matching the style of `places.svelte.ts` and `collections.svelte.ts`. No module-level reactive state. `loadSavedViews()` sorts by `order_index` ascending then `created_at` ascending. `reorderSavedViews()` writes the new `order_index` values via a single `.upsert()` call with `onConflict: 'id'`. `buildFiltersSnapshot()` accepts an optional `tagGroups` parameter and stores it in the filters for the multi-group model.
- **Types** (`src/lib/types/database.ts`): `SavedView`, `SavedViewInsert`, `SavedViewFilters` interface (includes `tagGroups?: TagGroup[]`), `TagGroup` interface (`{ id, tagIds, mode: 'any' | 'all' }`), `BrowseScope` type.
- **Component** (`src/lib/components/SavedViewsBar.svelte`): Reusable bar component receiving all needed state as props and calling back via `onApply`, `onViewsChanged`, and `onReorder`. Supports drag-to-reorder via the `sortable` action. Accepts a `viewIsDirty` prop: when the active view's data has changed, the pill shows a dashed border with a dot indicator. The three-dot menu uses `position: fixed` to escape the `overflow-x-auto` scrollable container (same approach as TagInput's portal dropdown).
- **SaveViewButton** (`src/lib/components/SaveViewButton.svelte`): Extracted component that handles saved view creation with an inline name input, Google Maps URL detection (excluded from snapshots), and tag group snapshot. Accepts filter state as props and calls `createSavedView` with a `buildFiltersSnapshot` of the current state.
- **Integration** (`src/routes/places/+page.svelte`): Loads saved views on mount, manages `activeSavedViewId` state, provides `applySavedView()` to restore filter/sort/layout, and auto-saves filter changes back to the active view with an 800ms debounce.

### UI Placement

The SavedViewsBar renders on the places page between the search bar area and the filter summary / filter chip rows.

**Desktop**: Horizontal row of pill-shaped buttons, each with a bookmark icon and the view name. The active view has a distinct brand-colored border/background/ring. A "Save View" dashed-border button appears at the end. A three-dot menu on each pill provides rename and delete actions. The dropdown menu uses `position: fixed` with coordinates from `getBoundingClientRect()` to escape the `overflow-x-auto` container that would otherwise clip it.

**Mobile**: Same horizontal row, but horizontally scrollable (`overflow-x-auto`) with hidden scrollbars. Pills are compact and touch-friendly. The "Save View" trigger shows only a "+" icon on small screens, expanding to "Save View" text at `sm+`. The create input dismisses on blur (with a 150ms delay to avoid racing with button clicks) or on Escape.

### User Actions

- **Create**: Click the "+ Save View" button, type a name, press Enter or click Save. Captures current filter/sort/layout state. Clicking outside the input (blur) dismisses it if empty.
- **Apply**: Click a saved view pill to restore its filter/sort/layout state. The pill highlights as active. Click the same pill again to deactivate (clears all filters).
- **Browse freely**: While a saved view is active, changing any tag filter or source filter silently deactivates the view (the pill unhighlights). The saved definition is never touched. This means pressing Clear, removing a tag chip with X, or adding a new tag simply returns you to free-form browsing. Click the saved view pill again to snap back to its original filters.
- **Create Collection from View**: Open the three-dot menu → New Collection. Evaluates the saved view's filters against the current `scopedPlaces` via `getPlaceIdsForView()`, then creates a new collection pre-populated with all matching place IDs. Toast confirms creation with place count.
- **Add to Collection from View**: Open the three-dot menu → Add to Collection. Same filter evaluation, then opens `AddToCollectionModal` in batch mode with all matching place IDs. Supports adding to any existing collection with duplicate-aware feedback.
- **Rename**: Open the three-dot menu → Rename. Inline input replaces the pill; Enter or blur saves.
- **Delete**: Open the three-dot menu → Delete. Removes the view with toast confirmation.
- **Reorder**: Drag-and-drop saved view pills to reorder them. Uses the `sortable` action with long-press on mobile. Order is persisted via `reorderSavedViews()`.

### Auto-Deactivate on Filter Change

When a saved view is active and the user changes any filter (toggles a tag, clears filters, switches source), the view automatically deactivates -- the pill loses its highlight and `activeSavedViewId` resets to `null`. The saved view's stored definition is never modified.

**Implementation**: An `$effect` in `+page.svelte` keeps a lightweight snapshot (`appliedSnapshot`) of the tag IDs and source at the moment a view is applied. On every filter change, it compares the current filter state against this snapshot. If they diverge, `activeSavedViewId` is set to `null`. A `suppressDeactivate` flag prevents the effect from firing during the initial `applySavedView()` call (since that call itself changes the filters to match the snapshot).

Sort and layout changes do not deactivate the view -- only tag and source filter changes do, since those are the semantically meaningful filters that define what a view "means."

### Trade-offs

- **Auto-deactivate on filter change**: Saved views silently deactivate when filters change during normal browsing, preventing accidental overwrites. This balances safety (no accidental edits) with simplicity (the saved definition is immutable once created).
- **Tag ID references, not names**: Saved views store tag IDs in `filters_json`. If a tag is deleted, those IDs become stale and the saved view silently skips them (the stale filter auto-cleanup effect handles this). An alternative would be to store tag names, but that would break on renames.
- **No search text persistence**: Search text is intentionally excluded. Saved views are meant for filter presets, not full session restoration. Including search would make applying a view feel like it's "typing for you."
- **Client-side only filtering**: Consistent with the existing architecture -- saved views restore the client-side filter state and the existing `$derived` chain handles the rest.
- **Fixed-position dropdown**: The three-dot menu uses `position: fixed` with `getBoundingClientRect()` coordinates rather than a portal to `document.body`. This is simpler than the TagInput portal approach but doesn't reposition on scroll. Acceptable here because the menu is small and dismissed quickly.

---

## Collections

### What They Are

Collections are user-created, persistent groups of places. Unlike Saved Views (which store filter configurations), Collections store actual place IDs. A collection can be created empty or populated from the current filtered result set, but after creation it becomes fully independent -- it does not auto-sync with filters or saved views.

### Data Model

Collections reuse the existing `lists` and `list_places` tables from the original schema:

- **`lists`** → Collections. Extended with:
  - `emoji` (text, nullable): Optional emoji character used as the collection icon (e.g. a food emoji). Falls back to color-circle when null
  - `visibility` (text, default `'private'`): `'private'` or `'link_access'`
  - `share_slug` (text, nullable, unique): URL-safe random identifier for public sharing
  - `sort_order` (integer, default `0`): User-defined ordering for the collections hub. Backfilled by `created_at` on migration
- **`list_places`** → Collection membership (many-to-many junction)

A migration file (`supabase/add_collections_columns.sql`) adds visibility and share_slug columns and creates three new RLS policies:
1. Public SELECT on `lists` where `visibility = 'link_access'`
2. Public SELECT on `list_places` via parent list visibility
3. Public SELECT on `places` that belong to a `link_access` collection (via join through `list_places` → `lists`)

A separate migration (`supabase/add_emoji_column.sql`) adds the `emoji` column to `lists`.

### Color Auto-Migration

The collections index page (`/collections`) includes a one-time client-side color migration that maps old palette colors to the curated 6-color palette. An `OLD_TO_NEW` dictionary (40+ entries) maps previous colors (Tailwind defaults, earlier custom palettes) to their closest match in the new set (`#A5834F`, `#8C8B82`, `#7489A6`, `#936756`, `#5B7D8A`, `#6A6196`). The migration runs once via `$effect` when collections load. It updates local state optimistically (immediate UI update) and fires the database writes as fire-and-forget `Promise.all` (not awaited, no re-fetch). A `migrated` flag prevents re-execution.

### Routes

**`/collections`** — Two-mode page acting as a collection hub + browse surface. The page auto-selects the first collection on load (or restores the `?collection=<id>` from the URL), so the user always lands directly in browse mode rather than an empty overview.

The **collection tab selector** is a horizontally scrollable row of pills near the top. Each pill shows the collection avatar (xs) and name, styled as `rounded-lg border` with `gap-1.5`. Selected: `border-brand-200 bg-brand-50 text-warm-800`. Unselected: `border-transparent text-warm-500 hover:bg-warm-100 hover:text-warm-700`. Pills support drag-to-reorder via the `sortable` action (long-press 500ms on mobile; order persisted via `sort_order` column). A "New Collection" button in the header opens a create modal (`sm:max-w-md`, bottom-sheet on mobile) with name + avatar preview, emoji picker, color picker, and create/cancel actions.

In **browse mode** (always active when collections exist), the page becomes a full map + list experience scoped to the selected collection, matching the Places browsing model. On desktop, the tab selector and `CollectionScopeHeader` are both sticky at top, with the map as a sticky 42%-width side panel; on mobile, a draggable `MobileMapShell`. The `CollectionScopeHeader` exposes the full collection object identity and controls:
- Avatar (clickable — opens color/emoji picker)
- Name (clickable — inline edit)
- Description (clickable — inline edit)
- Place count + visibility status (Shared/Private)
- Copy share link button (when shared)
- Visibility toggle (Private ↔ Shared)
- Add Places button
- Overflow menu (⋯): Delete collection with confirmation

The controls bar (below the header) shows: place count, search input (desktop, `w-28 sm:w-40` with clear button), sort dropdown (Recent, A–Z, My Rating), and grid/list toggle.

The "Add Places" modal (`sm:max-w-lg`, bottom-sheet on mobile) features a smart search/URL input that detects Google Maps URLs and shows an inline "Add" button for URL mode. In standard search mode, it filters the user's places by title, description, address, category, area, and tags (comma-separated terms). Tag filter pills below the search input narrow by user tags. The scrollable list shows non-member places with plus icons, tag previews, and click-to-add.

URL state is synced via `?collection=<id>` so the selected collection is deep-linkable and shareable. Previously loaded collection data is cached in a local `Map<string, CollectionBrowseData>` for instant switching. Remove-from-collection and delete-place are distinct actions surfaced through `PlaceCard`/`PlaceListItem` action menus.

**`/collections/[id]`** — Deep-linkable detail page for a single collection. Uses the same split map/list layout as the browse mode above: desktop has a sticky side map; mobile uses `MobileMapShell` with draggable height. Shows:
- Editable name and description (click to edit inline)
- Grid/list toggle with PlaceCard and PlaceListItem reuse
- Search within collection
- Sort by recent, A–Z, or my rating
- "+ Add Places" modal with search over all user places not in the collection, tag filter pills for narrowing results, and an "Add by URL" option that lets users paste Google Maps URLs directly to add new places
- Share toggle (private ↔ link_access) with copy-link button

**`/c/[slug]`** — Public read-only share page. Accessed without authentication. Shows a clean layout with the collection name, description, and all places in grid or list view. Each place shows category, area, price level, the owner's personal rating, note preview, and a link to Google Maps. Search filters by title, address, category, and area. No tag display or editing capabilities. The server load function (`c/[slug]/+page.server.ts`) uses a single deep nested join (`list_places(place_id, places(...))`) to fetch the collection and all its place data in one query — no tags or place_tags are fetched.

### Store Architecture

`src/lib/stores/collections.svelte.ts` follows the same async-helper pattern as `places.svelte.ts` and `saved-views.svelte.ts`:

- **`loadCollections()`**: Fetches all user collections with embedded `list_places(place_id)` join in a single query (scoped by `user_id`), ordered by `sort_order` ascending. Note: the server load in `collections/+page.server.ts` sorts by `updated_at` descending instead — the server sort takes precedence on initial page load, while the store sort applies to client-side refreshes
- **`createCollection()`**: Creates a collection, optionally bulk-inserting place IDs
- **`updateCollection()`**: Updates name, description, color, emoji, visibility, share_slug, or sort_order
- **`deleteCollection()`**: Deletes a collection (cascade removes `list_places` rows)
- **`reorderCollections()`**: Accepts an ordered array of collection IDs and writes `sort_order` values via a single `.upsert()` call with `onConflict: 'id'`
- **`addPlaceToCollection()` / `addPlacesToCollection()`**: Single or batch membership insert using `.upsert()` with `onConflict: 'list_id,place_id'` and `ignoreDuplicates: true`
- **`removePlaceFromCollection()`**: Removes a place from a collection
- **`enableSharing()` / `disableSharing()`**: Toggles visibility and generates/clears the share slug
- **`loadCollectionBySlug()`**: Loads a collection by slug with embedded `list_places(place_id)` join in a single query
- **`loadCollectionPlaces()`**: Client-side data loader for the collection browse mode on `/collections`. Uses a single `Promise.all` with two independent queries: (1) a deep nested join (`lists` → `list_places` → `places` + `place_tags`) scoped by collection ID and user ID, and (2) a user-scoped tags query. Returns full place objects with lat/lng for the map, plus tags and placeTags. One round-trip per the performance audit guidelines
- **`optimisticAdd()` / `optimisticRemove()`**: Pure functions for optimistic UI updates on the `CollectionMemberMap`

### Adding Places

Three entry points for adding places to collections:

1. **From PlaceCard / PlaceListItem**: A folder+plus icon button in the action row opens `AddToCollectionModal`, which lists all collections with checkmarks for current membership. Toggling adds/removes instantly with optimistic updates and toast feedback.

2. **From collection detail page**: The "+ Add Places" button opens a modal showing all user places not yet in the collection, with search and tag filter pills for narrowing results. Users can toggle individual user tags to filter the list (AND logic across selected tags). Place data for the modal is lazy-loaded on demand when the user opens it, not preloaded in the server load.

3. **From Saved View**: The three-dot menu on any saved view pill offers "New Collection" (creates a collection from all matching places) and "Add to Collection..." (opens `AddToCollectionModal` in batch mode). The `getPlaceIdsForView()` function re-evaluates the view's filters against `scopedPlaces` to compute matching place IDs.

**Mobile**: All add/remove actions use explicit buttons and modals — no drag-and-drop dependency. The `AddToCollectionModal` renders as a bottom-sheet (rounded top corners, `items-end` on mobile) for thumb-friendly interaction.

**Desktop**: Same modal pattern, centered on screen. The PlaceCard and PlaceListItem buttons appear in the hover-reveal action row alongside Maps, Website, and Notes.

### Sharing

Simple MVP sharing:

1. **Toggle**: Click the Private/Public button on the collection detail page
2. **Enable**: Generates a random 10-character alphanumeric slug, sets `visibility = 'link_access'`
3. **Copy**: The "Copy Link" button copies `{origin}/c/{slug}` to clipboard
4. **Disable**: Sets `visibility = 'private'`, nullifies the slug

The public page (`/c/[slug]`) loads data via a server load function that uses a single deep nested join query (`lists.select('..., list_places(place_id, places(...))')`) filtered by `share_slug` and `visibility = 'link_access'`. This fetches the collection and all its place data in one round-trip. RLS policies allow anonymous SELECT on collections and their places when visibility is `link_access`.

**Save Shared Collection** (`POST /api/collections/save-shared`): Logged-in users viewing a shared collection can click "Save" to duplicate it into their own account. The endpoint validates the collection is `link_access`, prevents self-save (409), creates a new collection with the same name/description/color/emoji, deep-copies all places (with `source_list: 'shared-import'`), and links them to the new collection. Returns the new collection ID and place count.

### Navigation

The bottom dock includes a "Collections" tab linking to `/collections`. The `/collections` route is protected (requires auth). The `/c/[slug]` route is public.

### Trade-offs

- **No drag-and-drop for adding to collections**: While the existing codebase has drag-and-drop for tag reordering, adding places to collections uses only explicit button/modal interactions. This ensures mobile compatibility and avoids conflicts with swipe-to-delete gestures.
- **Slug-based sharing vs. collection ID sharing**: Using a random slug prevents enumeration attacks and makes share URLs non-guessable. The slug is generated client-side, which has a negligible collision risk for 10-character alphanumeric strings.
- **No collaborators**: Sharing is read-only. The owner is the only editor. This simplifies RLS policies and avoids the complexity of shared editing state.
- **Public place data exposure**: When a collection is shared, all place data (title, address, user rating, etc.) becomes publicly readable via the RLS policies. This is intentional for the sharing use case, but users should be aware that making a collection public exposes its place details.

---

## Intel Tagging System

### What It Is

The intel tagging system is a structured intelligence layer that maps Google Place types to internal product-level classifications. It transforms Google's external taxonomy (e.g., `restaurant`, `gym`, `bakery`) into a richer internal model with categories, market niches, operational signals, and suggested tags. The engine is pure computation -- no side effects, no database writes -- with optional persistence via Supabase.

### Architecture

The system has three layers:

1. **Google Place Type Catalog** (`src/lib/google-place-types.ts`): A complete registry of 100+ official Google Places API (New) type keys, split into Table A (searchable/primary types) and Table B (returned-only types). Each entry has `type_key`, `can_be_primary`, `table_group`, and `status`. Provides `lookupGoogleType()` and `isKnownGoogleType()` for fast lookups.

2. **Intel Tag Mappings** (`src/lib/intel-tag-mappings.ts`): An editable mapping table of ~138 entries that maps Google type keys to internal classifications across categories like Dining, Cafe, Sweets, Nightlife, Fitness, Wellness, Attractions, Parks, Worship, Shopping, Lodging, Services, and Entertainment. Each mapping specifies: `primary_category`, `operational_status`, `market_niche`, `discussion_pillar`, `suggested_tags`, and `market_context`. Provides `lookupMapping()`, `getAllMappings()`, and `getMappingOrDefault()`.

3. **Intel Tagging Engine** (`src/lib/intel-tagging.ts`): Pure computation that takes raw Google Place data (`primaryType` + `types` array) and produces a structured `IntelTagResult` with six output layers:
   - Primary Category -- top-level bucket
   - Operational Status -- business model signal
   - Market Niche -- finer market positioning
   - Discussion Pillar -- optional prompt anchor for market discussions
   - Suggested Tags -- deduplicated tag proposals aggregated from all matched mappings
   - Catalog Metadata -- which types were recognized vs unknown

### Resolution Strategy

The engine prioritizes `primaryType` (from Google's response) as the authoritative source. If `primaryType` has a mapping, it determines the primary category, status, niche, and pillar. Otherwise, the engine scans the `types` array in order and uses the first mapped type. Suggested tags are aggregated from *all* matched mappings (not just the authoritative one) and deduplicated.

### API Endpoints

**`GET /api/places/[id]/intel-tags`**: Computes intel tags for a single place. Fetches the place by ID (user-scoped), then attempts to re-fetch from Google for full type data if the place has a URL. Falls back to the stored `primary_type` on fetch failure. Supports `?market=true` query param to include a `MarketDiscussionOutput` payload (prompt-ready JSON for downstream market discussion use cases). Returns the computed intel classification, catalog metadata (hits/misses, source types), and optionally the market discussion output.

**`POST /api/admin/intel-catalog`**: Seeds or refreshes the `google_place_type_catalog` and `intel_tag_mappings` Supabase tables from the TypeScript seed data. Supports `'upsert'` (default, updates existing) or `'full'` mode. `GET` returns current catalog/mapping stats for observability.

### Integration with Enrichment

Intel tags are computed automatically during place enrichment. Both the single-place (`/api/places/[id]/enrich`) and batch (`/api/places/enrich-all`) endpoints call `computeIntelTags()` after fetching Google Place details and include the intel result in their responses. The `add-by-url` endpoint also computes intel tags for newly imported places.

### Verification

`src/lib/intel-tagging.verify.ts` provides end-to-end test cases (e.g., Taipei gym, Taipei restaurant) that validate catalog lookup, mapping resolution, and intel result quality. Run with `npx tsx src/lib/intel-tagging.verify.ts`.

### Database Persistence (Optional)

The `place_intel_tags` table caches computed results per place. This is optional; the system operates compute-first without persistence. The table includes an `approved` boolean for future user-approval workflows. The `google_place_type_catalog` and `intel_tag_mappings` tables provide durable backend storage, seeded from the TypeScript source via the admin endpoint.

---

## Map Integration

### Technology Choice: MapLibre GL JS + MapTiler

The map uses [MapLibre GL JS](https://maplibre.org/) (an open-source fork of Mapbox GL JS) with [MapTiler](https://www.maptiler.com/) as the tile/style provider. This avoids the cost of Google Maps display APIs while providing a high-quality, customizable map.

**MapTiler "pastel" style** was chosen to match the app's warm, soft design language. The muted earth tones and low-contrast labels complement the brand/sage/warm palette without overpowering the place list. If no `PUBLIC_MAPTILER_KEY` is configured, a fallback message is shown instead of the map.

### Split-View Layout

The map and content share a single flex container, using CSS and conditional rendering for different screen sizes:

**Mobile (< lg)**: Uses a `MobileMapShell` component that wraps `MapView` with an interactive collapse/expand mechanism. The shell has two states:
- **Collapsed** (default): 128px tall (draggable down to 80px minimum), showing a compact map preview. Markers are visible but popups are suppressed, and the attribution control fades to 45% opacity at 90% scale.
- **Expanded**: 55vh tall, providing a full interactive map experience with popups and full-opacity controls.

A drag-handle at the bottom of the shell supports pointer-drag resizing with snap thresholds (collapses below 100px, expands above). The `mapMode` prop (`'collapsed'` | `'expanded'`) is passed to `MapView` to adjust behaviors like popup display, attribution placement, fit-bounds padding, and fly-to offsets.

The mobile layout uses `overflow: hidden` on the outer container with the content panel in a scrollable `flex-1 min-h-0 overflow-y-auto` div, preventing the map from scrolling with the page.

**Desktop (lg+)**: The layout switches to `flex-row`. The map panel gets `order-2` (right side), `width: 42%`, and `position: sticky` at `top: 0` (full viewport height, `h-[100dvh]`) since the nav bar has been replaced by a bottom dock. The `align-self: start` property is required for sticky to work correctly in a flex row -- without it, the flex item stretches to the container height and sticky has no room to "stick". On mid-size screens (< lg), the map shows as a fixed-height band (`h-[35vh]` / `sm:h-[38vh]`) above the content.

**Breakpoint detection**: An `isMobile` reactive variable (updated via `resize` event listener, threshold at 1024px) controls which layout renders. This uses JS-based detection rather than CSS media queries because the mobile and desktop layouts use different component trees (`MobileMapShell` wrapping `MapView` vs. `MapView` alone).

A `ResizeObserver` inside `MapView` calls `map.resize()` to keep the map canvas in sync with its container dimensions across both layouts.

### MapView Component (`MapView.svelte`)

**Dynamic import**: MapLibre GL JS uses browser APIs (`canvas`, `WebGL`) that aren't available during SSR. The library is loaded via `await import('maplibre-gl')` inside `onMount`, wrapped in an IIFE to keep the cleanup function synchronous (Svelte's `onMount` doesn't support async cleanup returns). The CSS is loaded via a `<link>` tag in `<svelte:head>` pointing to the unpkg CDN.

**Environment variable**: The MapTiler API key is passed as a `maptilerKey` prop from the parent (which gets it from `data.maptilerKey` set in `+layout.server.ts`). As a fallback, the component also checks `import.meta.env.PUBLIC_MAPTILER_KEY`.

**`mapMode` prop**: Accepts `'collapsed'`, `'expanded'`, or `'default'`. This controls several behaviors:
- **Attribution placement**: `'default'` puts it bottom-right; other modes put it top-left to avoid overlapping the shell's drag handle.
- **Attribution styling**: Collapsed mode fades to 45% opacity and 90% scale; expanded mode shows full opacity. CSS scoped styles use `[data-map-mode]` attribute selectors.
- **Popup behavior**: In collapsed mode, hover popups are suppressed and selection popups are closed (the map is too small for useful popups). In other modes, popups appear on hover and stay open for selected markers.
- **Fit-bounds padding**: Collapsed mode uses `{ top: 8, bottom: HANDLE_PX + 8, left: 12, right: 12 }` to account for the drag handle. Default mode uses uniform 50px padding.
- **Fly-to offset**: Collapsed mode applies a vertical offset of `-(HANDLE_PX / 2)` to center the target above the drag handle.

### Marker Rendering & Synchronization

Markers are the visual bridge between the filtered places list and the map. The component receives `filteredPlaces` as a prop and maintains an internal `markersMap` (a plain JS `Map`, not reactive) that tracks which markers are currently on the map.

**Marker sync** runs inside a `$effect` that tracks the `places` prop. When the filtered places change (due to filter, search, or data changes):

1. Stale markers (IDs no longer in the filtered set) are removed from the map
2. Existing markers have their positions updated (handles lat/lng changes after enrichment)
3. New markers are created with a custom SVG pin element, a popup, and click/hover handlers

**Fit bounds**: The map auto-fits to show all visible markers when the *set* of mappable place IDs changes. A `prevFitKey` string (sorted, joined IDs) prevents unnecessary re-fits when the same places are present but in a different order. Single-marker fits use zoom level 13; multi-marker fits use `fitBounds` with 50px padding and a max zoom of 15.

**Places without coordinates**: Only enriched places with `lat`/`lng` values get markers. An info badge at the bottom of the map shows the split (e.g., "8 on map · 5 without coordinates") so users know some places are missing from the map view.

### Custom Markers

Markers use a custom SVG pin shape rendered as a DOM element (not a default MapLibre marker). The pin is styled via CSS classes in `app.css`:

- **Default**: `color: brand-500` (#a8935f), warm golden-brown matching the app palette, with a subtle drop shadow
- **Hover**: Scales to 115% with a darker `brand-600` color
- **Selected**: Scales to 135% with `brand-700` color and a stronger shadow, plus `z-index: 20` to stay above other markers

The `transform-origin: bottom center` ensures scaling anchors the pin at its point, not its center.

### Popups

Each marker has a MapLibre Popup styled with the `.map-popup-warm` class to match the app's design -- Nunito font, rounded corners, warm-200 border. Popups show the place title, category, and personal rating (display-only). They appear on hover (desktop) and stay open for the selected marker.

### Geolocate Control

The map includes a MapLibre geolocate control that allows users to center the map on their current location. The control is custom-styled in `app.css` to match the app's warm palette:

- **Default state**: White rounded button with a warm-700 (`#5a5042`) crosshair SVG icon
- **Active state**: Icon color changes to brand-500 (`#a8935f`) when actively tracking
- **User location dot**: Styled with `brand-500` background and a 30% opacity `brand-400` ring, replacing MapLibre's default blue dot

### Bidirectional Selection Sync

Selection synchronization connects the map and the place list/cards:

**Card → Map**: Clicking a PlaceCard (via `handleFlip`) or PlaceListItem (via `toggleExpand`) calls `onSelect(place.id)`, which sets `selectedPlaceId` in the parent page. A separate `$effect` in MapView watches `selectedPlaceId` and responds by: (1) adding `map-marker--selected` CSS class to the target marker, (2) removing it from all others, (3) flying the map to the marker's coordinates, and (4) opening the marker's popup.

**Map → Card**: Clicking a marker calls `onPlaceSelect(placeId)`, which sets `selectedPlaceId` and uses `requestAnimationFrame` + `scrollIntoView({ behavior: 'smooth', block: 'center' })` to scroll the corresponding card into view. Cards and list items have `data-place-id` attributes for DOM targeting.

**Selection cleanup**: An `$effect` in the places page clears `selectedPlaceId` when the selected place is no longer in `filteredPlaces` (e.g., a filter was applied that excludes it).

**Visual feedback**: Selected PlaceCards show a `ring-2 ring-brand-400/30 border-brand-400` highlight. Selected PlaceListItems show a subtle `bg-brand-50` background.

---

## UI Components & Interactions

### PlaceCard -- 3D Flip Animation

Each card has a front (place info) and back (notes editor), connected by a CSS 3D flip. The front face includes an inline `RatingDisplay` that opens a popover star editor on click (see [Personal Rating System](#personal-rating-system)). The implementation uses:
- `perspective: 800px` (mobile) / `1000px` (desktop) on the container
- `transform-style: preserve-3d` on the inner div
- `backface-visibility: hidden` on both faces
- `transform: rotateY(180deg)` on the back face
- Class toggle `.is-flipped { transform: rotateY(180deg) }` on the inner div

Click handling uses event delegation: clicks on interactive elements (links, buttons, inputs, textareas) are ignored via `closest()` check, so only clicks on "dead space" trigger the flip.

### PlaceCard -- Swipe to Delete (Mobile Grid)

The mobile grid card layout combines a 3D flip animation with swipe-to-delete. The DOM follows a strict layering pattern:

- **row-root**: `position: relative; overflow: hidden; border-radius`. No transforms, no perspective. Pure clipping container.
- **delete-background**: `position: absolute; inset: 0; z-index: 0`. Delete button right-aligned via flex. **Conditionally rendered** -- only exists in the DOM when `swipeX < 0 || swiping`, so it cannot flash through during scroll or flip.
- **swipe-foreground**: `position: relative; z-index: 1; bg-white`. Only `translateX` for swipe. Contains the 3D flip structure inside it.
- **3D flip** (inside swipe-foreground): `perspective:800px` wrapper > `flip-inner` with `preserve-3d` + `is-flipped` class > front/back faces with `backface-visibility:hidden`. Same 3D `rotateY(180deg)` effect as desktop.

The key to making 3D flip and swipe-to-delete coexist safely is **conditional rendering of the delete layer**: the delete background only enters the DOM when the user is actively swiping. During flip animations and fast scrolling, the delete element simply does not exist, so GPU compositing cannot expose it regardless of `preserve-3d` behavior.

The `handleMobileTap` function is swipe-aware: if the card is currently swiped open (`swipeX !== 0`), a tap resets the swipe back to zero instead of triggering a flip. This prevents accidental flips when the user taps to dismiss the delete action.

Gesture locking works the same as in PlaceListItem: the first significant movement (> 5px) locks the gesture to either horizontal (swipe) or vertical (scroll), preventing conflict between the two.

### PlaceCard -- Auto-Save Notes

Notes use debounced auto-save with an 800ms timer. Each keystroke resets the timer. When flipping back to the front, any pending save is flushed immediately (timer cleared + save called) to avoid losing edits.

### PlaceCard & PlaceListItem -- Swipe to Delete

Both PlaceCard (grid view, mobile) and PlaceListItem (list view, mobile) support swipe-to-delete with the same touch gesture handler pattern:

1. `touchstart` records the start position and resets lock/swipe flags
2. `touchmove` calculates horizontal delta. If the first significant movement (> 5px) is vertical, the gesture is "locked" as a scroll and swipe is ignored for the rest of the touch
3. The element translates horizontally, clamped to `[-72px, 0]`
4. `touchend` snaps: if swiped past 36px threshold, it locks open revealing the delete button; otherwise snaps back to 0

All swipeable components (PlaceCard, PlaceListItem, Collections index) share the same layered DOM pattern: an outer `overflow: hidden` row-root owns the border radius and clips all children; a `z-0` absolute-positioned delete-background layer holds the delete button pinned right; a `z-[1]` relative-positioned swipe-foreground layer receives the swipe `translateX` and contains all content. The delete-background layer is **conditionally rendered** -- it only enters the DOM when `swipeX < 0 || swiping`, so it cannot flash through during fast scrolling, flip animations, or state changes. PlaceCard uses the full 3D `rotateY` flip on both mobile and desktop, with the delete layer's conditional rendering preventing any compositing artifacts.

### TagInput -- Portal Dropdown

The suggestion dropdown uses a Svelte action (`use:portal`) that moves the element to `document.body`. Position is calculated from the input's `getBoundingClientRect()` and set via inline `style`. The dropdown is rebuilt on every input change to track the input's position.

### RatingDisplay + RatingEditor -- Inline Star Popover

The rating UI is a two-component system. `RatingDisplay` renders the compact trigger (`4.5 ★` or `Not rated`) and handles optimistic persistence. `RatingEditor` is the popover star scrubber with half-star precision via pointer events. The editor teleports its DOM to `document.body` on mount to escape PlaceCard's 3D-transform stacking context (same root cause as the TagInput portal, see [Bug #14](#14-rating-popover-invisible-inside-3d-transformed-card)). Full details in [Personal Rating System](#personal-rating-system).

### TagSidebar (Removed)

The `TagSidebar.svelte` component has been removed. Sidebar filter navigation (tag groups, source lists, "All Places" reset) is now handled inline on the places page itself. Filter tags are displayed as chip rows directly in the main content area rather than in a separate side panel.

### TagManager

Accessed via the "+" button in the custom tags row. A modal that manages user tags with:

- **Inline rename**: Clicking a tag name swaps it for an input field. `requestAnimationFrame` is used to focus and select-all the text after the DOM updates. A 150ms blur delay prevents premature cancel when clicking the save button.
- **Inline delete**: Shows a confirmation row inline (not a separate modal) with "Delete" and "Cancel" buttons.
- **Color picker**: Clicking the color dot opens an inline palette below the tag row. Uses the same `TAG_PALETTE` from `tag-colors.ts`.
- **Sortable list**: The tag list supports drag-and-drop reordering using the same `sortable` action as the filter tag rows.
- **User tags only**: The parent passes `allTags={userTags}` -- category and area tags are excluded from management since they're system-generated.

### TopBarTagAdd (unused)

> **Note**: `TopBarTagAdd.svelte` exists in the codebase (203 lines) but is not imported or rendered by any page or component — it is dead code. The places page uses a "Manage" button that opens the full `TagManager` modal instead.

The component was designed as a compact tag creation widget for the filter bar area. It renders a small "+ Add" dashed-border pill that expands into an inline input on click, with a portal-based dropdown for suggestions, auto-title-case normalization, deterministic color assignment via `colorForTag()`, and `order_index` assignment via `getNextOrderIndex()`.

### AddToCollectionModal

A modal for adding one or more places to collections. Supports two usage modes:

- **Single-place mode**: Opened from PlaceCard/PlaceListItem action row with a single `placeId`. Shows all collections with checkmarks for membership.
- **Batch mode**: Opened from Saved View three-dot menu actions with an array of `placeIds`. Shows checkmarks for "all added", partial membership counts ("N already in"), and handles bulk upserts via `addPlacesToCollection()`.

The modal renders as a bottom-sheet on mobile (`items-end`, `rounded-t-2xl`) and centered card on desktop. If no collections exist, it shows a link to `/collections`. Each collection row displays the `CollectionAvatar` (emoji or color icon), name, place count, and membership status badge.

### PlaceActionMenu

A context menu for places within collection views. Provides two destructive actions: "Remove from collection" (removes the place-collection membership only) and "Delete place permanently" (deletes the place itself). Renders as a bottom sheet on mobile and a dropdown menu on desktop. Used by the collection detail page (`/collections/[id]`) to differentiate between collection-scoped removal and permanent deletion.

### CollectionAvatar

A reusable avatar component for collection icons. Displays either an emoji character or a colored dot inside a ringed circle. Supports five size variants (`xs`, `sm`, `md`, `lg`, `xl`) with proportional dimensions. Used in collection cards, the `AddToCollectionModal`, and collection detail headers.

### EmojiPicker

A categorized emoji picker component with ~794 emojis across 8 categories (Food & Drink, Travel & Places, Activities, Nature, Objects, Smileys, Symbols, Flags). Features category tab navigation, text search filtering, and a "no icon" option to clear the selection. Used in the collection create/edit forms for selecting collection icons.

### Toast Notification System

Lightweight in-page toasts for URL add and action feedback, implemented as a shared Svelte 5 store (`src/lib/stores/toasts.svelte.ts`):

- **Store module**: Uses module-level `$state<Toast[]>([])` for reactivity. Exports `showToast(type, title, message, actions?)`, `getToasts()`, and `dismissToast(id)`. Any component can trigger toasts without prop-drilling.
- **Data model**: Each toast has `{ id, type, title, message, actions? }`. The `actions` field is an optional array of `{ label: string, handler: () => void }` for interactive toasts (e.g., "Undo", "Tag to current view", "Clear filters").
- **Types**: `success` (sage/green), `duplicate` (amber), `error` (red), `info` (blue) -- each with matching background, border, and icon.
- **Timing**: Success and duplicate toasts auto-dismiss after 2500ms; errors after 4000ms; toasts with actions after 5000ms (longer to give the user time to click).
- **Animation**: Uses the `animate-in` class from `app.css` with a `toast-in` keyframe (opacity 0→1 + translateY 8px→0 + scale 0.96→1 over 250ms).
- **Position**: Fixed at bottom-center (`fixed bottom-6 left-1/2 -translate-x-1/2`), stacked vertically with `gap-2`.
- **Action buttons**: Rendered inline after the message with a `|` separator. Clicking an action calls its handler and immediately dismisses the toast via `dismissToast(toast.id)`.

### Layout Shift Prevention

The filter summary area (`"Filtered by: ..."`) reserves a `min-h-[28px]` (mobile) / `min-h-[32px]` (desktop) even when empty, preventing layout shifts when filters are toggled.

---

## Root Layout & Global Concerns

### Font Loading

Google Fonts (Nunito, weights 400--800) is loaded via `<link>` tags in the root layout with `preconnect` hints to `fonts.googleapis.com` and `fonts.gstatic.com`. The `display=swap` parameter ensures text is visible immediately with a fallback font, then swaps to Nunito once loaded. The font family is registered in `app.css` under `@theme { --font-sans: 'Nunito', ... }`.

### Navigation: AppBottomDock

The top nav bar has been replaced by a floating bottom dock (`AppBottomDock.svelte`) with **three rendering modes**:

#### 1. Desktop Bottom Bar (default, ≥ 640px, no custom position)
A `fixed inset-x-0 bottom-0 z-50` bar with a frosted-glass pill (`bg-warm-50/95 backdrop-blur-lg rounded-[1.25rem]`) containing a 6-dot drag handle, three navigation tabs, and (when custom-positioned) a reset button:

- **Places** tab — map pin icon, links to `/places`
- **Collections** tab — grid icon, links to `/collections`
- **Settings** tab — gear icon, links to `/settings`

Active tab: `bg-brand-100 text-brand-800`. Idle tab: `text-warm-500 hover:bg-warm-100`. Tab dimensions: `min-h-[2.5rem] w-[4.5rem] sm:w-[5rem]`, label: `text-[9px] sm:text-[10px]`. The dock is visible only when authenticated and on an app-shell route (`/places`, `/collections`, `/upload`, `/settings`, or any sub-path of `/collections` or `/settings`). A `bottomDockSuppressed` writable store (`src/lib/stores/bottom-dock-suppressed.ts`) lets modals like `PlaceActionMenu` temporarily hide the dock.

**Drag-to-reposition**: The left-side 6-dot grip handle (`cursor-grab`) starts a pointer drag that repositions the entire dock to any point on screen, clamped to 8px from viewport edges. The position is persisted to localStorage (`dock-position`). When custom-positioned, a reset button (↻ icon) clears the stored position, returning the dock to the default bottom bar. The `dockMode` is forced to `'active'` when the user starts dragging. `pointerenter` on the pill also immediately restores active mode.

**Scroll-aware passive mode** (`src/lib/stores/dock-scroll-state.ts`): The dock transitions between `'active'` and `'passive'` modes based on scroll direction. During downward scroll (cumulative delta > 8px threshold), the dock fades to 45% opacity and translates 10px downward; scrolling up or idle (400ms timeout) restores it. The watcher uses `requestAnimationFrame`-based throttling, captures both window scroll and inner-element scroll events, and handles touch-end idle resets. A direction lock delta of 3px prevents jittery toggling. The root layout initializes the watcher via `$effect` when the dock is visible and tears it down on unmount.

#### 2. Custom-Positioned Draggable (any screen size, after user drags)
When the user drags the dock, the mode switches from the bottom bar to a freely-positioned `fixed` pill rendered at `left:{x}px;top:{y}px`. The layout is identical to the desktop bottom bar (horizontal tabs, drag handle, reset button) but it floats at the user's chosen position.

#### 3. Mobile Collapsible Right-Edge Drawer (< 640px, no custom position)
On mobile (detected via `window.innerWidth < 640`), the dock renders as a collapsible vertical drawer on the right edge of the screen instead of the bottom bar.

- **Expanded state**: A vertical `flex-col` dock with `rounded-l-[1.25rem]` slides in from the right via `transform: translateX(0/100%)` with a 250ms ease-out transition. Contains a horizontal drag handle (for vertical repositioning), a collapse chevron button, and 3 navigation links stacked vertically using a separate `dockLinksMobileVertical` snippet. Each link is `3.5rem` wide, `2.75rem` min-height with `text-[8px]` labels. Active/idle states use CSS classes (`mobile-dock-link-active`/`mobile-dock-link-idle`). Padded for `env(safe-area-inset-right)`.
- **Collapsed state**: A slim hint tab (`rounded-l-xl`, `bg-brand-50/95`) fixed on the right edge at the persisted Y position, showing a chevron and map pin icon. Tapping expands the dock.
- **Vertical drag**: Both states support vertical repositioning via pointer drag. The Y position defaults to 65% of viewport height, is clamped to 60px from top/bottom edges, and persisted to localStorage (`dock-mobile-y`).
- **Tap-outside-to-close**: A document `click` listener (registered via `$effect`) collapses the expanded dock when tapping outside the pill element. Drag events are excluded to avoid accidental collapse.
- **First-visit hint animation**: On first load (if `dock-hint-seen` not in localStorage and `prefers-reduced-motion` is not active), a subtle 800ms nudge animation (`@keyframes mobile-nudge-hint`) shifts the expanded dock 10px toward the right and back after a 1.2s delay, then persists the `dock-hint-seen` flag. All animations are suppressed when `prefers-reduced-motion: reduce` is active.

Adding places is handled by the search bar on the Places page, which detects Google Maps URLs inline.

The root layout injects a `--app-dock-reserve` CSS custom property (equal to the dock height plus safe-area inset) so pages can add bottom padding to avoid content being obscured by the dock. On mobile (< 640px), the right-edge dock means content does not need bottom padding, but the variable remains set by the layout (pages use `max()` expressions that account for it).

### Settings Page

The `/settings` route is a simple account page (`max-w-lg`) with:
- Section heading "Account" with the user's email
- Full-width "Sign out" button (`rounded-xl border-warm-200 bg-warm-50`)

This replaces the former "Sign out" button that lived in the nav bar.

### Auth State Subscription

`onMount` in the root layout subscribes to `onAuthStateChange`. The listener handles two events specifically:

- **`SIGNED_OUT`**: Immediately clears the refresh timer and invalidates.
- **Session change**: Compares `newSession?.expires_at` with the current session's `expires_at`. If the expiry changed, the refresh timer is cleared and rescheduled, and `invalidate('supabase:auth')` is called. This filters out duplicate events from routine token refreshes.

A `visibilitychange` listener also checks the session when the tab regains focus. If the session is expired or near expiry, it triggers an immediate refresh. If there's no session at all, it invalidates to update the UI (e.g., show logged-out state).

### Global Styles (`app.css`)

All design tokens live in `app.css` inside a `@theme` block (Tailwind v4 syntax):

- **brand** palette: Warm browns (#f9f6f1 to #4a412a) -- used for accents, ratings, active states
- **sage** palette: Muted blue-grays (#f2f1ef to #24313b) -- used for area tags, success states, page background
- **warm** palette: Neutral taupes (#faf9f7 to #28221c) -- used for text, borders, backgrounds
- **danger** palette: Muted warm terracotta reds (#f4eceb to #56302d) -- used for swipe-to-delete backgrounds and destructive confirm buttons

Additional global styles handle safe area insets, tap highlight removal, overscroll behavior, and the toast animation keyframes.

---

## Responsive Design

The app has distinct mobile and desktop layouts rather than just reflowing:

- **Map layout**: Mobile uses a `MobileMapShell` component with a draggable map (128px collapsed / 55vh expanded, 80px minimum) above a scrollable content panel. Desktop uses a sticky right panel (42% width, `lg:sticky lg:top-0 lg:h-[100dvh]`) alongside a scrollable left content area. The two layouts render different component trees controlled by a JS `isMobile` flag (threshold: 1024px). On non-mobile screens, the map shows as a fixed-height band (`h-[35vh]` / `sm:h-[38vh]`) on tablets, expanding to the full sticky panel on `lg+`.
- **PlaceCard**: Mobile uses a compact layout with smaller text, fewer visible details, and swipe-to-delete. Desktop shows price level, more metadata, and hover-reveal delete. Both show an inline personal rating display (`4.5 ★` / `Not rated`) that opens a star scrubber popover on click. The card grid uses 1-2 columns (reduced from 3 to accommodate the map panel).
- **PlaceListItem**: Mobile has swipe-to-delete; desktop has hover-reveal action buttons.
- **Tag filtering**: Mobile uses a single horizontally scrollable row of custom tag pills. Desktop shows a labeled row ("Custom") with tag pills.
- **Navigation**: A floating bottom dock (`AppBottomDock`) replaces the former sticky top nav bar. Three tabs (Places, Collections, Settings) with safe-area inset padding and scroll-aware passive mode. Three rendering modes: (1) desktop bottom bar with drag-to-reposition and scroll-aware passive mode, (2) custom-positioned draggable pill after user drags, (3) mobile right-edge collapsible drawer (< 640px) with vertical layout, drag-to-reposition vertically, first-visit hint animation, and tap-outside-to-close.
- **Safe areas**: The layout respects `env(safe-area-inset-*)` for notched devices. Pages use `--app-dock-reserve` to pad content above the bottom dock. On mobile where the dock is on the right edge, pages still reference the variable but content padding is minimal.

---

## Configuration & Tooling

### Svelte Config (`svelte.config.js`)

Uses `@sveltejs/adapter-vercel` for deployment with `runtime: 'nodejs22.x'`. The `vitePlugin.dynamicCompileOptions` callback enables Svelte 5 runes mode for all non-`node_modules` files, so no per-file `<svelte:options runes />` is needed.

### Vite Config (`vite.config.ts`)

Two plugins: `tailwindcss()` from `@tailwindcss/vite` (Tailwind v4's Vite integration) and `sveltekit()`. No custom aliases, env handling, or optimization settings.

### Tailwind CSS v4

Tailwind v4 removes the traditional `tailwind.config.js` file. All configuration lives in `app.css`:
- `@import 'tailwindcss'` replaces the old `@tailwind base/components/utilities` directives
- `@theme { ... }` defines custom colors, fonts, and other design tokens directly in CSS
- The `@tailwindcss/vite` plugin handles scanning and compilation

### TypeScript (`tsconfig.json`)

Key settings: `strict: true`, `moduleResolution: "bundler"` (for SvelteKit compatibility), `allowJs` and `checkJs` enabled, `rewriteRelativeImportExtensions` for `.ts` → `.js` rewrites in imports.

### Environment Variables

Three categories:
- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` -- accessed via `$env/static/public` in layout load
- `GOOGLE_PLACES_API_KEY` -- server-only, accessed via `$env/static/private` in API routes
- `PUBLIC_MAPTILER_KEY` -- accessed via `$env/dynamic/public` in `+layout.server.ts` (runtime read, not build-time inlined) and passed to pages through the layout data

Public vars (prefixed `PUBLIC_`) are safe to expose to the browser. The Google API key is server-only and never sent to the client.

---

## Performance Optimization

Two comprehensive optimization passes were performed across all server loads, client-side stores, and API routes. The first audit identified and fixed five classes of query-level performance issues (sequential queries, unfiltered junction scans, N+1 patterns). The second audit addressed client-side reactivity, data transfer volume, and write-path efficiency (full table scans for dedup, eager loading of modal data, N individual mutations, aggressive re-fetches, reactive effects firing too broadly). See [PERFORMANCE-AUDIT.md](./PERFORMANCE-AUDIT.md) for the full analysis and prevention guidelines.

A separate latency investigation documented the add-by-url pipeline end-to-end, resulting in parallel dedup/API overlap and shortlink URL caching. See [PERFORMANCE-URL-SEARCH.md](./PERFORMANCE-URL-SEARCH.md) for the pipeline breakdown and instrumentation guide.

### Optimized Query Patterns

**Embedded joins instead of sequential queries**: All server loads and store functions now use Supabase's embedded resource syntax to fetch parent rows and related junction data in a single query. For example, `places.select('..., place_tags(tag_id)')` fetches places with their tag associations in one round-trip, replacing the previous pattern of fetching places first, extracting IDs, then querying `place_tags` with `.in('id', ids)`.

**Deep nested joins**: Collection detail and public share pages use two-level nested joins: `list_places(place_id, places(...))` fetches the collection, its member place IDs, and full place details all in one query. This collapsed the collection detail load from 4 sequential round-trips to 1.

**Parallel independent queries**: Where multiple independent queries are needed (e.g., places + tags + lists on the places page), they're wrapped in `Promise.all()` to execute in parallel. The wall-clock time equals the slowest single query rather than the sum of all queries.

**User-scoped junction table access**: Junction tables (`place_tags`, `list_places`) are no longer queried directly without filters. They're accessed through embedded joins on user-scoped parent tables (e.g., `places.select('..., place_tags(tag_id)').eq('user_id', userId)`), which automatically scopes the junction data to the current user.

**Upsert instead of check-then-insert**: Tag application (`applyTagsToPlace`, `applyContextTags`) uses `.upsert()` with `onConflict` and `ignoreDuplicates: true` instead of per-row SELECT + conditional INSERT. This collapses N tag applications from 2N round-trips to 1.

### Round-Trip Summary

| Route / Function | Before | After |
|---|:-:|:-:|
| Any route (auth hook) | 1 network call (`getUser()`) | 0 (`getSession()` only) |
| `/collections` server load | 2 sequential | 1 (embedded join, ordered by `updated_at`) |
| `/places` server load | 2 sequential | 1 (`Promise.all` with 3 joined queries) |
| `/collections/[id]` server load | 4 sequential | 1 (`Promise.all` with deep nested join + tags) |
| `/c/[slug]` server load | 3 sequential | 1 (deep nested join) |
| `applyTagsToPlace` | 2N per action | 1 (upsert) |
| `applyContextTags` | 2 + N | 2 (validate + upsert) |
| Reorder (N items) | N round-trips | 1 (upsert) |
| Tag removal (N tags) | N round-trips | 1 (`.in()` delete) |
| Batch enrichment (10 places) | 10 sequential | ~4 batches of 3 concurrent |

---

## Trade-offs

### 1. Client-Side Filtering vs. Server-Side Queries

**Chose**: All filtering, sorting, and searching happens client-side in JavaScript.

**Why**: Simpler architecture -- load all places once, then derive everything reactively. Supabase's JS client doesn't natively support the mixed AND/OR tag filtering logic across a junction table without raw SQL or RPC calls.

**Downside**: Doesn't scale well. Loading all places and all place-tag associations upfront will degrade as the dataset grows. For hundreds of places it's fine; for thousands, pagination and server-side filtering would be needed.

### 2. Three-Source Tag Model vs. Free-Form Tags

**Chose**: Tags have a `source` field (`category`, `area`, `user`) that determines their behavior and appearance.

**Why**: Category and area tags are auto-generated from Google data and should be visually distinct and non-editable. Mixing them with user tags would make the UI confusing.

**Downside**: Rigid. If a user wants to recategorize a place, they can't edit the category tag. The system also creates duplicate category tags if Google's type data is inconsistent (e.g., "Restaurants" vs "Restaurant").

### 3. Batch Enrichment Limited to 10 Places

**Chose**: The enrich-all endpoint processes at most 10 places per request.

**Why**: Google Places API has per-request and per-second quotas. Processing too many at once risks timeouts (Vercel has a ~10s serverless function limit on the free tier) and rate limit errors. The 200ms delay between requests keeps it under rate limits.

**Downside**: Users with hundreds of unenriched places need to click "Fetch Details" multiple times. A queue-based or streaming approach would be better at scale.

### 4. Junction Table vs. JSON Array for Tags

**Chose**: Separate `tags` and `place_tags` tables (normalized schema).

**Why**: Enables efficient tag-based queries, independent tag management (rename, recolor, delete across all places), and count aggregation. RLS policies on both tables enforce data isolation -- `tags` policies check `user_id` directly, while `place_tags` policies verify ownership through the parent `places` table.

**Downside**: More complex client-side code. The `placeTagsMap` needs to be built by joining place_tags with tags, and every tag operation (add, remove) requires a separate database call. The RLS join-based policies on `place_tags` add query overhead compared to a simple `user_id` check.

### 5. Portal Pattern for Tag Dropdown

**Chose**: Tag suggestion dropdowns are portaled to `document.body`.

**Why**: PlaceCard uses 3D transforms (`transform-style: preserve-3d`), which creates a new stacking context. A dropdown rendered inside the card would be clipped and appear behind other cards regardless of z-index.

**Downside**: Manual position management. The dropdown position is calculated from `getBoundingClientRect()` and doesn't automatically reposition on scroll or resize.

### 6. Auto-Save vs. Explicit Save for Notes

**Chose**: Debounced auto-save (800ms after last keystroke).

**Why**: Lower friction -- users don't need to find and click a save button. Matches the expected behavior of modern note-taking apps.

**Downside**: Network requests fire frequently during editing. If the user is offline or the save fails silently, they might lose edits. There's no retry or offline queue.

### 7. Deterministic Tag Colors vs. User Picks First

**Chose**: New tags get a color derived from their name hash. Users can override later.

**Why**: Ensures tags created inline (via TagInput on a card) get a visually distinct color immediately without requiring the user to pick one. The same tag name always maps to the same color, so there's consistency.

**Downside**: Users might not like the auto-assigned color. Two semantically different tags could hash to the same color. The 6-color palette limits variety.

### 8. JWT-Only Auth for Reads vs. Server-Side Validation

**Chose**: Use `getSession()` only (zero network cost — reads JWT from cookies locally) for all route-level auth checks. No `getUser()` call on every request.

**Why**: `getUser()` makes a network round-trip to Supabase Auth on every request, adding significant latency to every page navigation. The JWT is cryptographically signed, so `getSession()` can be trusted for read operations. RLS policies at the database level validate `auth.uid()` from the JWT on every query, providing a second layer of defense.

**Downside**: A revoked session won't be detected until the JWT expires (typically 1 hour). During that window, a revoked user can still access data — but only their own data, since RLS policies enforce ownership. Session cookies use `httpOnly: false` (required for the Supabase browser client), so the token is accessible to client-side JavaScript and vulnerable to XSS. The security model relies on RLS as the final enforcement layer.

### 9. MapLibre + MapTiler vs. Google Maps Display API

**Chose**: MapLibre GL JS with MapTiler's free-tier pastel style instead of Google Maps JavaScript API.

**Why**: Google Maps Platform charges per map load and per marker interaction after a modest free tier. MapLibre is open-source and free; MapTiler's free tier provides 100K map loads/month. The pastel style also matches the app's warm aesthetic better than Google's default style, which would require expensive styling overrides.

**Downside**: MapTiler requires a separate API key and account. The MapLibre ecosystem has fewer built-in features than Google Maps (no Street View, no built-in place autocomplete). MapTiler's free tier has limits that could be hit in production. The pastel style may not cover all regions with the same detail level as Google Maps.

### 10. Single Map Instance via CSS Repositioning vs. Conditional Rendering

**Chose**: One MapView component instance with CSS flex/order properties to position it differently on mobile vs. desktop.

**Why**: Two separate instances (one for mobile, one for desktop) would double memory usage (WebGL contexts, tile data), require state synchronization between them, and cause a jarring re-initialization when crossing the breakpoint during resize.

**Downside**: The CSS approach limits layout flexibility. The map must be a sibling of the content panel in the DOM, which constrains where it can appear. A portal-based approach (moving the map DOM element between containers) would allow more layout freedom but adds complexity and can break MapLibre's internal state.

### 11. No Pagination

**Chose**: Load all places at once on the places page.

**Why**: Enables instant client-side filtering, sorting, and search without round-trips. The `$derived` reactivity chain (filteredPlaces → sortedPlaces) works naturally with the full dataset.

**Downside**: Initial load time grows linearly with place count. Three parallel queries (places, tags, place_tags) all return full datasets. This will need pagination or virtual scrolling for large collections.

### 12. Personal Rating vs. Google Rating Display

**Chose**: Replace the Google-sourced rating display entirely with a user-editable personal rating, rather than showing both side by side.

**Why**: The app is a personal organizer, not a discovery tool. A user's own rating of a place they've visited is more meaningful than a crowd-sourced average. Showing both ratings would clutter the card's compact layout and create confusion about which rating matters. The Google data (`rating`, `rating_count`) is preserved in the database for potential future use.

**Downside**: Users lose the Google crowd signal at a glance. If a user hasn't rated a place yet, the card shows "Not rated" instead of the potentially useful Google average. A future enhancement could show the Google rating as a subtle secondary indicator or as a default until the user provides their own.

### 13. DOM Teleport for Rating Popover vs. Page-Level Rendering

**Chose**: The `RatingEditor` teleports itself to `document.body` via `onMount` rather than being rendered at the page level and controlled via shared state.

**Why**: Keeps the rating logic self-contained within `RatingDisplay` → `RatingEditor`. No need for page-level state to track which place's rating is being edited, no prop-drilling for open/close, and each card independently manages its own rating editor lifecycle. This matches the existing `TagInput` portal pattern.

**Downside**: DOM teleport bypasses Svelte's normal component tree for layout purposes. The teleported elements inherit `document.body`'s styles rather than any parent's scoped styles (mitigated by using Tailwind utility classes which are global). The wrapper element briefly exists in the original DOM position before teleportation, requiring the `display: none` → `mounted` flag workaround.

### 14. Emoji Icon vs. Image Upload for Collections

**Chose**: Collections can optionally display a single emoji character as their icon, selectable from a curated picker. The `emoji` column on `lists` stores a plain text character.

**Why**: Emojis are universally supported, require zero storage infrastructure (no image hosting, resizing, or CDN), and render natively on all platforms. A curated picker keeps the UI fast and avoids moderation concerns. The column is nullable, so existing collections gracefully fall back to the color-circle indicator.

**Downside**: Limited expressiveness -- users can't upload custom images or logos. The curated emoji set may not cover every use case. Emoji rendering varies across operating systems (an emoji may look different on iOS vs. Android vs. Windows). A future enhancement could add image upload alongside emoji as an alternative.

### 15. Inline Filter Bar vs. Sidebar Navigation

**Chose**: Replaced the `TagSidebar` component with inline filter chip rows rendered directly in the main content area of the places page.

**Why**: The sidebar consumed significant horizontal space on desktop (256px fixed width) and required a separate slide-in overlay on mobile. Inline filter chips are more compact, visible at all times without a toggle, and consistent across breakpoints. This also simplified the component tree -- no separate `TagSidebar.svelte` component, no `mobileOpen` state management, no backdrop blur overlay.

**Downside**: The inline approach has less room for hierarchical organization. The sidebar could display tag groups with headers, counts, and "All Places" navigation in a scannable vertical list. Inline chips rely on horizontal scrolling which can hide tags that overflow the viewport. Source list filtering (by import source) was part of the sidebar and needed to be integrated differently.

---

## Bugs & Fixes

### 1. Shortened Google Maps URLs Redirecting to Consent Pages

**Problem**: When resolving `maps.app.goo.gl` short links, the server-side `fetch` sometimes landed on a Google consent/interstitial page instead of the actual Maps URL. This happened because the share URL included tracking parameters like `?g_st=ic` that triggered different behavior on server-side requests.

**Fix**: Added `cleanGoogleMapsUrl()` that strips all query parameters from shortened URLs before following redirects. The short-link identifier is in the pathname, so query params are unnecessary. Also added a fallback chain: try the cleaned URL first, then the original, then manual redirect following via `Location` headers.

### 2. Japanese Address Components Returning Numeric Values

**Problem**: For Japanese addresses, `addressComponents` often returned values like "1-chome" or "2-3-4" for sublocality levels, which are street-level subdivisions, not meaningful area names.

**Fix**: Added `isNumericOrChome()` check that skips components matching `/^[\d\s\-chōme]+$/i`. The area extraction function tries each priority level and only accepts values that pass this filter. As a final fallback, it parses the formatted address string looking for ward/city names.

### 3. Tag Input Dropdown Clipped by 3D Transforms

**Problem**: The tag suggestion dropdown appeared behind other place cards or was completely invisible. This happened because `transform-style: preserve-3d` on the PlaceCard creates a new stacking context, and elements inside it can't escape the card's visual boundaries with z-index alone.

**Fix**: Implemented a portal pattern using a Svelte action (`use:portal`) that moves the dropdown to `document.body`. The dropdown position is calculated from the input element's bounding rect. The tradeoff is manual position management, but it reliably escapes all stacking context issues.

### 4. Layout Shift When Toggling Tag Filters

**Problem**: When enabling or clearing tag filters, the "Filtered by: Tag1, Tag2..." summary would appear/disappear, causing all content below to jump.

**Fix**: Reserved a minimum height on the filter summary container (`min-h-[28px]` on mobile, `min-h-[32px]` on desktop) so it always occupies space even when empty.

### 5. PlaceCard Flip Triggered by Button Clicks

**Problem**: Clicking on links (Maps, Website), buttons (Enrich, Delete), or the tag input inside a card would also trigger the flip animation, since the entire card had a click handler.

**Fix**: The `handleFlip` function checks `e.target.closest('a, button, input, textarea, [role="button"]')`. If the click originated from or inside an interactive element, the flip is suppressed.

### 6. Unsaved Notes Lost on Card Flip

**Problem**: If a user was typing a note on the back of a card and clicked to flip back to the front, the 800ms debounce timer might not have fired yet, losing the most recent edits.

**Fix**: The `flipToFront` handler checks if a save timer is pending. If so, it clears the timer and immediately calls `autoSave()` before flipping, ensuring all edits are persisted.

### 7. Swipe-to-Delete Conflicting with Vertical Scroll

**Problem**: On the list view, horizontal swipe gestures for delete were interfering with vertical scrolling. A diagonal finger movement would both scroll the page and partially reveal the delete button.

**Fix**: Implemented gesture locking in `onTouchMove`. The first significant movement (> 5px) determines the axis: if vertical, the gesture is "locked" as a scroll and horizontal tracking is disabled for that touch sequence. Only a clearly horizontal movement activates swipe mode.

### 8. Tag Name Duplicates with Different Casing

**Problem**: Users could create "Coffee" and "coffee" as separate tags, or "  Extra  Spaces  " and "Extra Spaces", leading to confusion.

**Fix**: Tag names are normalized before duplicate checking: `name.toLowerCase().trim().replace(/\s+/g, ' ')`. This normalization is applied consistently across TagInput, TagManager, and TagContextMenu. Display names preserve user casing if mixed-case was intentional, but all-lowercase input gets auto-title-cased.

### 9. Supabase `getSession()` JWT Forgery Risk

**Problem**: The Supabase `getSession()` method reads the JWT from the cookie without validating it against the server. A malicious user could forge a JWT with a different `user_id` and access another user's data.

**Mitigation**: RLS policies provide the primary defense since they check `auth.uid()` at the database level using the cryptographically signed JWT. The `safeGetSession` pattern in `hooks.server.ts` uses `getSession()` only (no `getUser()` call) to avoid the per-request network round-trip to Supabase Auth. This trusts the JWT's cryptographic signature for read operations while relying on RLS for data isolation. `getUser()` (which makes a server-side validation call) is reserved for sensitive write operations where stronger token validation is needed.

**History**: The initial implementation called `getUser()` on every request, which was later found to add significant latency to every page navigation. An intermediate version fell back to `session.user` when `getUser()` failed, to avoid logging users out during transient Auth outages. The current version skips `getUser()` entirely for page loads, trusting the signed JWT and RLS.

### 10. `onAuthStateChange` Triggering Unnecessary Reloads

**Problem**: Supabase's auth state change listener fires on every token refresh (roughly every hour). Without guarding, this would re-invalidate the layout load and refetch all data unnecessarily.

**Fix**: The listener in `+layout.svelte` compares `newSession?.expires_at` with the current `session?.expires_at`. It only calls `invalidate('supabase:auth')` if the expiry actually changed, filtering out duplicate events where the session content is identical. `SIGNED_OUT` events are handled separately and always invalidate.

### 11. Swipe-to-Delete Dismissal Conflicting with Card Flip

**Problem**: On the mobile grid view after adding swipe-to-delete to PlaceCard, tapping the card while the delete action was revealed would trigger the 3D flip instead of dismissing the swipe. This was disorienting -- the card would flip while still shifted sideways.

**Fix**: Added a swipe-awareness check to `handleFlip`: if `swipeX !== 0` (card is swiped open), tapping resets `swipeX` to 0 and returns early without flipping. The flip only triggers when the card is in its default (non-swiped) position.

### 12. `share.google` URLs Not Resolvable via Redirects

**Problem**: Google's newer share URL format (`share.google/*`) doesn't follow the same redirect pattern as `maps.app.goo.gl` short links. Server-side `fetch` with `redirect: 'follow'` often resolves back to the same `share.google` page or an intermediate page, never reaching a usable `google.com/maps` URL.

**Fix**: The resolver now attempts to extract the destination from the HTML response body via three fallback strategies: `<meta>` refresh tag URL extraction, regex matching for `google.*/maps/place/` URLs, and `maps.google.*` link extraction. If all strategies fail, the original `share.google` URL is returned (instead of throwing), and the `add-by-url` endpoint detects this via `isShareGoogleUrl()`. It then skips URL-based extraction (place ID, coordinates) and falls back to scraping the share page for the place name (via `og:title` meta tag or `<title>` tag), which is used as the text search query for the Places API.

### 13. Session Expiry During Background Tabs

**Problem**: When a user leaves the app in a background tab for an extended period, the session JWT can expire silently. On returning to the tab, API calls fail with 401 errors but the UI still shows the authenticated state.

**Fix**: Added a `visibilitychange` listener in the root layout that fires when the tab returns to the foreground. It checks whether the current session is near expiry (within a 5-minute margin) and proactively calls `supabase.auth.refreshSession()`. If no session exists at all, it calls `invalidate('supabase:auth')` to trigger a full state update. Combined with the scheduled `scheduleTokenRefresh()` timer, this ensures sessions are refreshed before they expire under normal conditions, and recovered quickly when returning from a long background period.

### 14. Rating Popover Invisible Inside 3D-Transformed Card

**Problem**: The `RatingEditor` popover (backdrop + star scrubber) was rendered with `position: fixed` inside PlaceCard's 3D-transform context (`perspective`, `transform-style: preserve-3d`, `backface-visibility: hidden`). CSS specifies that when an ancestor has a `transform`, it creates a new containing block for fixed-position elements. This caused the popover to be positioned relative to the card's local coordinate space instead of the viewport, making it invisible or clipped behind the card face.

**Fix**: The `RatingEditor` wraps all its content in a single `<div>` that is teleported to `document.body` via `onMount(() => document.body.appendChild(wrapperEl))`. This escapes all ancestor stacking contexts and transforms. The wrapper starts hidden (`display: none`) and becomes visible once the `mounted` flag is set after teleportation, preventing a visual flash during the first render frame. Svelte's reactivity continues to work because it tracks the component tree, not DOM position. The element is removed from the body on `onDestroy` via the `onMount` cleanup return.

### 15. Cross-User Data Leakage via Missing RLS on Tags and Place_Tags

**Problem**: The `tags` and `place_tags` tables were created without Row Level Security enabled or any RLS policies. This meant that any authenticated user could read (and potentially modify) every other user's tags and place-tag associations via the Supabase client. The data isolation relied entirely on client-side query filtering (`eq('user_id', ...)`) which is trivially bypassed.

**Fix**: Migration `fix_rls_data_isolation.sql` enables RLS on both tables and creates full CRUD policies. For `tags`, ownership is verified directly via `auth.uid() = user_id`. For `place_tags`, ownership is verified through the parent `places` table (a place_tag is accessible only if the linked place belongs to the current user). Additional read-only SELECT policies allow anonymous access to tags and place_tags that belong to places inside a `link_access` collection, preserving shared collection functionality.

### 16. Cookie `httpOnly` Changed from `true` to `false`

**Problem**: With `httpOnly: true` on the session cookie, the Supabase JS client running in the browser could not read or refresh the session token from cookies. This caused issues with client-side auth state management -- the browser client couldn't detect existing sessions, leading to unnecessary re-authentication or stale session state.

**Fix**: Changed the cookie option in `hooks.server.ts` from `httpOnly: true` to `httpOnly: false`. This allows the Supabase browser client to read and manage the session cookie directly. The security trade-off is that the session token becomes accessible to client-side JavaScript (and therefore to XSS attacks), but this is the expected configuration for `@supabase/ssr` where the browser client needs cookie access for session management.

### 17. Swipe-to-Delete Layer Visible During Scroll, Flip, and State Changes (Compositing / Transform-Boundary Bug)

**Problem**: On mobile, the red delete action behind swipeable list items and grid cards was not truly hidden. The delete button would flash into view during fast vertical scrolling, appear momentarily during card flip animations, and bleed through during expand/collapse transitions. This persisted even after adding explicit z-index separation because the root cause was a **compositing / transform-boundary issue**, not a simple paint-order problem:

1. In PlaceCard, the mobile layout used `perspective`, `transform-style: preserve-3d`, and `rotateY()` for the 3D card flip. These CSS properties force the browser to promote child elements to independent composited layers. During fast scrolling, the compositor can paint these layers independently from the `overflow: hidden` clipping ancestor, causing the delete button (which sits behind in the DOM) to flash through.
2. `transform-style: preserve-3d` specifically tells the browser not to flatten child layers into the parent's paint -- it preserves the full 3D rendering context. This means `z-index` and `overflow: hidden` on ancestor elements are not respected in the same way during GPU compositing, because children are rendered in 3D space rather than being flattened into the parent's 2D layer.
3. Even with the delete layer as a sibling outside the 3D context, the `translateX` on the swipe-foreground combined with `preserve-3d` on a descendant creates overlapping compositing boundaries that the GPU compositor resolves unpredictably during rapid frame updates (e.g., momentum scrolling).
4. The collections page previously used `bg-danger-500` on the row container itself, painting the red as the row's own background rather than isolating it in a separate layer.

**Fix**: The fix required two changes:

1. **Conditionally render the delete-background layer**: The delete layer only enters the DOM when `swipeX < 0 || swiping`. When the card is at rest (not being swiped), there is literally no delete element to flash through -- not hidden behind the foreground, but absent from the DOM entirely. This eliminates all compositing artifacts regardless of what 3D transforms exist elsewhere in the tree.
2. **3D flip preserved on both mobile and desktop**: With the delete layer conditionally rendered, the full `perspective` + `preserve-3d` + `rotateY(180deg)` flip animation works safely on mobile because during flip animations (when no swipe is active), the delete element does not exist in the DOM.

All swipeable components (PlaceCard, PlaceListItem, Collections index) now use:
- **row-root**: `position: relative; overflow: hidden; border-radius`. No background color, no transforms. Pure clipping container.
- **delete-background**: `position: absolute; inset: 0; z-index: 0; flex; justify-end`. **Conditionally rendered** only during active swipe. Never receives any transform, perspective, or will-change.
- **swipe-foreground**: `position: relative; z-index: 1; bg-white`. The **only** element that receives `translateX()` for swipe. Contains the 3D flip structure (perspective + preserve-3d + rotateY) inside it.

This is a compositing architecture fix, not a z-index tweak. The key insight is that removing the delete element from the DOM entirely when not swiping is more robust than trying to hide it with z-index or overflow -- GPU compositing can bypass both of those during fast scroll passes, but it cannot render an element that does not exist.

---

## Known Inconsistencies

These are not bugs, but implementation inconsistencies worth noting for future cleanup.

### 1. `order_index` Optional

The `order_index` column on `tags` may not exist if the migration hasn't been run. All tag ordering code (`saveTagOrder`, `getNextOrderIndex`, `reindexAfterDelete`) checks the Supabase `{ error }` response and falls back silently (returns `0`, `{ ok: false }`, or early-returns respectively). Tags created when `order_index` is missing get no ordering, and the UI falls back to alphabetical sort.

### 2. Debug `console.log` Statements

`console.log` and `console.warn`/`console.error` calls remain in production code:
- `places/+page.svelte`: URL add debugging (lines 138, 155), data load warnings (lines 220, 230), and collection creation errors (line 421)
- `api/places/add-by-url/+server.ts`: Extensive request/response logging throughout (12 `console.log` calls tracing the full URL resolution, deduplication, and insertion flow)

The `console.log` calls should be removed or gated behind a debug flag before production deployment. The `console.warn` and `console.error` calls are more defensible as they log actual failure conditions.

### 3. Two `normalizeUrl` Functions

`cleanGoogleMapsUrl()` in `google-places.ts` strips all query params from shortened URLs aggressively. `normalizeUrl()` in `add-by-url/+server.ts` selectively strips tracking params while keeping place-identifying ones. Both serve URL normalization but with different strategies and no shared code.

### 4. Mobile Layout Detection -- JS vs. CSS

The mobile/desktop split uses a JS `isMobile` state variable (updated on `resize`, threshold 1024px) to conditionally render different component trees (`MobileMapShell` vs. bare `MapView`). This duplicates the `lg:` Tailwind breakpoint at 1024px but in JS. If the breakpoint changes in Tailwind, the JS threshold must also be updated manually. A `matchMedia` approach or a shared breakpoint constant would reduce this coupling.

### 5. `list_places.position` Column Missing from TypeScript Types

The `add_list_places_position.sql` migration adds a `position` integer column to `list_places` in the database, but the TypeScript type definition in `src/lib/types/database.ts` does not include `position` in the `list_places` Row/Insert/Update types. Any code attempting to read or write `position` through the typed Supabase client would get a TypeScript error.

### 6. `supabase.ts` Helper Is Dead Code

`src/lib/supabase.ts` exports a `createSupabaseClient()` helper, but no file in the codebase imports it. The actual Supabase client creation is done inline in `src/routes/+layout.ts`.

### 7. `TopBarTagAdd.svelte` Is Dead Code

`src/lib/components/TopBarTagAdd.svelte` (203 lines) is never imported or rendered by any page or component. The places page uses a "Manage" button that opens the full `TagManager` modal instead.

### 8. `/api/places/[id]/intel-tags` Endpoint Available But Not Wired Into UI

The `intel-tags/+server.ts` endpoint is fully implemented (91 lines) and functional, but no page or component in the UI currently calls it. Intel tag computation is available via direct API call but is not surfaced in the app's interface.

---

## Playground Migration

A set of UI improvements, new features, and interaction refinements were migrated from a playground/prototype codebase into this production codebase. Below documents what was migrated, how, and why.

### What Was Migrated

**Place Photos (net-new feature)**
- Schema: `place_photos` table with RLS + `place-photos` Supabase Storage bucket (`supabase/add_place_photos.sql`)
- Types: `PlacePhoto` and `PlacePhotoInsert` added to `database.ts`
- Utility: `photo-storage.ts` — upload with client-side compression, delete, load, URL helpers. All backed by real Supabase Storage
- Components: `PhotoGrid.svelte` (upload, grid view, drag-to-reorder, lightbox launch) and `PhotoLightbox.svelte` (full-screen viewer with zoom animation, swipe navigation, keyboard support, delete)
- Integration: photos loaded in parallel via `place_photos` query in all `+page.server.ts` files, passed as `placePhotos` prop to `MapView`/`MobileMapShell`, displayed in map popups (thumbnail strip + camera button), and available via a photo modal triggered from popups
- Photo data flows through server load -> page state -> MapView props -> popup HTML -> event delegation -> photo modal/lightbox

**Resizable Desktop Map Panel**
- The map/list split on desktop now uses a CSS custom property (`--desktop-map-pct`) with a drag handle for resizing between 25–70% width. Double-click resets to default (42%). Implemented with pointer events and `setPointerCapture`. Added `.desktop-map-panel` and `.desktop-map-animate` CSS classes

**Popover-Based Controls**
- Sort/view options consolidated into a popover dropdown button across places, collections, and collections/[id] pages. Replaces inline select + toggle buttons for a cleaner toolbar
- SaveViewButton redesigned as "Bookmark" with mobile bottom-sheet and desktop popover patterns, with `onCreateStart` callback and `isMobile` detection
- TagManager gains a `mode` prop (`'modal' | 'popover'`); both mobile and desktop render inline popover with fixed backdrop for dismissal. Popover font size bumped to `text-[0.9375rem]` (15px) for tag names and input fields

**Layout Restructuring**
- Search bar relocated below tag filters/saved views into compact inline position
- Tag filter responsive breakpoints shifted from `md:` to `lg:` for wider mobile-first range
- "Tags" and "Filters" labels added to the filter bar
- Desktop map/list breakpoint shifted from `lg:` to `md:`
- Mobile layout: MobileMapShell renders first (no sticky header above map), controls inside scroll area

**UI Polish**
- PlaceCard: map-pin icon replaces external-link icon for Maps links; "Notes" flip button removed from front (card click or tap flips); title truncation improved (`truncate` + `min-w-0`)
- PlaceListItem: section labels ("Notes", "Tags") removed; action icons moved to absolute top-right for cleaner expanded panel
- SavedViewsBar: desktop bottom margin tightened
- Map popup styling: larger padding/radius/font for better readability
- Map popup photo strip with clickable thumbnails; `max-width: none` added to `.map-popup-photos img` to override Tailwind v4 preflight's `img { max-width: 100% }` which caused photos to expand beyond their 88×88px intended size

**Improved Drag-and-Drop (sortable.ts)**
- RAF-throttled pointer move handler to prevent layout thrashing
- GPU-accelerated transforms (`translate3d` instead of `translate`)
- Animated drop-return transition (ghost element smoothly returns to target position)
- Improved closest-item detection with same-row logic for horizontal layouts
- Debounced insert index calculation (only recalculates when position changes)
- Source element hidden with `visibility: hidden` instead of `opacity: 0.25`
- Body cursor set to `grabbing` during drag
- Native drag prevention via `onDragStart` listener

**MapView Improvements**
- NavigationControl (zoom +/- buttons) removed for a cleaner map interface
- Marker re-click toggles popup (previously re-selected without toggling)
- Popup maxWidth increased from 220px to 360px for photo content
- Popup HTML includes photo thumbnail strip and camera button
- Event delegation for popup photo interactions
- Reactive effect tracks `placePhotos` changes and updates popup HTML

### What Was NOT Migrated

| Item | Reason |
|------|--------|
| `mock-data.ts`, `mock-supabase.ts` | Playground test scaffolding only |
| Mock store implementations | Main has real Supabase-backed stores |
| Mock hooks/layout auth removal | Main needs real auth middleware |
| Mock `tag-order.ts` stubs | Main has real DB persistence |
| Mock `deletePlace()` no-op | Main has real Supabase delete |
| `placesSearchOverlay` empty snippet | Unused placeholder |
| Global warm beige background (`#f3efe8`) | Intentionally excluded |

### What Was Re-implemented for Production

- **Photo data loading**: Playground used hardcoded `MOCK_PLACE_PHOTOS` URLs. Main adds real `place_photos` queries in `+page.server.ts` files with `supabase.storage.from('place-photos').getPublicUrl()` for URL resolution
- **Photo uploads**: Playground used in-memory blob URLs. Main uses real Supabase Storage with proper bucket policies and database persistence
- **Photo sort order**: Playground stored in-memory. Main persists via `place_photos.sort_order` column with batch upsert (`supabase.from('place_photos').upsert(rows, { onConflict: 'id' })`)
- **`closePhotoModal()`**: Re-fetches photo URLs from Supabase after modal close to ensure consistency

### Schema/Storage Changes

1. **New table**: `place_photos` (id, place_id, user_id, storage_path, caption, sort_order, width, height, created_at) with foreign key to `places`, RLS policies for user-scoped CRUD
2. **New storage bucket**: `place-photos` (public read, user-scoped upload/delete, 5MB limit, JPEG/PNG/WebP only)
3. **New indexes**: `idx_place_photos_place_id`, `idx_place_photos_user_id`

### Known Limitations / Follow-up Items

1. The `place_photos` query in server loads fetches ALL user photos, not just those for visible places. For users with many photos, a filtered query (e.g., via join with visible place IDs) would be more efficient
3. Photo compression always outputs JPEG regardless of input format (except PNG). HEIC input is accepted but may not compress correctly on all browsers
4. The resizable desktop map panel percentage is not persisted across page reloads — it resets to the default 42%
5. The `isMobile` breakpoint in SaveViewButton (1023px) is hard-coded and not synchronized with the Tailwind `lg:` breakpoint token. TagManager no longer uses `isMobile` — it renders as a popover in both mobile and desktop tag filter sections
