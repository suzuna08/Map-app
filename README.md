# MapOrganizer

Your places, organized. Import saved places from Google Maps, tag them, and find what you need.

## About

MapOrganizer is a web app that helps you manage and organize places you've saved in Google Maps. Import your saved places via Google Takeout CSV export or by pasting Google Maps URLs, then tag, search, filter, and sort them. Every enriched place is plotted on an interactive map alongside a filterable list.

## Features

- **CSV Import** -- Bulk-import saved places from a Google Takeout CSV export with drag-and-drop
- **Inline URL Import** -- Paste a Google Maps link (including `share.google` links) directly into the search bar on the Places page and press Enter to add a place instantly, with toast notifications for success/duplicate/error feedback. The same flow is also available in the navbar's "+ Add Place" modal
- **Place Enrichment** -- Fetch ratings, addresses, phone numbers, coordinates, and more from the Google Places API (single or batch). Uses a three-strategy lookup: Place ID, text search with location bias, and coordinate fallback
- **Personal Ratings** -- Rate any place on a 0.5–5.0 half-star scale. Click the compact rating display on any card to open a drag-to-rate star editor. Saves instantly with optimistic UI updates
- **Interactive Map** -- All enriched places are plotted on a MapLibre GL map (powered by MapTiler). Click a marker to scroll to the card; click a card to fly to its pin. Shows a pastel base map style with custom pin markers, popups, and a geolocate control styled to match the app palette
- **Flexible Tagging** -- Organize places with three tag types: category (auto-generated from Google place types), area (auto-generated from address), and custom (user-created with color coding)
- **Drag-to-Reorder Tags** -- Reorder tags via drag-and-drop (click-drag on desktop, long-press-drag on mobile). Order is persisted per user
- **Tag Management** -- Rename, recolor, and delete custom tags. Right-click any tag for a context menu. Tags get deterministic colors from a curated 6-color muted palette, overridable by the user
- **Search & Filter** -- Find places by name, tags, area, description, or source list. Custom tag filters use configurable AND/OR logic (toggle between "all" and "any" when 2+ tags selected); search also detects Google Maps URLs for inline import
- **Sorting** -- Sort by newest, oldest, A–Z, Z–A, personal rating, most tagged, or tag group
- **Grid & List Views** -- Switch between card grid and compact list layouts. Cards flip (3D animation) to reveal a notes editor on the back
- **Notes** -- Attach personal notes to any place with debounced auto-save (800ms)
- **Deduplication** -- Three-layer duplicate detection by Google Place ID, normalized URL, and title + address
- **Swipe to Delete** -- Swipe cards or list items left on mobile to reveal a delete action
- **Contextual Capture** -- When viewing a custom tag filter, new places added via URL are automatically tagged to match. Includes an auto-tag toggle and undo support
- **Saved Views** -- Save the current filter/sort/layout state as a named preset. Clicking a view applies its filters; changing any filter afterward simply deactivates the view (the saved definition is never touched). To update a view's filters, use the 3-dot menu → Edit View: the view's filters are applied and you can adjust tags freely with Save/Cancel buttons. The 3-dot menu also offers "New Collection" (creates a collection from all matching places) and "Add to Collection..." (batch-adds matching places to an existing collection). Persisted per-user in Supabase
- **Collections** -- Create curated, shareable groups of places. Collections are independent from filters: add places individually, from the collection detail "Add Places" modal (with tag filtering), or from a saved view's 3-dot menu. Share a collection via a public link (`/c/slug`) with a read-only view showing place details, ratings, notes, and an interactive map. Toggle between private and link-accessible visibility, and browse any collection with the same grid/list view and sort options as the main places page
- **Intel Tagging** -- Structured intelligence layer that maps Google Place types to internal classifications (primary category, operational status, market niche, discussion pillar, suggested tags). Pure computation engine with a full Google Place type catalog (100+ types) and editable mapping rules. Optional database persistence and admin seeding endpoint
- **Auth** -- Email/password authentication via Supabase with server-side route protection, proactive token refresh, and resilient session validation. Email confirmation callback endpoint
- **Responsive** -- Distinct mobile and desktop layouts: split map+list on desktop, collapsible map (80–55vh draggable range) on mobile. Inline filter chips, safe-area support for notched devices

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Framework    | SvelteKit 2                         |
| UI           | Svelte 5 (runes)                    |
| Styling      | Tailwind CSS v4                     |
| Database     | Supabase (PostgreSQL + Auth + RLS)  |
| Maps         | MapLibre GL + MapTiler              |
| Build        | Vite 7                              |
| Deployment   | Vercel                              |
| CSV Parsing  | PapaParse                           |
| External API | Google Places API (New)             |

## Project Structure

```
src/
├── app.css                        # Tailwind theme & global styles
├── app.html                       # HTML shell
├── app.d.ts                       # SvelteKit app types (Locals, PageData)
├── hooks.server.ts                # Supabase auth middleware
├── lib/
│   ├── index.ts                  # SvelteKit lib index
│   ├── supabase.ts                # Supabase client helpers
│   ├── csv-parser.ts              # Google Takeout CSV parsing
│   ├── google-places.ts           # Google Places API client
│   ├── google-place-types.ts      # Full Google Place type catalog (Table A + B)
│   ├── intel-tagging.ts           # Intel tagging engine (pure computation)
│   ├── intel-tag-mappings.ts      # Google type → internal classification mappings
│   ├── intel-tagging.verify.ts    # Verification tests for intel tagging
│   ├── tag-colors.ts              # Tag color palette & hash
│   ├── tag-order.ts               # Tag reorder persistence
│   ├── actions/
│   │   └── sortable.ts            # Drag-to-reorder Svelte action
│   ├── assets/
│   │   └── favicon.svg            # App favicon
│   ├── stores/
│   │   ├── places.svelte.ts       # Data-access helpers (load, tag ops)
│   │   ├── collections.svelte.ts  # Collection CRUD, membership & sharing helpers
│   │   ├── saved-views.svelte.ts  # Saved Views CRUD & filter snapshot
│   │   └── toasts.svelte.ts       # Toast notification store
│   ├── types/
│   │   └── database.ts            # Supabase type definitions (11 tables)
│   └── components/
│       ├── AddPlaceModal.svelte    # URL/CSV add place modal
│       ├── AddToCollectionModal.svelte # Add place to collection picker
│       ├── CollectionAvatar.svelte  # Ringed circle/emoji avatar for collections
│       ├── EmojiPicker.svelte       # Categorized emoji picker with search
│       ├── MapView.svelte          # MapLibre GL map with markers
│       ├── MobileMapShell.svelte   # Collapsible mobile map wrapper
│       ├── PlaceActionMenu.svelte  # Context menu for place actions in collections
│       ├── PlaceCard.svelte        # Grid card (flip, swipe, notes, rating, collections)
│       ├── PlaceListItem.svelte    # List row (expand, swipe, rating, collections)
│       ├── RatingDisplay.svelte    # Compact rating trigger (4.5 ★ / Not rated)
│       ├── RatingEditor.svelte     # Popover star scrubber (half-star drag)
│       ├── SavedViewsBar.svelte    # Saved Views preset pill bar
│       ├── TagContextMenu.svelte   # Right-click tag menu
│       ├── TagInput.svelte         # Inline tag add/remove
│       ├── TagManager.svelte       # Tag CRUD modal
│       └── TopBarTagAdd.svelte     # Top bar tag creation shortcut
└── routes/
    ├── +layout.svelte              # Root layout & nav
    ├── +layout.ts                  # Supabase client setup
    ├── +layout.server.ts           # Session & MapTiler key
    ├── +page.svelte                # Landing page
    ├── login/+page.svelte          # Auth page
    ├── auth/confirm/+server.ts     # Email confirmation callback
    ├── places/
    │   ├── +page.svelte            # Main places library + map
    │   └── +page.server.ts         # Server-side data preload
    ├── collections/
    │   ├── +page.svelte            # Collections index
    │   ├── +page.server.ts         # Collections list server load
    │   └── [id]/
    │       ├── +page.svelte        # Collection detail page
    │       └── +page.server.ts     # Collection detail server load
    ├── c/[slug]/
    │   ├── +page.svelte            # Public shared collection
    │   └── +page.server.ts         # Public collection server load
    ├── upload/+page.svelte         # CSV upload page
    └── api/
        ├── admin/
        │   └── intel-catalog/+server.ts  # Seed/refresh intel catalog tables
        └── places/
            ├── add-by-url/+server.ts     # URL import + dedup
            ├── [id]/
            │   ├── enrich/+server.ts     # Single place enrichment
            │   └── intel-tags/+server.ts # Intel tag computation per place
            └── enrich-all/+server.ts     # Batch enrichment (10 at a time)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A [Supabase](https://supabase.com/) project
- A [Google Places API](https://developers.google.com/maps/documentation/places/web-service) key (for enrichment)
- A [MapTiler](https://www.maptiler.com/) API key (for the map -- optional, falls back to demo tiles)

### 1. Install dependencies

```sh
npm install
```

### 2. Configure environment variables

Copy the example env file and fill in your credentials:

```sh
cp .env.example .env
```

```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
GOOGLE_PLACES_API_KEY=your-google-places-api-key-here
PUBLIC_MAPTILER_KEY=your-maptiler-api-key-here
```

| Variable | Required | Description |
| --- | --- | --- |
| `PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `GOOGLE_PLACES_API_KEY` | Yes | Server-side key for Google Places API (New) |
| `PUBLIC_MAPTILER_KEY` | No | MapTiler API key for the map. Without it, the map panel shows a setup prompt |

### 3. Set up the database

Run the SQL migrations in your Supabase project's SQL Editor, in order:

```
supabase/migration.sql
supabase/add_tag_order_index.sql
supabase/add_profiles_table.sql
supabase/add_saved_views.sql
supabase/add_collections_columns.sql
supabase/add_list_places_position.sql
supabase/add_intel_tag_system.sql
supabase/add_user_rating.sql
supabase/fix_rls_data_isolation.sql
supabase/add_emoji_column.sql
```

The first migration creates the `places`, `lists`, and `list_places` tables along with row-level security policies and indexes. The second adds the `order_index` column to `tags` for drag-to-reorder persistence. The third creates the `profiles` table with auto-sync triggers from Supabase Auth. The fourth creates the `saved_views` table for user-defined filter/sort/layout presets. The fifth extends `lists` with `visibility` and `share_slug` columns for collections sharing, plus public-access RLS policies. The sixth adds a `position` column to `list_places` for manual ordering within collections. The seventh creates the `google_place_type_catalog`, `intel_tag_mappings`, and `place_intel_tags` tables for the intel tagging system. The eighth adds `user_rating` and `user_rated_at` columns to `places` with a CHECK constraint enforcing 0.5–5.0 half-star values. The ninth enables RLS on the `tags` and `place_tags` tables and creates user-scoped CRUD policies plus read-only policies for shared collections. The tenth adds an optional `emoji` column to `lists` for collection icons.

You will also need to create the `tags` and `place_tags` tables (used by the tagging system but not yet in the migration file). The expected schema is defined in `src/lib/types/database.ts`.

### 4. Start the dev server

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Usage

1. **Sign up** with email/password on the login page
2. **Import places** via the navbar's "+ Add Place" button (paste a Google Maps URL or go to CSV upload), or paste a Google Maps URL directly into the search bar on the Places page and press Enter
3. **Enrich** imported places by clicking "Fetch Details" to pull ratings, addresses, coordinates, and category data from Google
4. **Rate** places by clicking the rating display on any card to open the star editor — drag or tap to set a 0.5–5.0 rating
5. **Tag** places with custom tags directly on each card or via the Tag Manager
6. **Filter** by clicking custom tag pills in the inline filter bar, or select a source filter
7. **Browse** on the map — click pins to see details, click cards to fly to their location
8. **Reorder tags** by dragging them in the filter bar (long-press on mobile)
9. **Create collections** to curate shareable groups of places — share via public link
10. **Save views** to bookmark your current filter/sort/layout as a named preset

## Scripts

| Command               | Description                  |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start development server     |
| `npm run build`       | Create production build      |
| `npm run preview`     | Preview production build     |
| `npm run check`       | Run type checking            |
| `npm run check:watch` | Type checking in watch mode  |

## Deployment

The project is configured for **Vercel** via `@sveltejs/adapter-vercel`. Push to your connected Git repository and Vercel will build and deploy automatically.

Set the following environment variables in your Vercel project settings:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_PLACES_API_KEY`
- `PUBLIC_MAPTILER_KEY`

## Documentation

- [IMPLEMENTATION.md](./IMPLEMENTATION.md) — Detailed documentation of architecture decisions, trade-offs, and bugs encountered during development.
- [UI-DESIGN.md](./UI-DESIGN.md) — Visual design specification covering color palettes, component anatomy, page layouts, responsive behavior, and interaction patterns.
- [PERFORMANCE-AUDIT.md](./PERFORMANCE-AUDIT.md) — Supabase query optimization audit documenting the elimination of sequential round-trips, unfiltered junction scans, and N+1 patterns across all server loads and stores.

## License

This project is private and not licensed for redistribution.
