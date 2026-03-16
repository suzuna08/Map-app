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
- [Add Place Modal](#add-place-modal)
- [Tagging System](#tagging-system)
- [Tag Order & Sortable](#tag-order--sortable)
- [Filtering & Sorting](#filtering--sorting)
- [UI Components & Interactions](#ui-components--interactions)
- [Design System & Theming](#design-system--theming)
- [Responsive Design](#responsive-design)
- [Trade-offs](#trade-offs)
- [Bugs & Fixes](#bugs--fixes)

---

## Architecture Overview

The app follows SvelteKit's file-based routing with a clear separation:

- **Pages** (`src/routes/`) handle layout, navigation, and page-level state
- **Components** (`src/lib/components/`) are reusable UI elements (PlaceCard, TagInput, etc.)
- **Library code** (`src/lib/`) contains business logic (CSV parsing, Google API, tag utilities)
- **API routes** (`src/routes/api/`) are server-side endpoints for operations that need secrets (Google Places API key)

All data fetching on the places page happens client-side via the Supabase JS client, while enrichment and URL import go through server-side API routes because they need the private `GOOGLE_PLACES_API_KEY`.

State management uses Svelte 5 runes throughout:
- `$state` for mutable reactive variables
- `$derived` for computed values (filtered lists, tag counts, etc.)
- `$effect` for side effects (session redirects, data loading)

---

## Authentication

### Supabase SSR Setup

Auth is handled through `@supabase/ssr` with a server hook (`hooks.server.ts`) and a universal layout load (`+layout.ts`).

**Server hook** (`hooks.server.ts`): Creates a server-side Supabase client that reads/writes cookies for session persistence. It exposes a `safeGetSession` helper on `event.locals`.

**The `safeGetSession` pattern**: `getSession()` reads the session from the JWT in the cookie, but the JWT could be tampered with. So after getting the session, it calls `getUser()` which makes an actual request to Supabase Auth to validate the token. If `getUser()` succeeds, the validated user is returned. If `getUser()` fails (error response or network exception), the function falls back to `session.user` from the JWT rather than rejecting the session entirely. This keeps the app functional when Supabase Auth is temporarily unreachable, while RLS policies still enforce row-level access control as a second layer of defense.

**Universal layout** (`+layout.ts`): Creates a browser or server Supabase client depending on context. On the browser side, it uses `createBrowserClient`; on the server, `createServerClient` with empty cookie stubs (the real cookie handling happens in the hook).

**Auth state sync**: The root layout (`+layout.svelte`) subscribes to `onAuthStateChange` and calls `invalidate('supabase:auth')` when the session changes (e.g., token refresh), which re-runs the layout load to update the session prop.

**Route protection**: Individual pages use `$effect` to redirect to `/login` if there's no session. This is client-side only -- there's no server-side guard middleware.

---

## Data Model & Database

### Tables

**`places`** -- The core table. Originally just the CSV fields (title, note, url, tags, comment, source_list), later extended with enrichment columns (google_place_id, category, primary_type, rating, rating_count, price_level, address, area, description, lat, lng, phone, website, enriched_at).

**`tags`** -- A separate tags table with three source types:
- `category` -- auto-created from Google Places type data (e.g., "Restaurants", "Cafes")
- `area` -- auto-created from address components (e.g., "Shibuya", "Shinjuku")
- `user` -- manually created by the user

User tags have an optional `order_index` column for custom ordering (used in TagManager drag-and-drop). Category and area tags do not use order_index.

**`place_tags`** -- Junction table linking places to tags (many-to-many).

**`lists`** and **`list_places`** -- Defined in the migration but not yet used in the UI. These were designed for user-created lists (like Google Maps lists) but the tagging system ended up being more flexible.

### Row-Level Security

All tables have RLS enabled. Policies ensure users can only see/modify their own data. For `list_places`, the policy checks ownership through the parent `lists` table.

### Migration Gap

The `migration.sql` file only defines `places`, `lists`, and `list_places`. The `tags` and `place_tags` tables (along with enrichment columns on `places`) were added later directly in Supabase. The TypeScript types in `database.ts` reflect the full schema.

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
- With tracking params: `?g_st=ic`

The `resolveGoogleMapsUrl` function handles shortened links by following redirects. It first strips tracking params with `cleanGoogleMapsUrl`, then tries `fetch` with `redirect: 'follow'`. If that fails, it tries `redirect: 'manual'` and follows the `Location` header step by step.

### Three-Layer Deduplication

When adding a place by URL, the system checks for duplicates in three ways:

1. **Google Place ID**: If the resolved URL contains a hex place ID (`0x...:0x...`), check if any existing place has the same `google_place_id`
2. **Normalized URL**: Strip trailing slashes and query params, then compare against all existing URLs
3. **Title + Address**: After fetching details from Google, check if a place with the exact same title and address already exists (catches CSV-imported places that were later enriched)

If a duplicate is found at any layer, the API returns `{ duplicate: true }` with the existing place data instead of inserting.

---

## Add Place Modal

The Add Place flow is exposed globally via a modal in the root layout (`+layout.svelte`), so users can add places from anywhere when logged in. The modal is triggered by the "Add Place" button in the nav.

**Tabs**: Paste URL and Upload CSV. The URL tab lets users paste a Google Maps URL and add a single place. The Upload tab is a shortcut: it links to the dedicated `/upload` page for bulk CSV import rather than embedding the upload flow in the modal.

**URL flow**: User pastes a URL, clicks Add. The app calls `/api/places/add-by-url`, which resolves shortened links, deduplicates, fetches Google Places details, and inserts the place. On success, the modal shows the new place and optionally calls `onPlaceAdded` so the parent can refresh data.

**Duplicate handling**: If the API returns `{ duplicate: true }`, the modal shows a "Already in your list" state with the existing place info instead of inserting again.

**Layout integration**: The modal lives in the layout rather than the places page so the Add Place action is always available from the nav. The layout passes `onPlaceAdded={() => invalidate('supabase:auth')}` to trigger a refresh; the places page refetches when its load dependencies change.

---

## Tagging System

### Three Tag Sources

- **Category tags** (gray, `#6b7280`): Auto-generated from Google Places types. Not editable by the user.
- **Area tags** (blue, `#3b82f6`): Auto-generated from address components. Not editable by the user.
- **User tags** (custom colors): Created and managed by the user. Support rename, recolor, and delete.

### Tag Colors

User tags get deterministic colors via `colorForTag` in `tag-colors.ts`. The tag name is normalized (lowercase, trimmed, single spaces), then hashed (djb2-style), and the hash modulo the palette length picks from `TAG_PALETTE` — a curated 10-color palette (rose, amber, olive, teal, slate blue, purple, salmon, brown, steel, mauve). The same name always gets the same color, but users can override it in TagManager. The palette is chosen for contrast and accessibility.

### TagInput Component

The inline tag input on each place card uses a portal pattern: the dropdown suggestions are appended to `document.body` instead of rendered in place. This avoids z-index and overflow clipping issues caused by the card's `overflow: hidden` and 3D transform context.

The input supports:
- Typing to filter existing tags
- Enter to add the top suggestion or create a new tag
- Escape to dismiss
- "Create" option shown only when no exact match exists

Tag names are auto-capitalized (title case) if typed in all-lowercase, but mixed-case input is preserved as-is.

### TagContextMenu

Right-clicking a user tag opens a context menu with rename, recolor, and delete options. The menu position is clamped to the viewport edges so it doesn't overflow off-screen.

---

## Tag Order & Sortable

User tags support a custom order persisted in the `order_index` column on the `tags` table. The order is used when displaying tags in the sidebar, TagManager, and on place cards.

### Tag Order Utilities (`tag-order.ts`)

- **`getNextOrderIndex`**: Fetches the highest `order_index` for the user's tags and returns the next value. Used when creating a new tag.
- **`saveTagOrder`**: Takes an ordered list of tag IDs and updates each tag's `order_index` to match its position. Called after a drag reorder.
- **`reindexAfterDelete`**: After deleting a tag, renumbers remaining tags so indices stay contiguous. Handles the case where `order_index` may not exist yet (graceful no-op).

### Sortable Action (`sortable.ts`)

A Svelte action for drag-and-drop reordering. Used in TagManager for reordering user tags.

**Desktop**: Pointer events. `pointerdown` on an item starts the drag; a ghost clone follows the cursor. Items shift with CSS transforms to show the new order. On `pointerup`, `onReorder(orderedIds)` is called.

**Mobile**: Long-press to initiate. A 300ms timer starts on `touchstart`; if the finger moves > 5px before it fires, the timer is cancelled (avoids conflict with scroll). Once triggered, touch events drive the ghost and reorder.

**Insert index**: `findInsertIndex` uses the midpoint of each item's rect. The drop position is the closest item, with "after" determined by whether the cursor is below 30% of the item height or to the right of center.

**Ghost**: A clone of the dragged element is appended to `document.body` with fixed positioning, scaled up slightly, and a shadow. The original is faded to 25% opacity.

**Edge scrolling**: On touch, dragging near the left/right edges of the scroll container triggers horizontal scroll so users can reorder items that extend beyond the viewport.

---

## Filtering & Sorting

### Filter Logic (Mixed AND/OR)

The filter combines different tag types with different logic:

- **Category tags**: OR within the group -- a place matches if it has ANY of the selected category tags
- **Area tags**: OR within the group -- a place matches if it has ANY of the selected area tags
- **Custom tags**: AND within the group -- a place must have ALL selected custom tags

Between groups, the logic is AND: a place must satisfy category OR, AND area OR, AND custom AND, AND search text, AND source filter.

This was chosen because categories and areas are mutually exclusive (a place is typically one category, one area), so OR makes sense for broadening results. Custom tags are additive descriptors (e.g., "date night" + "outdoor seating"), so AND makes sense for narrowing.

### Search

Search is case-insensitive and checks across four fields: title, description, address, and tag names. All matching is done client-side with `String.includes()`.

### Sorting

Seven sort options, all client-side:
- Newest/oldest by `created_at`
- A-Z/Z-A by `title` with `localeCompare`
- Rating (descending, nulls last)
- Most tagged (by count of tags in `placeTagsMap`)
- Tag group (alphabetically by first user tag name, untagged places sorted last via `\uffff`)

User tags in the sidebar and TagManager are sorted by `order_index` (ascending), then by name. The order is persisted when the user drags to reorder in TagManager.

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

### Layout Shift Prevention

The filter summary area (`"Filtered by: ..."`) reserves a `min-h-[28px]` (mobile) / `min-h-[32px]` (desktop) even when empty, preventing layout shifts when filters are toggled.

### Stale Filter Auto-Removal

An `$effect` watches `selectedTagIds` against the current set of valid tag IDs (category, area, user). If a selected tag no longer exists (e.g., deleted, or no places use it), it is removed from `selectedTagMap` automatically. This prevents "ghost" filters that would show zero results.

---

## Design System & Theming

The app uses a custom Tailwind theme defined in `app.css` with three color families:

- **Brand** (`brand-50`–`brand-900`): Warm gold/amber for primary actions, links, and accents.
- **Sage** (`sage-50`–`sage-900`): Muted green for area tags, backgrounds, and secondary UI.
- **Warm** (`warm-50`–`warm-900`): Neutral warm grays for text, borders, and cards.

**Typography**: Nunito from Google Fonts, loaded in the layout. Used for headings and body text.

**Safe areas**: CSS variables `--safe-top`, `--safe-bottom`, etc. map to `env(safe-area-inset-*)` for notched devices. Body padding is applied when supported.

**Tag palette**: User tags use a curated 10-color palette in `tag-colors.ts` (rose, amber, olive, teal, slate blue, purple, salmon, brown, steel, mauve). Colors are chosen for accessibility and contrast.

---

## Responsive Design

The app has distinct mobile and desktop layouts rather than just reflowing:

- **PlaceCard**: Mobile uses a compact layout with smaller text, fewer visible details, and swipe-to-delete. Desktop shows price level, rating count, more metadata, and hover-reveal delete.
- **PlaceListItem**: Mobile has swipe-to-delete; desktop has hover-reveal action buttons.
- **Tag filtering**: Mobile uses a tabbed horizontal scroll (Category | Area | Custom); desktop shows all three rows inline.
- **Sidebar**: On mobile, it's a slide-in overlay with backdrop blur. On desktop (lg+), it's fixed at 256px width.
- **Navigation**: Heights differ (48px mobile, 56px desktop). The "Add Place" button text is hidden on mobile, showing only the icon.
- **Safe areas**: The layout respects `env(safe-area-inset-*)` for notched devices.

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

### 9. No Pagination

**Chose**: Load all places at once on the places page.

**Why**: Enables instant client-side filtering, sorting, and search without round-trips. The `$derived` reactivity chain (filteredPlaces → sortedPlaces) works naturally with the full dataset.

**Downside**: Initial load time grows linearly with place count. Three parallel queries (places, tags, place_tags) all return full datasets. This will need pagination or virtual scrolling for large collections.

### 10. Add Place Modal in Layout

**Chose**: The Add Place modal lives in the root layout and is triggered from the nav, not the places page.

**Why**: Users can add a place from anywhere (e.g., after landing on the home page). The nav always shows the Add Place button when logged in.

**Downside**: The places page may not auto-refresh when a place is added from another route. The layout uses `invalidate('supabase:auth')` on add; whether that triggers a places refetch depends on load dependencies. A page-specific modal would guarantee a local refresh.

### 11. Long-Press to Reorder on Touch

**Chose**: On touch devices, the sortable action requires a ~300ms long-press to start a drag. Immediate touch movement cancels the timer and is treated as scroll.

**Why**: Prevents accidental reorders when the user is trying to scroll the tag list. The same pattern is used for swipe-to-delete (gesture locking).

**Downside**: Adds friction for users who want to reorder quickly. Power users might prefer an explicit "edit order" mode.

### 12. Tag `order_index` Optional

**Chose**: The `order_index` column on `tags` may not exist in older migrations. `getNextOrderIndex`, `saveTagOrder`, and `reindexAfterDelete` catch errors and fail gracefully.

**Why**: Allows the tag order feature to work without a mandatory migration. New installs add the column; existing projects can add it later.

**Downside**: Tags without `order_index` fall back to name sort. The UI doesn't surface the missing column to the user.

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

**Fix**: The listener in `+layout.svelte` compares `newSession?.expires_at` with the current `session?.expires_at`. It only calls `invalidate('supabase:auth')` if the expiry actually changed, filtering out duplicate events where the session content is identical.

### 11. Swipe-to-Delete Dismissal Conflicting with Card Flip

**Problem**: On the mobile grid view after adding swipe-to-delete to PlaceCard, tapping the card while the delete action was revealed would trigger the 3D flip instead of dismissing the swipe. This was disorienting -- the card would flip while still shifted sideways.

**Fix**: Added a swipe-awareness check to `handleFlip`: if `swipeX !== 0` (card is swiped open), tapping resets `swipeX` to 0 and returns early without flipping. The flip only triggers when the card is in its default (non-swiped) position.

### 12. Enter Key in Notes Textarea Flipping Card Back

**Problem**: When the notes back had a keyboard handler (e.g., `onkeydown` on the back div) to flip the card on Enter for accessibility, pressing Enter while typing in the textarea would also trigger the flip. Users expected Enter to insert a newline in the notes, not flip the card.

**Fix**: The keydown handler must exclude `textarea` and `input` elements. Check `e.target.closest('textarea, input')` and return early if the event originated from inside one. The current implementation avoids this by using explicit "← Back" buttons only; there is no keydown on the back div, so the bug does not occur. If you add keyboard support for flip-back, remember to exclude form controls.
