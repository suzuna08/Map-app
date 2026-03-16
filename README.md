# MapOrganizer

Your places, organized. Import saved places from Google Maps, tag them, and find what you need.

## About

MapOrganizer is a web app that helps you manage and organize places you've saved in Google Maps. Import your saved places via Google Takeout CSV export or by pasting Google Maps URLs, then tag, search, filter, and sort them however you like.

## Features

- **CSV Import** -- Bulk-import saved places from a Google Takeout CSV export
- **URL Import** -- Add individual places by pasting a Google Maps URL
- **Place Enrichment** -- Automatically fetch ratings, addresses, phone numbers, and more from the Google Places API (single or batch)
- **Flexible Tagging** -- Organize places with category, area, and custom tags, each with color coding
- **Search & Filter** -- Find places by name, tags, area, description, or source list
- **Sorting** -- Sort by newest, oldest, A-Z, Z-A, rating, most tagged, or tag group
- **Grid & List Views** -- Switch between card grid and compact list layouts
- **Deduplication** -- Automatically detects duplicates by URL, place ID, or title + address
- **Auth** -- Email/password authentication via Supabase
- **Responsive** -- Mobile-friendly with sidebar navigation and safe-area support

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Framework    | SvelteKit 2                         |
| UI           | Svelte 5 (runes)                    |
| Styling      | Tailwind CSS v4                     |
| Database     | Supabase (PostgreSQL + Auth + RLS)  |
| Build        | Vite 7                              |
| Deployment   | Vercel                              |
| CSV Parsing  | PapaParse                           |
| External API | Google Places API (New)             |

## Project Structure

```
src/
├── app.css                     # Tailwind theme & global styles
├── app.html                    # HTML shell
├── hooks.server.ts             # Supabase auth middleware
├── lib/
│   ├── supabase.ts             # Supabase client helpers
│   ├── csv-parser.ts           # Google Takeout CSV parsing
│   ├── google-places.ts        # Google Places API client
│   ├── tag-colors.ts           # Tag color palette
│   ├── tag-utils.ts            # System tag upsert logic
│   ├── types/
│   │   └── database.ts         # Supabase type definitions
│   └── components/
│       ├── AddPlaceModal.svelte
│       ├── PlaceCard.svelte
│       ├── PlaceListItem.svelte
│       ├── TagContextMenu.svelte
│       ├── TagInput.svelte
│       ├── TagManager.svelte
│       └── TagSidebar.svelte
└── routes/
    ├── +page.svelte             # Landing page
    ├── login/+page.svelte       # Auth page
    ├── places/+page.svelte      # Main places library
    ├── upload/+page.svelte      # CSV upload page
    └── api/places/
        ├── add-by-url/+server.ts
        ├── [id]/enrich/+server.ts
        └── enrich-all/+server.ts
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A [Supabase](https://supabase.com/) project
- A [Google Places API](https://developers.google.com/maps/documentation/places/web-service) key

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
```

### 3. Set up the database

Run the SQL migration in your Supabase project's SQL Editor:

```sh
# File: supabase/migration.sql
```

This creates the `places`, `lists`, and `list_places` tables along with row-level security policies and indexes.

### 4. Start the dev server

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Scripts

| Command             | Description                  |
| ------------------- | ---------------------------- |
| `npm run dev`       | Start development server     |
| `npm run build`     | Create production build      |
| `npm run preview`   | Preview production build     |
| `npm run check`     | Run type checking             |
| `npm run check:watch` | Type checking in watch mode |

## Deployment

The project is configured for **Vercel** via `@sveltejs/adapter-vercel`. Push to your connected Git repository and Vercel will build and deploy automatically. Make sure to set the environment variables in your Vercel project settings.

## License

This project is private and not licensed for redistribution.
