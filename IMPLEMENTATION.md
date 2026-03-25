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
- [Saved Views](#saved-views)
- [Collections](#collections)
- [Intel Tagging System](#intel-tagging-system)
- [Map Integration](#map-integration)
- [UI Components & Interactions](#ui-components--interactions)
- [Root Layout & Global Concerns](#root-layout--global-concerns)
- [Responsive Design](#responsive-design)
- [Configuration & Tooling](#configuration--tooling)
- [Trade-offs](#trade-offs)
- [Bugs & Fixes](#bugs--fixes)
- [Known Inconsistencies](#known-inconsistencies)

---

## Architecture Overview

The app follows SvelteKit's file-based routing with a clear separation:

- **Pages** (`src/routes/`) handle layout, navigation, and page-level state
- **Components** (`src/lib/components/`) are reusable UI elements (PlaceCard, TagInput, MapView, MobileMapShell, etc.)
- **Stores** (`src/lib/stores/`) contain shared reactive state and data-access helpers (places data loading, toast notifications)
- **Library code** (`src/lib/`) contains business logic (CSV parsing, Google API, tag utilities, intel tagging engine)
- **Actions** (`src/lib/actions/`) contain Svelte actions (drag-and-drop sortable)
- **API routes** (`src/routes/api/`) are server-side endpoints for operations that need secrets (Google Places API key) and admin operations (intel catalog seeding)

All data fetching on the places page happens client-side via the Supabase JS client, while enrichment and URL import go through server-side API routes because they need the private `GOOGLE_PLACES_API_KEY`. The map view uses MapLibre GL JS with MapTiler tiles, loaded client-side only via dynamic import to avoid SSR issues.

**Server-side data preloading**: Pages with heavy data requirements (`places`, `collections`, `collections/[id]`, `c/[slug]`) use `+page.server.ts` files to preload data in parallel on the server before hydration. For example, `places/+page.server.ts` fetches places, tags, place_tags, lists, and list_places concurrently. This reduces the initial client-side waterfall while keeping subsequent interactions client-side only.

State management uses Svelte 5 runes throughout:
- `$state` for mutable reactive variables
- `$derived` for computed values (filtered lists, tag counts, etc.)
- `$effect` for side effects (session redirects, data loading)
- `$props` for component inputs (replaces Svelte 4's `export let`)

Shared state is extracted into `.svelte.ts` modules in `src/lib/stores/`:
- **`places.svelte.ts`**: Data-access functions (`loadPlacesData`, `refreshTagsData`, `buildPlaceTagsMap`, `removeTagsFromPlace`, `applyTagsToPlace`) that encapsulate Supabase queries and the placeTagsMap join logic. These are plain async functions, not Svelte stores -- the reactive state lives in the page components that call them.
- **`toasts.svelte.ts`**: A module-level `$state` array of toast notifications with `showToast()`, `getToasts()`, and `dismissToast()` exports. This enables toasts to be triggered from any component (page, API callback, undo handler) without prop-drilling.

Runes are enabled project-wide via `svelte.config.js` with `dynamicCompileOptions` -- all non-`node_modules` files are compiled in runes mode. There is no per-file `<svelte:options runes />` needed.

---

## Authentication

### Supabase SSR Setup

Auth is handled through `@supabase/ssr` with a server hook (`hooks.server.ts`) and a universal layout load (`+layout.ts`).

**Server hook** (`hooks.server.ts`): Creates a server-side Supabase client that reads/writes cookies for session persistence. It exposes a `safeGetSession` helper on `event.locals`. Cookie options include `httpOnly: true`, `sameSite: 'lax'`, and a 30-day `maxAge` for session persistence across browser restarts.

**The `safeGetSession` pattern**: `getSession()` reads the session from the JWT in the cookie, but the JWT could be tampered with. So after getting the session, it calls `getUser()` which makes an actual request to Supabase Auth to validate the token. If `getUser()` succeeds, the validated user is returned. If `getUser()` fails (error response or network exception), the function falls back to `session.user` from the JWT rather than rejecting the session entirely. This keeps the app functional when Supabase Auth is temporarily unreachable, while RLS policies still enforce row-level access control as a second layer of defense.

**Universal layout** (`+layout.ts`): Creates a browser or server Supabase client depending on context. On the browser side, it uses `createBrowserClient`; on the server, `createServerClient` with empty cookie stubs (the real cookie handling happens in the hook).

**Auth state sync**: The root layout (`+layout.svelte`) subscribes to `onAuthStateChange` and calls `invalidate('supabase:auth')` when the session changes. To avoid unnecessary refetches, the listener compares `newSession?.expires_at` with the current session's `expires_at` and only invalidates if the expiry actually changed.

**Proactive token refresh**: The root layout schedules a timer to refresh the session 5 minutes before the JWT expires (`REFRESH_MARGIN_MS = 5 * 60 * 1000`). `scheduleTokenRefresh()` calculates the delay as `expiresAt - now - margin` and calls `supabase.auth.refreshSession()` when it fires. If the refresh fails (e.g., session revoked server-side), the user is redirected to `/login`. The timer is cleared and rescheduled on every auth state change.

**Visibility-based session check**: A `visibilitychange` listener detects when the browser tab returns to the foreground. If the session is near expiry (within the 5-minute margin), it triggers an immediate refresh. If there's no current session, it invalidates to update the UI.

**Server-side route protection**: `hooks.server.ts` defines a `PROTECTED_ROUTES` array (`/places`, `/upload`, `/api/places`, `/collections`). If there's no session and the request path starts with any protected route, the hook issues a `303` redirect to `/login?redirect=<intended_path>`. This is the primary access control mechanism, replacing the previous client-side-only `$effect` redirect approach.

**Login page redirect**: The login page reads the `redirect` query param and uses `getSafeRedirect()` to validate it before navigating. The function rejects non-relative paths, double-slash prefixes (protocol-relative URLs), and paths that point back to `/login` itself. Invalid redirects fall back to `/places`.

**Email confirmation** (`auth/confirm/+server.ts`): A GET endpoint that handles email confirmation callbacks. Supports both PKCE flows (via `code` query param and `exchangeCodeForSession`) and magic link flows (via `token_hash` + `type` params and `verifyOtp`). On success, redirects to the `next` query param (defaults to `/login`). On failure, redirects to `/login?error=invalid-confirmation-link`.

---

## Data Model & Database

### Tables

**`places`** -- The core table. Originally just the CSV fields (title, note, url, tags, comment, source_list), later extended with enrichment columns (google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at).

**`tags`** -- A separate tags table with three source types:
- `category` -- auto-created from Google Places type data (e.g., "Restaurants", "Cafes")
- `area` -- auto-created from address components (e.g., "Shibuya", "Shinjuku")
- `user` -- manually created by the user

**`place_tags`** -- Junction table linking places to tags (many-to-many).

**`profiles`** -- User profile data synced from Supabase Auth. Columns: `id` (references `auth.users`), `email`, `name`, `avatar_url`, `created_at`, `updated_at`. Auto-populated via two database triggers:
- `on_auth_user_created`: Fires after insert on `auth.users`. Copies `email`, `full_name` (or `name`), and `avatar_url` from `raw_user_meta_data` into the profiles row.
- `on_auth_user_updated`: Fires after update on `auth.users`. Keeps `email`, `name`, and `avatar_url` in sync when the user's auth data changes.

Both triggers use `security definer` with `search_path = ''` to safely access the `auth` schema.

**`lists`** and **`list_places`** -- Used for the Collections feature. `lists` stores user-created collections with name, description, color, visibility (`'private'` or `'link_access'`), and optional `share_slug` for public sharing. `list_places` is the junction table linking places to collections, with a `position` column for manual ordering. Extended via `add_collections_columns.sql` and `add_list_places_position.sql` migrations.

**`saved_views`** -- Persists user-defined filter/sort/layout presets. Stores `filters_json` (JSONB with category, area, custom tag IDs and source), `sort_by`, and `layout_mode`. See [Saved Views](#saved-views).

**`google_place_type_catalog`** -- Stores the official Google Places API (New) type keys with metadata: `type_key`, `can_be_primary`, `table_group` (A/B/C), `status` (active/deprecated/unmapped). Read-only for authenticated users; admin writes happen via service role or the `/api/admin/intel-catalog` endpoint.

**`intel_tag_mappings`** -- Maps Google type keys to internal product-level classifications: `primary_category`, `operational_status`, `market_niche`, `discussion_pillar`, and `suggested_tags` (JSONB array). References `google_place_type_catalog` via foreign key. This is the editable layer that separates external taxonomy from internal business intelligence.

**`place_intel_tags`** -- Optional per-place cache of computed intel tag results. Stores the resolved classification, source types, and an `approved` flag for future user-approval workflows. Unique on `place_id`.

### Row-Level Security

All tables have RLS enabled. Policies ensure users can only see/modify their own data. For `list_places`, the policy checks ownership through the parent `lists` table.

### Migration Gap

The `migration.sql` file only defines `places`, `lists`, and `list_places`. The `tags` and `place_tags` tables (along with enrichment columns on `places`) were added later directly in Supabase. The TypeScript types in `database.ts` reflect the full schema.

A separate `add_tag_order_index.sql` migration adds the `order_index` column to `tags` for drag-and-drop reordering. Because this column may not exist on older deployments, all code that reads or writes `order_index` uses `try/catch` with graceful fallback (see [Tag Reordering](#tag-reordering--drag-and-drop)).

A third migration file, `add_profiles_table.sql`, creates the `profiles` table with RLS policies and the two auth triggers. This migration is independent of the others and can be run at any time.

A fourth migration file, `add_saved_views.sql`, creates the `saved_views` table with full CRUD RLS policies scoped to `auth.uid() = user_id`.

A fifth migration file, `add_collections_columns.sql`, adds `visibility` and `share_slug` columns to `lists` and creates three public-access RLS policies for link-accessible collections.

A sixth migration file, `add_list_places_position.sql`, adds a `position` integer column to `list_places` for manual ordering within collections.

A seventh migration file, `add_intel_tag_system.sql`, creates three tables for the intel tagging system: `google_place_type_catalog` (type registry), `intel_tag_mappings` (classification rules), and `place_intel_tags` (per-place computed cache). Catalog and mappings are read-only for authenticated users; place intel tags have full CRUD policies scoped to the owning user.

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

The `/api/places/enrich-all` endpoint processes up to 10 unenriched places per request. After each place, it waits 200ms to avoid hitting Google's rate limits. The frontend shows the result count and reloads data on completion.

### System Tag Creation

After enrichment, `upsertSystemTags` automatically creates and links category and area tags. It uses find-or-create semantics: check if a tag with the same name, source, and user already exists; if not, create it. Then link it to the place via `place_tags` (also with dedup check).

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

### URL Normalization

The `add-by-url` endpoint has its own `normalizeUrl()` function that's distinct from `cleanGoogleMapsUrl()` in `google-places.ts`. It selectively strips tracking parameters (`g_st`, `utm_*`, etc.) while keeping place-identifying params (`q`, `query`, `center`, `ftid`). The enrichment code's `cleanGoogleMapsUrl` is more aggressive, stripping all query params from shortened URLs. This difference exists because the endpoint needs a clean URL for database comparison, while the enrichment code just needs to avoid consent-page redirects.

### Source List Tagging

Places added via URL import get `source_list: 'url-import'`, while CSV-imported places get the filename (minus `.csv`) as their `source_list`. This enables filtering by import source in the sidebar's "Sources" section.

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
2. Checks `place_tags` for existing links to avoid duplicates
3. Inserts only the missing tag links
4. Returns the count of newly applied tags

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

User tags get deterministic colors via `colorForTag`: the tag name is normalized (lowercase, trimmed, single spaces), then hashed with djb2, and the hash modulo the palette length picks from a curated 10-color palette (rose, amber, olive, teal, slate blue, purple, salmon, brown, steel, mauve). The same name always gets the same color, but users can override it.

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

**Sortable action**: Implements drag-and-drop with both mouse and touch support. On touch devices, a 300ms long-press initiates drag (movement < 5px during the press cancels it). The action accepts configuration: `onReorder` callback, `itemSelector`, `idAttribute`, `longPressMs`, and `disabled`.

**Ghost element**: During drag, a cloned element follows the cursor with `position: fixed`, `z-index: 9999`, `scale(1.06)`, and `box-shadow` for visual feedback. The original element gets `opacity: 0.3`.

**Drop position**: Insert position is calculated using distance to item midpoints. An item is placed "after" when `cy > midY + 30% * height` or when vertically centered and `cx > midX`. Edge zones (40px from container edges) trigger horizontal auto-scroll during drag.

**Persistence** (`tag-order.ts`): After reorder, `saveTagOrder()` writes the new `order_index` values to the `tags` table. `getNextOrderIndex()` assigns the next available index to new tags. `reindexAfterDelete()` renumbers remaining tags after a deletion. All functions use `try/catch` because the `order_index` column may not exist yet (added via a separate migration), falling back silently on error.

---

## Filtering & Sorting

### Filter Logic (Mixed AND/OR)

The filter combines different tag types with different logic:

- **Category tags**: OR within the group -- a place matches if it has ANY of the selected category tags
- **Area tags**: OR within the group -- a place matches if it has ANY of the selected area tags
- **Custom tags**: AND within the group -- a place must have ALL selected custom tags

Between groups, the logic is AND: a place must satisfy category OR, AND area OR, AND custom AND, AND search text, AND source filter.

This was chosen because categories and areas are mutually exclusive (a place is typically one category, one area), so OR makes sense for broadening results. Custom tags are additive descriptors (e.g., "date night" + "outdoor seating"), so AND makes sense for narrowing.

### Active Tags Only

The filter UI only shows tags that are currently in use by at least one place. An `activeTagIds` derived set is built from `placeTagsMap` and used to filter `categoryTags` and `areaTags` before rendering. This prevents the UI from showing stale tags for places that have been deleted.

### Stale Filter Auto-Cleanup

An `$effect` watches the valid tag IDs and compares them against the currently selected filter tags (`selectedTagIds`). If any selected tags no longer exist in the dataset (e.g., after a place was deleted and it was the only place with that tag), they're automatically removed from `selectedTagMap`. This prevents ghost filters that match nothing.

Similarly, an `$effect` monitors `selectedSource` against the current `sourceLists`. If the selected source no longer exists in the dataset, it resets to `'all'`.

### Search

Search is case-insensitive and checks across four fields: title, description, address, and tag names. All matching is done client-side with `String.includes()`.

### Sorting

Seven sort options, all client-side:
- Newest/oldest by `created_at`
- A-Z/Z-A by `title` with `localeCompare`
- Rating (descending, nulls last)
- Most tagged (by count of tags in `placeTagsMap`)
- Tag group (alphabetically by first user tag name, untagged places sorted last via `\uffff`)

---

## Saved Views

### What They Are

Saved Views are lightweight user-defined presets that capture the current browsing/filter state on the places page. They are **not** collections of places -- they save the filter configuration, not a set of place IDs. They let users quickly return to a preferred filtered/sorted view without re-selecting tags and sort options each time.

### What Is Stored

Each saved view persists:
- **Filter state**: selected category tag IDs, area tag IDs, custom tag IDs, and source filter
- **Sort option**: the current `sortBy` value (newest, oldest, A-Z, etc.)
- **Layout mode**: grid or list

Not stored in MVP: map center/zoom, selected place, collection scope, search text.

### Data Model

**`saved_views`** table (migration: `supabase/add_saved_views.sql`):
- `id` (uuid, PK)
- `user_id` (uuid, FK to `auth.users`)
- `name` (text)
- `filters_json` (jsonb) -- stores `{ categoryTagIds?, areaTagIds?, customTagIds?, source? }`
- `sort_by` (text, default `'newest'`)
- `layout_mode` (text, default `'grid'`)
- `created_at`, `updated_at` (timestamptz)

RLS policies restrict all operations to `auth.uid() = user_id`.

### Architecture

Follows the same patterns as the existing codebase:

- **Data-access helpers** (`src/lib/stores/saved-views.svelte.ts`): Pure async functions (`loadSavedViews`, `createSavedView`, `updateSavedView`, `deleteSavedView`, `buildFiltersSnapshot`) matching the style of `places.svelte.ts` and `collections.svelte.ts`. No module-level reactive state.
- **Types** (`src/lib/types/database.ts`): `SavedView`, `SavedViewInsert`, `SavedViewFilters` interface.
- **Component** (`src/lib/components/SavedViewsBar.svelte`): Reusable bar component receiving all needed state as props and calling back via `onApply` and `onViewsChanged`. The three-dot menu uses `position: fixed` to escape the `overflow-x-auto` scrollable container (same approach as TagInput's portal dropdown).
- **Integration** (`src/routes/places/+page.svelte`): Loads saved views on mount, manages `activeSavedViewId` state, provides `applySavedView()` to restore filter/sort/layout, and auto-saves filter changes back to the active view with an 800ms debounce.

### UI Placement

The SavedViewsBar renders on the places page between the search bar area and the filter summary / filter chip rows.

**Desktop**: Horizontal row of pill-shaped buttons, each with a bookmark icon and the view name. The active view has a distinct brand-colored border/background/ring. A "Save View" dashed-border button appears at the end. A three-dot menu on each pill provides rename and delete actions. The dropdown menu uses `position: fixed` with coordinates from `getBoundingClientRect()` to escape the `overflow-x-auto` container that would otherwise clip it.

**Mobile**: Same horizontal row, but horizontally scrollable (`overflow-x-auto`) with hidden scrollbars. Pills are compact and touch-friendly. The "Save View" trigger shows only a "+" icon on small screens, expanding to "Save View" text at `sm+`. The create input dismisses on blur (with a 150ms delay to avoid racing with button clicks) or on Escape.

### User Actions

- **Create**: Click the "+ Save View" button, type a name, press Enter or click Save. Captures current filter/sort/layout state. Clicking outside the input (blur) dismisses it if empty.
- **Apply**: Click a saved view pill to restore its filter/sort/layout state. Click again to deactivate (clears all filters).
- **Rename**: Open the three-dot menu → Rename. Inline input replaces the pill; Enter or blur saves.
- **Delete**: Open the three-dot menu → Delete. Removes the view with toast confirmation.

### Auto-Save on Filter Change

When a saved view is active (`activeSavedViewId` is set) and the user changes any filter (toggles a tag, switches source, changes sort or layout), the view auto-saves to reflect the new state. This eliminates a manual "update" step.

**Implementation**: An `$effect` in `+page.svelte` compares the current filter state against the active view's stored `filters_json`. If they differ:

1. A debounce timer (800ms) is started/reset -- rapid changes (e.g., toggling multiple tags) are batched into a single save
2. After the debounce, `buildFiltersSnapshot()` captures the current filter/sort/layout state
3. `updateSavedView()` sends a PATCH to Supabase via PostgREST (`UPDATE saved_views SET filters_json = ... WHERE id = ... AND auth.uid() = user_id`)
4. `refreshSavedViews()` reloads the saved views so the local state reflects the persisted data
5. An `autoSaving` flag prevents the effect from re-triggering during the save cycle

The 800ms debounce matches the notes auto-save pattern used elsewhere in the app. There is no server-side logic beyond Supabase's standard PostgREST + RLS -- all orchestration is client-side.

### Trade-offs

- **Auto-save vs. explicit save**: Saved views auto-update when filters change, which is convenient but means a user can't temporarily explore different filters without altering the view. Clicking the active view pill again deactivates it (clears filters), which provides an escape hatch. A future improvement could add a "lock" toggle to prevent auto-save on specific views.
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
  - `visibility` (text, default `'private'`): `'private'` or `'link_access'`
  - `share_slug` (text, nullable, unique): URL-safe random identifier for public sharing
- **`list_places`** → Collection membership (many-to-many junction)

A migration file (`supabase/add_collections_columns.sql`) adds these columns and creates three new RLS policies:
1. Public SELECT on `lists` where `visibility = 'link_access'`
2. Public SELECT on `list_places` via parent list visibility
3. Public SELECT on `places` that belong to a `link_access` collection (via join through `list_places` → `lists`)

### Routes

**`/collections`** — Index page showing all user collections as cards in a responsive grid. Each card shows the name, place count, color accent, visibility badge, and last-updated date. Supports creating new collections with a name and color picker.

**`/collections/[id]`** — Detail page for a single collection. Shows:
- Editable name and description (click to edit inline)
- Grid/list toggle with PlaceCard and PlaceListItem reuse
- Search within collection
- Sort by recent, A–Z, or rating
- "+ Add Places" modal with search over all user places not in the collection
- Share toggle (private ↔ link_access) with copy-link button

**`/c/[slug]`** — Public read-only share page. Accessed without authentication. Shows a clean layout with the collection name, description, place count, and all places in grid or list view. Each place shows category, area, rating, and links to Google Maps/website. No editing capabilities.

### Store Architecture

`src/lib/stores/collections.svelte.ts` follows the same async-helper pattern as `places.svelte.ts` and `saved-views.svelte.ts`:

- **`loadCollections()`**: Fetches all user collections and builds the `CollectionMemberMap` (record of collection ID → place ID arrays)
- **`createCollection()`**: Creates a collection, optionally bulk-inserting place IDs
- **`updateCollection()`**: Updates name, description, color, visibility, or share_slug
- **`deleteCollection()`**: Deletes a collection (cascade removes `list_places` rows)
- **`addPlaceToCollection()` / `addPlacesToCollection()`**: Single or batch membership insert
- **`removePlaceFromCollection()`**: Removes a place from a collection
- **`enableSharing()` / `disableSharing()`**: Toggles visibility and generates/clears the share slug
- **`loadCollectionBySlug()`**: Loads a collection by slug for the public share page
- **`optimisticAdd()` / `optimisticRemove()`**: Pure functions for optimistic UI updates on the `CollectionMemberMap`

### Adding Places

Three entry points for adding places to collections:

1. **From PlaceCard / PlaceListItem**: A folder+plus icon button in the action row opens `AddToCollectionModal`, which lists all collections with checkmarks for current membership. Toggling adds/removes instantly with optimistic updates and toast feedback.

2. **From collection detail page**: The "+ Add Places" button opens a modal showing all user places not yet in the collection, with search. Clicking a place adds it immediately.

3. **Bulk on creation**: (Future enhancement) Collections can be created from the current filtered view, capturing all visible place IDs at creation time.

**Mobile**: All add/remove actions use explicit buttons and modals — no drag-and-drop dependency. The `AddToCollectionModal` renders as a bottom-sheet (rounded top corners, `items-end` on mobile) for thumb-friendly interaction.

**Desktop**: Same modal pattern, centered on screen. The PlaceCard and PlaceListItem buttons appear in the hover-reveal action row alongside Maps, Website, and Notes.

### Sharing

Simple MVP sharing:

1. **Toggle**: Click the Private/Public button on the collection detail page
2. **Enable**: Generates a random 10-character alphanumeric slug, sets `visibility = 'link_access'`
3. **Copy**: The "Copy Link" button copies `{origin}/c/{slug}` to clipboard
4. **Disable**: Sets `visibility = 'private'`, nullifies the slug

The public page (`/c/[slug]`) loads data via a server load function that queries `lists` filtered by `share_slug` and `visibility = 'link_access'`. RLS policies allow anonymous SELECT on collections and their places when visibility is `link_access`.

### Navigation

The root layout nav bar includes a "My Collections" link (shortened to "Collections" on mobile) between "My Places" and the "+ Add Place" button. The `/collections` route is protected (requires auth). The `/c/[slug]` route is public.

### Trade-offs

- **No drag-and-drop for adding to collections**: While the existing codebase has drag-and-drop for tag reordering, adding places to collections uses only explicit button/modal interactions. This ensures mobile compatibility and avoids conflicts with swipe-to-delete gestures.
- **Slug-based sharing vs. collection ID sharing**: Using a random slug prevents enumeration attacks and makes share URLs non-guessable. The slug is generated client-side, which has a negligible collision risk for 10-character alphanumeric strings.
- **No collaborators**: Sharing is read-only. The owner is the only editor. This simplifies RLS policies and avoids the complexity of shared editing state.
- **Public place data exposure**: When a collection is shared, all place data (title, address, rating, etc.) becomes publicly readable via the RLS policies. This is intentional for the sharing use case, but users should be aware that making a collection public exposes its place details.

---

## Intel Tagging System

### What It Is

The intel tagging system is a structured intelligence layer that maps Google Place types to internal product-level classifications. It transforms Google's external taxonomy (e.g., `restaurant`, `gym`, `bakery`) into a richer internal model with categories, market niches, operational signals, and suggested tags. The engine is pure computation -- no side effects, no database writes -- with optional persistence via Supabase.

### Architecture

The system has three layers:

1. **Google Place Type Catalog** (`src/lib/google-place-types.ts`): A complete registry of 100+ official Google Places API (New) type keys, split into Table A (searchable/primary types) and Table B (returned-only types). Each entry has `type_key`, `can_be_primary`, `table_group`, and `status`. Provides `lookupGoogleType()` and `isKnownGoogleType()` for fast lookups.

2. **Intel Tag Mappings** (`src/lib/intel-tag-mappings.ts`): An editable mapping table of ~80 entries that maps Google type keys to internal classifications across categories like Dining, Cafe, Nightlife, Fitness, Wellness, Attractions, Shopping, Lodging, Services, and Entertainment. Each mapping specifies: `primary_category`, `operational_status`, `market_niche`, `discussion_pillar`, and `suggested_tags`. Provides `lookupMapping()`, `getAllMappings()`, and `getMappingOrDefault()`.

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

**`GET /api/places/[id]/intel-tags`**: Computes intel tags for a single place. Optionally re-fetches from Google for full type data (if the place has a URL). Supports `?market=true` query param to include a `MarketDiscussionOutput` payload (prompt-ready JSON for downstream market discussion use cases).

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
- **Collapsed** (default): 128px tall, showing a compact map preview. Markers are visible but popups are suppressed, and the attribution control fades to 45% opacity at 90% scale.
- **Expanded**: 42vh tall, providing a full interactive map experience with popups and full-opacity controls.

A drag-handle button at the bottom of the shell toggles between states with a 200ms CSS height transition. The `mapMode` prop (`'collapsed'` | `'expanded'`) is passed to `MapView` to adjust behaviors like popup display, attribution placement, fit-bounds padding, and fly-to offsets.

The mobile layout uses `overflow: hidden` on the outer container with the content panel in a scrollable `flex-1 min-h-0 overflow-y-auto` div, preventing the map from scrolling with the page.

**Desktop (lg+)**: The layout switches to `flex-row`. The map panel gets `order-2` (right side), `width: 42%`, and `position: sticky` at `top: 3.5rem` (just below the nav). This keeps the map visible at all times while the left content panel scrolls freely. The `align-self: start` property is required for sticky to work correctly in a flex row -- without it, the flex item stretches to the container height and sticky has no room to "stick".

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

Each marker has a MapLibre Popup styled with the `.map-popup-warm` class to match the app's design -- Nunito font, rounded corners, warm-200 border. Popups show the place title, category, and rating. They appear on hover (desktop) and stay open for the selected marker.

### Bidirectional Selection Sync

Selection synchronization connects the map and the place list/cards:

**Card → Map**: Clicking a PlaceCard (via `handleFlip`) or PlaceListItem (via `toggleExpand`) calls `onSelect(place.id)`, which sets `selectedPlaceId` in the parent page. A separate `$effect` in MapView watches `selectedPlaceId` and responds by: (1) adding `map-marker--selected` CSS class to the target marker, (2) removing it from all others, (3) flying the map to the marker's coordinates, and (4) opening the marker's popup.

**Map → Card**: Clicking a marker calls `onPlaceSelect(placeId)`, which sets `selectedPlaceId` and uses `requestAnimationFrame` + `scrollIntoView({ behavior: 'smooth', block: 'center' })` to scroll the corresponding card into view. Cards and list items have `data-place-id` attributes for DOM targeting.

**Selection cleanup**: An `$effect` in the places page clears `selectedPlaceId` when the selected place is no longer in `filteredPlaces` (e.g., a filter was applied that excludes it).

**Visual feedback**: Selected PlaceCards show a `ring-2 ring-brand-400/30 border-brand-400` highlight. Selected PlaceListItems show a subtle `bg-brand-50` background.

---

## UI Components & Interactions

### PlaceCard -- 3D Flip Animation

Each card has a front (place info) and back (notes editor), connected by a CSS 3D flip. The implementation uses:
- `perspective: 800px` (mobile) / `1000px` (desktop) on the container
- `transform-style: preserve-3d` on the inner div
- `backface-visibility: hidden` on both faces
- `transform: rotateY(180deg)` on the back face
- Class toggle `.is-flipped { transform: rotateY(180deg) }` on the inner div

Click handling uses event delegation: clicks on interactive elements (links, buttons, inputs, textareas) are ignored via `closest()` check, so only clicks on "dead space" trigger the flip.

### PlaceCard -- Swipe to Delete (Mobile Grid)

The mobile grid card layout combines 3D flip with swipe-to-delete. The DOM nesting is: swipe container > swipeable wrapper > perspective container > flip inner.

The swipe layer sits *outside* the perspective/flip context. Touch events (`ontouchstart`, `ontouchmove`, `ontouchend`) are handled on the swipeable wrapper, which translates horizontally via `transform: translateX()`. Behind it, a delete button is conditionally rendered (only when `swipeX < 0`) with `rounded-r-xl` to match the card's border radius.

The `handleFlip` function is swipe-aware: if the card is currently swiped open (`swipeX !== 0`), a tap resets the swipe back to zero instead of triggering a flip. This prevents accidental flips when the user taps to dismiss the delete action.

Gesture locking works the same as in PlaceListItem: the first significant movement (> 5px) locks the gesture to either horizontal (swipe) or vertical (scroll), preventing conflict between the two.

### PlaceCard -- Auto-Save Notes

Notes use debounced auto-save with an 800ms timer. Each keystroke resets the timer. When flipping back to the front, any pending save is flushed immediately (timer cleared + save called) to avoid losing edits.

### PlaceCard & PlaceListItem -- Swipe to Delete

Both PlaceCard (grid view, mobile) and PlaceListItem (list view, mobile) support swipe-to-delete with the same touch gesture handler pattern:

1. `touchstart` records the start position and resets lock/swipe flags
2. `touchmove` calculates horizontal delta. If the first significant movement (> 5px) is vertical, the gesture is "locked" as a scroll and swipe is ignored for the rest of the touch
3. The element translates horizontally, clamped to `[-72px, 0]`
4. `touchend` snaps: if swiped past 36px threshold, it locks open revealing the delete button; otherwise snaps back to 0

In PlaceCard, the swipe layer wraps the entire flip card and interacts cleanly with the flip gesture -- tapping a swiped-open card dismisses the swipe rather than flipping.

### TagInput -- Portal Dropdown

The suggestion dropdown uses a Svelte action (`use:portal`) that moves the element to `document.body`. Position is calculated from the input's `getBoundingClientRect()` and set via inline `style`. The dropdown is rebuilt on every input change to track the input's position.

### TagSidebar

The sidebar provides an alternative navigation interface for filters and source lists:

- **Mobile overlay**: Controlled by `mobileOpen` prop. Shows as a slide-in panel (`translate-x-0` / `-translate-x-full`) with a semi-transparent backdrop. Only visible below `lg` breakpoint.
- **"All Places" clears filters**: Clicking "All Places" when filters are active iterates through all selected tag IDs and calls `onTagToggle` for each, effectively clearing the filter. This is different from a simple reset -- it fires individual toggle events.
- **Source list filtering**: The "Sources" section shows all distinct `source_list` values with counts. Clicking a source toggles between that source filter and "all". This filters orthogonally to tags.
- **Tag creation**: The sidebar's "Add tag" flow creates user tags with a color from a local `TAG_COLORS` array using `Math.random()` for selection. This differs from the deterministic `colorForTag()` used in TagInput and TagManager (see [Known Inconsistencies](#known-inconsistencies)).

### TagManager

Accessed via the "+" button in the custom tags row. A modal that manages user tags with:

- **Inline rename**: Clicking a tag name swaps it for an input field. `requestAnimationFrame` is used to focus and select-all the text after the DOM updates. A 150ms blur delay prevents premature cancel when clicking the save button.
- **Inline delete**: Shows a confirmation row inline (not a separate modal) with "Delete" and "Cancel" buttons.
- **Color picker**: Clicking the color dot opens an inline palette below the tag row. Uses the same `TAG_PALETTE` from `tag-colors.ts`.
- **Sortable list**: The tag list supports drag-and-drop reordering using the same `sortable` action as the filter tag rows.
- **User tags only**: The parent passes `allTags={userTags}` -- category and area tags are excluded from management since they're system-generated.

### TopBarTagAdd

A compact tag creation component (`TopBarTagAdd.svelte`) used in the filter bar area. Renders as a small "+ Add" dashed-border pill that expands into an inline input on click. Features the same portal-based dropdown as `TagInput` for suggestions, auto-title-case normalization, deterministic color assignment via `colorForTag()`, and `order_index` assignment via `getNextOrderIndex()`. Designed for quick tag creation without opening the full TagManager modal.

### AddPlaceModal

A modal with two tabs: "Paste URL" and "Upload CSV". The CSV tab simply links to the `/upload` page rather than embedding the upload flow.

**Status flow**: The URL tab uses a state machine: `idle` → `loading` → `success` | `duplicate` | `error`. Each state shows different UI (input field, spinner, success message with place title, or error message). After success/duplicate, the modal can be closed.

**Single entry point**: The modal is rendered once in the root layout (`+layout.svelte`), toggled by the navbar's "+ Add Place" button. This is the sole explicit add-place entry point (the search bar's inline URL paste is a complementary quick-add path). When a place is added via this modal, it dispatches a `place-added` CustomEvent on `window`, which the places page listens for to refresh its local state via `loadData()`. This avoids the need for a second modal instance on the places page.

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

### Navigation Bar

The nav is sticky (`sticky top-0 z-30`) with a frosted-glass effect (`backdrop-blur-lg bg-warm-50/85`). Heights differ by breakpoint: `h-12` (48px) on mobile, `sm:h-14` (56px) on desktop. The "Add Place" button in the nav shows only an icon on mobile, with text added at `sm+`. This is the single explicit add-place entry point for the entire app -- it opens the `AddPlaceModal` with URL paste and CSV upload tabs.

### Layout-Level AddPlaceModal

The root layout renders the single `AddPlaceModal` instance (toggled by the nav's "+ Add Place" button). This serves as the primary explicit add-place entry point alongside the search bar's inline URL paste. The layout version uses `invalidate('supabase:auth')` for auth refresh and dispatches a `window` `place-added` CustomEvent so the places page can call its local `loadData()` to refresh the place list immediately.

### Auth State Subscription

`onMount` in the root layout subscribes to `onAuthStateChange`. The listener handles two events specifically:

- **`SIGNED_OUT`**: Immediately clears the refresh timer and invalidates.
- **Session change**: Compares `newSession?.expires_at` with the current session's `expires_at`. If the expiry changed, the refresh timer is cleared and rescheduled, and `invalidate('supabase:auth')` is called. This filters out duplicate events from routine token refreshes.

A `visibilitychange` listener also checks the session when the tab regains focus. If the session is expired or near expiry, it triggers an immediate refresh. If there's no session at all, it invalidates to update the UI (e.g., show logged-out state).

### Global Styles (`app.css`)

All design tokens live in `app.css` inside a `@theme` block (Tailwind v4 syntax):

- **brand** palette: Warm browns (#f9f6f1 to #4a412a) -- used for accents, ratings, active states
- **sage** palette: Muted greens (#f2f4ef to #2f362a) -- used for area tags, success states, page background
- **warm** palette: Neutral taupes (#faf9f7 to #28221c) -- used for text, borders, backgrounds

Additional global styles handle safe area insets, tap highlight removal, overscroll behavior, and the toast animation keyframes.

---

## Responsive Design

The app has distinct mobile and desktop layouts rather than just reflowing:

- **Map layout**: Mobile uses a `MobileMapShell` component with a collapsible map (128px collapsed / 42vh expanded) above a scrollable content panel. Desktop uses a sticky right panel (42% width) alongside a scrollable left content area. The two layouts render different component trees controlled by a JS `isMobile` flag (threshold: 1024px).
- **PlaceCard**: Mobile uses a compact layout with smaller text, fewer visible details, and swipe-to-delete. Desktop shows price level, rating count, more metadata, and hover-reveal delete. The card grid uses 1-2 columns (reduced from 3 to accommodate the map panel).
- **PlaceListItem**: Mobile has swipe-to-delete; desktop has hover-reveal action buttons.
- **Tag filtering**: Mobile uses a tabbed horizontal scroll (Category | Area | Custom); desktop shows all three rows inline.
- **Sidebar**: On mobile, it's a slide-in overlay with backdrop blur. On desktop (lg+), it's fixed at 256px width.
- **Navigation**: Heights differ (48px mobile, 56px desktop). The "Add Place" button text is hidden on mobile, showing only the icon.
- **Safe areas**: The layout respects `env(safe-area-inset-*)` for notched devices.

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
- `PUBLIC_MAPTILER_KEY` -- accessed via `$env/static/public` in the MapView component

Public vars (prefixed `PUBLIC_`) are safe to expose to the browser. The Google API key is server-only and never sent to the client.

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

**Why**: Enables efficient tag-based queries, independent tag management (rename, recolor, delete across all places), and count aggregation. RLS policies are straightforward.

**Downside**: More complex client-side code. The `placeTagsMap` needs to be built by joining place_tags with tags, and every tag operation (add, remove) requires a separate database call.

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

**Downside**: Users might not like the auto-assigned color. Two semantically different tags could hash to the same color. The 10-color palette limits variety.

### 8. Resilient Auth Fallback vs. Strict Validation

**Chose**: When `getUser()` fails (network error or error response), fall back to `session.user` from the JWT instead of rejecting the session.

**Why**: The strict version (return null on any `getUser()` failure) caused users to be logged out during transient Supabase Auth outages or slow network conditions. For a personal tool, availability matters more than guarding against JWT forgery on every request.

**Downside**: During an Auth service outage, a forged JWT would be trusted. This is mitigated by RLS policies (which validate `auth.uid()` at the database level using the JWT), but it's theoretically weaker than server-side validation on every request.

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

**Fix**: The `safeGetSession` pattern in `hooks.server.ts` calls `getUser()` after `getSession()`. `getUser()` makes a server-side call to Supabase Auth, which validates the JWT signature. RLS policies provide a second layer of defense since they check `auth.uid()`.

**Iteration**: The initial implementation returned `{ session: null, user: null }` whenever `getUser()` failed, which was overly strict -- a transient network issue contacting Supabase Auth would log users out. This was revised to fall back to `session.user` (from the JWT) when `getUser()` returns an error or throws a network exception. The session is still validated on most requests, but temporary Auth outages no longer break the app. The trade-off is slightly weaker forgery protection during outages, mitigated by RLS.

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

---

## Known Inconsistencies

These are not bugs, but implementation inconsistencies worth noting for future cleanup.

### 1. Tag Color Assignment -- Random vs. Deterministic

**TagSidebar** creates new tags with `TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]` -- a random color from a local palette. **TagInput** and **TagManager** use `colorForTag()` from `tag-colors.ts`, which deterministically hashes the tag name to pick a color from `TAG_PALETTE`.

The two palettes (`TAG_COLORS` in TagSidebar vs. `TAG_PALETTE` in `tag-colors.ts`) also contain different color values. This means a tag created via the sidebar may get a different initial color than the same tag name created via the inline input.

**Impact**: Low. Users can override the color via TagManager. But the inconsistency is surprising.

### 2. `order_index` Optional

The `order_index` column on `tags` may not exist if the migration hasn't been run. All tag ordering code (`saveTagOrder`, `getNextOrderIndex`, `reindexAfterDelete`) uses `try/catch` and falls back silently. Tags created when `order_index` is missing get no ordering, and the UI falls back to alphabetical sort.

### 3. Debug `console.log` Statements

Multiple `console.log` calls remain in production code:
- `places/+page.svelte`: URL add debugging (lines 101, 118)
- `api/places/add-by-url/+server.ts`: Extensive request/response logging throughout (lines 90, 97, 110, 124, 149, 165, 172, 239, 246)

These should be removed or gated behind a debug flag before production deployment.

### 4. Two `normalizeUrl` Functions

`cleanGoogleMapsUrl()` in `google-places.ts` strips all query params from shortened URLs aggressively. `normalizeUrl()` in `add-by-url/+server.ts` selectively strips tracking params while keeping place-identifying ones. Both serve URL normalization but with different strategies and no shared code.

### 5. Mobile Layout Detection -- JS vs. CSS

The mobile/desktop split uses a JS `isMobile` state variable (updated on `resize`, threshold 1024px) to conditionally render different component trees (`MobileMapShell` vs. bare `MapView`). This duplicates the `lg:` Tailwind breakpoint at 1024px but in JS. If the breakpoint changes in Tailwind, the JS threshold must also be updated manually. A `matchMedia` approach or a shared breakpoint constant would reduce this coupling.
