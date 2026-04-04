# UI Design Specification

Detailed documentation of MapOrganizer's visual design system, page layouts, component anatomy, and interaction patterns.

---

## Table of Contents

- [Design System](#design-system)
- [Global Layout & Navigation](#global-layout--navigation)
- [Landing Page](#landing-page)
- [Login Page](#login-page)
- [Places Page (Main App)](#places-page-main-app)
- [Upload Page](#upload-page)
- [Collections Index](#collections-index)
- [Collection Detail Page](#collection-detail-page)
- [Public Shared Collection](#public-shared-collection)
- [Component Library](#component-library)
- [Responsive Behavior](#responsive-behavior)
- [Motion & Transitions](#motion--transitions)

---

## Design System

### Typography

**Primary font**: Nunito (Google Fonts), weights 400–800. Loaded via `<link>` tags in the root layout with `display=swap` for fast text rendering. Registered as `--font-sans` in the Tailwind theme.

**Scale** (standard Tailwind classes only — no arbitrary values):
- Hero title: `text-4xl`, `font-bold`
- Page titles: `text-xl`/`text-2xl`, `font-extrabold`
- Section headings: `text-base`/`text-lg`, `font-extrabold`
- Card titles: mobile `text-base`, desktop `text-lg`, `font-extrabold`
- Body text / notes: `text-sm`, `font-medium`
- Captions, metadata, micro labels: `text-xs`, `font-medium` or `font-bold`

Mobile (< sm) uses `text-xs` → `text-sm` → `text-base` for a clear 3-level hierarchy.
Desktop (sm+) adds `text-lg`, `text-xl`, `text-2xl` via responsive prefixes.

### Color Palettes

Three custom palettes defined in `app.css` via Tailwind v4's `@theme` block:

**Brand** — Warm browns and golds, used for primary actions, accents, ratings, active states:
| Token | Hex | Usage |
|---|---|---|
| `brand-50` | `#f9f6f1` | Subtle backgrounds |
| `brand-100` | `#f0ead9` | Icon backgrounds, hover states |
| `brand-200` | `#e2d6be` | Light borders |
| `brand-400` | `#bda87a` | Focus rings, selected borders |
| `brand-500` | `#a8935f` | Map markers, star ratings, primary accent |
| `brand-600` | `#917e4e` | Primary buttons, CTAs |
| `brand-700` | `#776841` | Button hover states |
| `brand-800` | `#5e5234` | Strong text accents |

**Sage** — Muted blue-grays, used for success states, area tags, secondary backgrounds:
| Token | Hex | Usage |
|---|---|---|
| `sage-50` | `#f2f1ef` | Success toast backgrounds |
| `sage-100` | `#e9e6e1` | Page background (`bg-sage-100`) |
| `sage-200` | `#d6d1ca` | Feature card icon backgrounds, shared badges |
| `sage-400` | `#7e95a6` | Muted accent, secondary icons |
| `sage-500` | `#637d8e` | Secondary text in steel-blue contexts |
| `sage-700` | `#3d5060` | Area tag text, success text |

**Warm** — Neutral taupes, used for text, borders, cards, and backgrounds:
| Token | Hex | Usage |
|---|---|---|
| `warm-50` | `#faf9f7` | Card backgrounds, nav bar, inputs |
| `warm-100` | `#f3efe8` | Hover backgrounds, pill backgrounds |
| `warm-200` | `#e8e1d4` | Borders, dividers |
| `warm-300` | `#d5cab8` | Dashed borders, placeholder-ish elements |
| `warm-400` | `#b5a892` | Secondary text, metadata |
| `warm-500` | `#978a74` | Body text, descriptions |
| `warm-600` | `#7a6e5a` | Input text, interactive text |
| `warm-700` | `#5a5042` | Strong secondary text |
| `warm-800` | `#3b332a` | Primary text, headings |

### Tag Color Palette

User-created tags receive deterministic colors via a djb2 hash of the tag name, mapping to a curated 6-color muted palette. Users can override colors via the tag manager or context menu.

| Color | Hex | Name |
|---|---|---|
| Warm gold | `#A5834F` | muted gold / ochre |
| Stone gray | `#8C8B82` | stone sage / warm grey |
| Slate blue | `#7489A6` | slate blue / dusty denim |
| Terracotta | `#936756` | terracotta / clay |
| Teal | `#5B7D8A` | muted teal / deep sea |
| Purple | `#6A6196` | dusty purple / slate lavender |

System tags use fixed colors:
- **Category tags**: Gray (`#6b7280`)
- **Area tags**: Blue (`#3b82f6`)

### Collection Color Palette

Collections use the same 6-color muted palette as user tags:
- `#A5834F` (warm gold)
- `#8C8B82` (stone gray)
- `#7489A6` (slate blue)
- `#936756` (terracotta)
- `#5B7D8A` (teal)
- `#6A6196` (muted purple)

### Corner Radii

- **Cards & modals**: `rounded-xl` (12px) on mobile, `rounded-2xl` (16px) on desktop
- **Buttons**: `rounded-lg` (8px) for standard, `rounded-xl` (12px) for prominent CTAs
- **Inputs**: `rounded-lg` (8px)
- **Tags/pills**: `rounded-full` (fully rounded)
- **Map container**: `rounded-xl`/`rounded-2xl`

### Shadows

- **Cards on hover**: `shadow-md shadow-warm-200/50`
- **Toasts**: `shadow-lg` with `backdrop-blur-sm`
- **Map markers**: `drop-shadow(0 2px 3px rgba(0,0,0,0.18))`, stronger on selected
- **Popups**: `shadow: 0 4px 16px rgba(0,0,0,0.1)`

### Iconography

All icons are inline SVGs (no icon library dependency), using `stroke="currentColor"` with `stroke-width="2"` for consistency. Common sizes:
- Navigation: `h-5 w-5` / `h-6 w-6`
- Buttons: `h-3.5 w-3.5` / `h-4 w-4`
- Inline/metadata: `h-3 w-3` / `h-2.5 w-2.5`

---

## Global Layout & Navigation

### Page Shell

The entire app is wrapped in a `min-h-[100dvh] bg-sage-100 font-sans` container, giving every page the warm sage background.

### Navigation Bar

A sticky top bar (`sticky top-0 z-30`) with a frosted-glass effect:
- **Background**: `bg-warm-50/85 backdrop-blur-lg` — semi-transparent warm white with blur
- **Border**: `border-b border-warm-200/60` — subtle divider
- **Height**: `h-12` (48px) on mobile, `sm:h-14` (56px) on desktop
- **Max width**: `max-w-[1400px]` centered with `mx-auto`

**Left side**: App logo (map pin SVG in `brand-600`) + "MapOrganizer" text in `font-extrabold`. Links to `/places` when authenticated, `/` when not.

**Right side** (authenticated only):
- "Places" link — `text-warm-600`, `hover:bg-warm-100`
- "Collections" link — same style
- "+ Add Place" button — `bg-brand-600` pill with plus icon; text hidden on mobile (`hidden sm:inline`), icon-only on small screens
- "Sign out" — subtle `text-warm-400` button

### Add Place Modal (Global)

A single `AddPlaceModal` instance lives in the root layout, triggered by the nav's "+ Add Place" button. Two tabs:
- **Paste URL**: Text input with loading/success/error state machine
- **Upload CSV**: Link to the `/upload` page

The modal uses a dark backdrop (`bg-black/40 backdrop-blur-sm`) and appears near the top of the viewport (`pt-[12vh]`), centered horizontally.

---

## Landing Page

**Route**: `/`

A centered marketing page with vertically stacked content:

1. **Hero icon**: Map pin SVG inside a `rounded-2xl bg-brand-100 p-5` container
2. **Headline**: "Your places, organized" in `text-4xl font-bold text-warm-800`
3. **Subtitle**: Descriptive paragraph in `text-lg text-warm-500`, max-width `max-w-md`
4. **CTA buttons** (conditional on auth state):
   - Authenticated: "Open My Places" (brand-600 filled) + "Upload CSV" (warm-50 outlined)
   - Unauthenticated: "Get Started" (brand-600 filled) + "Sign In" (warm-50 outlined)
5. **Feature cards**: 3-column grid (`sm:grid-cols-3`) with:
   - **Import**: Upload icon in sage-200 circle, title + description
   - **Tag**: Tag icon in brand-100 circle, title + description
   - **Find**: Search icon in sage-200 circle, title + description

Each card uses `rounded-xl border border-warm-200 bg-warm-50 p-5`.

---

## Login Page

**Route**: `/login`

Centered form layout (`min-h-[70vh]`, `max-w-sm`):

1. **Header**: Map pin icon in `rounded-2xl bg-brand-100`, dynamic title ("Welcome back" / "Create your account"), subtitle
2. **Error/message banners**: Red (`bg-red-50`) for errors, sage (`bg-sage-100`) for success messages
3. **Form fields**: Email and password inputs with `rounded-lg border-warm-200 bg-warm-50` styling, brand-500 focus ring
4. **Submit button**: Full-width `bg-brand-600` with loading state ("Processing...")
5. **Toggle**: "Don't have an account? Sign up" / "Already have an account? Sign in" — text with `brand-600` link

---

## Places Page (Main App)

**Route**: `/places`

The primary app screen. The most complex layout with a split map+list view.

### Desktop Layout (lg+)

A `flex flex-row` container:
- **Left panel** (58%): Scrollable content area with filters, search, and place grid/list
- **Right panel** (42%): Sticky `MapView` pinned at `top: 3.5rem` (below nav), full viewport height minus nav

### Mobile Layout (< lg)

A vertical stack with `overflow: hidden` on the outer container:
- **Top**: `MobileMapShell` wrapping `MapView` — draggable (128px default, 55vh expanded, 80px minimum) with a drag handle for pointer-drag resizing
- **Bottom**: Scrollable content panel (`flex-1 min-h-0 overflow-y-auto`)

### Content Area Anatomy (Top to Bottom)

#### 1. Saved Views Bar
A horizontal row of pill-shaped buttons between the top of the content and the filter chips:
- Each pill: bookmark icon + view name, `rounded-full` with border
- Active view: `border-brand-400 bg-brand-50 text-brand-700` with ring
- Inactive: `border-warm-200 text-warm-500`
- "+ Save View" button: dashed border, shows "+" icon on mobile, "Save View" text on `sm+`
- Three-dot menu on each pill opens rename/delete dropdown (fixed positioned)
- Horizontally scrollable on mobile with hidden scrollbars

#### 2. Active Filter Summary
A `min-h-[28px]` (mobile) / `min-h-[32px]` (desktop) row showing:
- "Filtered by:" label in `text-warm-400`
- **AND/OR toggle** (shown when 2+ custom tags selected): Segmented control with "and"/"or" buttons in `rounded-full border-warm-200`. Active segment: `bg-warm-700 text-white`. Inactive: `bg-white text-warm-400`
- Active tag pills (colored, with × dismiss)
- Active source filter pill (warm-200, with × dismiss)
- "Clear" button to reset all

#### 3. Contextual Capture Banner
Shown when a Google Maps URL is detected in search AND custom tags are active:
- `bg-brand-50/60 border-brand-200/60 rounded-lg`
- "Adding into: Tag1 + Tag2" with auto-tag ON/OFF toggle
- Amber/green indicator pill

#### 4. Enrichment Banner
Shown when unenriched places exist:
- `border-amber-200 bg-amber-50 rounded-lg`
- "{N} missing details" text + "Fetch Details" button (`bg-amber-600`)

#### 5. Tag Filter Rows

**Mobile (< md)**: Single horizontally scrollable row of all custom tag pills. Tags support drag-to-reorder via long-press (500ms). A "+ Manage" dashed button at the end opens TagManager.

**Desktop (md+)**: Labeled row with "Custom" label (64px wide) + tag pills. Tags support click-drag reorder (400ms long-press). A "+" dashed button opens TagManager.
Tag pills: `rounded-full`, colored background, bold text. Selected state adds `ring-2 ring-offset-1 shadow-sm`. Unselected state at `opacity-80`, hover at full opacity.

#### 6. Collection Scope Banner
Shown when browsing a specific collection:
- Brand-tinted banner with folder icon, collection name, "+ Add places" and "Show all" buttons

#### 7. Search + Sort + View Controls Row
A compact row with:
- **Place count**: `text-xs font-semibold text-warm-500`
- **Search input**: `rounded-lg`/`rounded-xl` with search icon, clear button. Doubles as URL input — detects Google Maps URLs and shows "Enter to add" hint
- **Sort dropdown**: `<select>` with options: Recent, Oldest, A–Z, Z–A, Rating, Most tagged, Tag group
- **View toggle**: Segmented control with grid/list icons, `rounded-md border-warm-200 bg-white`

#### 8. Place Grid / Place List
- **Grid**: `grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4` of PlaceCard components
- **List**: Single `rounded-2xl border bg-white` container with PlaceListItem rows divided by `divide-y divide-warm-100`
- **Empty state**: Map pin icon in warm-300, message text, link to upload page

### Map Panel

**MapView** renders a MapLibre GL map with MapTiler "pastel" style tiles:
- Custom SVG pin markers in `brand-500` (warm gold)
- Hover: scale to 115%, darken to `brand-600`
- Selected: scale to 135%, darken to `brand-700`, stronger shadow, `z-index: 20`
- Popups: `rounded-xl` white card with Nunito font, warm-200 border, place title + category + personal rating
- Info badge at bottom shows "N on map · M without coordinates"

**MobileMapShell** (mobile only):
- Collapsed: 128px height (minimum 80px), compact preview, attribution faded
- Expanded: 55vh height, full interactivity
- Drag handle: pointer-drag resizable with snap thresholds (collapses below 100px, expands above)

---

## Upload Page

**Route**: `/upload`

Centered layout (`max-w-2xl`):

1. **Header**: "Upload Google Maps Places" title with link to Google Takeout
2. **Drop zone**: `rounded-2xl border-2 border-dashed p-10` — upload icon, "Drag & drop CSV files here" text, hidden file input overlay. Drag-over state: `border-brand-400 bg-brand-50`
3. **Parse results**: Per-file cards (`rounded-2xl border-warm-200 bg-warm-50 p-5`) showing filename, place count, scrollable place list, and parse warnings
4. **Import button**: Full-width `rounded-xl bg-brand-600` with spinner during upload
5. **Upload result**: Success card (`rounded-2xl border-sage-300 bg-sage-100 p-5`) with checkmark icon, count summary, "View your places" and "Upload more" buttons

---

## Collections Index

**Route**: `/collections`

Centered layout (`max-w-3xl`):

### Header
- Title: "Collections" with subtitle "Curated groups of your saved places"
- "New Collection" button: `bg-brand-600` with plus icon

### Create Form (expandable)
A `rounded-2xl border-warm-200 bg-white` card with:
- **Name input**: Text field with placeholder "e.g. Weekend Brunch Spots"
- **Color picker**: Row of 6 color circles, selected state gets `ring-2 ring-offset-1 ring-warm-400 scale-110`
- **Emoji picker**: Categorized picker with ~794 emojis across 8 categories (Food & Drink, Travel & Places, Activities, Nature, Objects, Smileys, Symbols, Flags), category tab navigation, text search, and a "--" no-icon option. Selected state: `ring-2 ring-warm-400 bg-warm-100 scale-110`. Scrollable grid (max-height 200px)
- **Actions**: "Create" button (brand-600) + "Cancel" text button

### Collection Cards Grid
`grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4`

Each card is an `<a>` to `/collections/[id]`:
- **Top row**: Visibility badge ("Shared" in `sage-200`), date, hover-reveal action buttons (color picker, delete)
- **Icon + Name**: Color circle (or emoji in ringed circle) + truncated collection name in `font-extrabold`
- **Description**: Optional, 2-line clamp
- **Footer**: Place count pill in `bg-warm-100`
- **Hover**: `shadow-md shadow-warm-200/50`
- **Delete**: Inline confirm/cancel (no separate modal)
- **Swipe-to-delete (mobile)**: Same left-swipe pattern as PlaceCard/PlaceListItem — swipe left to reveal red delete button (72px, snap threshold 36px), with inline confirm step
- **Color/emoji picker**: Dropdown appears below the palette button, positioned absolutely

### Empty State
Centered icon + "No collections yet" + "Create your first collection" link

---

## Collection Detail Page

**Route**: `/collections/[id]`

### Sticky Header Panel
Sticks below the nav (`sticky top-12 sm:top-14 z-10`), sage-tinted background (`bg-[#faf7f2]`):

1. **Breadcrumb**: "Collections > {name}" trail
2. **Header row**:
   - **Left**: Clickable color circle/emoji (opens color+emoji picker), click-to-edit name (`font-extrabold`), click-to-edit description
   - **Right**: Copy link button (when shared), Private/Shared toggle, "+ Add Places" button (brand-600)
3. **Collapsible map**: Expandable panel with MapView inside `rounded-xl border`, toggle button showing place count + chevron. Map height: 180px mobile, 220px desktop
4. **Controls bar**: Place count, search input, sort dropdown (Recent, A–Z, My Rating), grid/list toggle

### Content Area
Same PlaceCard/PlaceListItem rendering as the places page, but:
- Delete action removes from collection (not permanent delete)
- No enrichment or tag management controls
- Same grid (1-2 columns) / list layout

### Add Places Modal
Bottom-sheet on mobile, centered on desktop:
- Search input for filtering user's places
- Tag filter pills (user tags only, AND logic) for narrowing results — toggleable colored pills that filter `nonMemberPlaces` by tag intersection
- Scrollable list of non-member places with "+" add button, title, area, category, tags preview, rating
- Clicking adds immediately with toast feedback

---

## Public Shared Collection

**Route**: `/c/[slug]`

Read-only page accessible without authentication. Sticky top panel layout (`max-w-4xl`):

### Header
- Left-aligned `CollectionAvatar` (lg size: `h-8 w-8`/`sm:h-9 sm:w-9`) alongside collection name and description inline
- Collection name in `text-base`/`sm:text-lg font-extrabold`
- Optional description below name (`text-xs`/`sm:text-sm text-warm-400`)

### Collapsible Map
Same toggle pattern as collection detail — expandable MapView with place markers. Height: 180px mobile, 220px desktop.

### Controls
- Search input (searches title, address, category, area)
- Grid/list view toggle
- Place count shown in controls bar

### Place Cards (Grid)
Simplified read-only cards:
- Category pill (`bg-warm-200`), area pill (`bg-sage-200`), price level
- Rating display (owner's personal rating, display-only)
- Title, note preview (2-line clamp, italic `text-brand-500`)
- Footer: "Maps" external link (no Website link)

### Place List (List)
Compact rows with title, area/category metadata, rating, Maps link.

### Footer
"Shared via MapOrganizer" branding with link to home page.

---

## Component Library

### PlaceCard

A 3D-flipping card with front (info) and back (notes):

**Front face**:
- **Header row**: Category pill, area pill, price level (left); personal rating display (right)
- **Title**: `font-extrabold`, 1-line clamp
- **Description**: 2-line clamp, warm-400 text
- **Tags section**: Inline colored tag pills + TagInput for adding new tags
- **Action row**: Maps link, Website link, Enrich button, Collection picker, Delete — all with hover-reveal on desktop, always visible on mobile
- **Rating**: Compact `RatingDisplay` button ("4.5 ★" / "Not rated")

**Back face** (notes):
- Full-height textarea with auto-save (800ms debounce)
- "Back" button to flip to front

**Interactions**:
- Click dead space to flip (3D `rotateY(180deg)`, `perspective: 800px`/`1000px`)
- Swipe left on mobile to reveal red delete button (72px, snap threshold 36px)
- Selected state: `ring-2 ring-brand-400/30 border-brand-400`
- Swipe-aware: tapping swiped-open card dismisses swipe, doesn't flip

### PlaceListItem

Compact expandable row:
- **Collapsed**: Title, category/area metadata, tag preview, rating, action icons
- **Expanded**: Full details + TagInput + notes
- **Swipe**: Same left-swipe-to-delete pattern as PlaceCard
- **Selected**: `bg-brand-50` background

### RatingDisplay + RatingEditor

**RatingDisplay**: Compact button showing `"4.5 ★"` (amber star) or `"Not rated"` (warm-400). Click opens RatingEditor.

**RatingEditor**: Popover teleported to `document.body`:
- Invisible full-screen backdrop (z-9998)
- White card (z-9999) with 5 star SVGs (28px each, 2px gaps)
- **Interaction modes**: Tap star half, click position, or drag across row
- Half-star precision: pointer position → 0.5-step snap
- Star rendering: Full amber / half amber + half warm-gray / full warm-gray via SVG clip paths
- "Clear" button to remove rating
- Numeric value label

### TagInput

Inline tag addition on place cards/list items:
- Small "+" trigger that expands to text input
- Portal-based dropdown (appended to `document.body`) positioned via `getBoundingClientRect()`
- Suggestions filtered from existing tags
- "Create [name]" option when no exact match
- Auto-title-case for all-lowercase input
- 150ms blur delay to handle click/blur race condition

### TagManager

Full-screen modal for managing user tags:
- Sortable tag list (drag-and-drop reorder)
- Per-tag: color dot (clickable → inline palette), name (clickable → inline rename input), delete button (→ inline confirm)
- Uses same `sortable` action as filter bar tags

### TagContextMenu

Right-click menu on tags:
- Rename, Recolor (opens palette), Delete options
- Positioned at cursor, clamped to viewport edges
- Dismisses on click-outside or Escape

### TopBarTagAdd

Compact creation widget in filter bar:
- Dashed-border "+ Add" pill → expands to inline input
- Portal dropdown for suggestions
- Auto-assigns color via `colorForTag()` hash
- Auto-assigns `order_index` via `getNextOrderIndex()`

### SavedViewsBar

Horizontal pill row for saved view presets:
- Pill per view: bookmark icon + name
- Active: `border-brand-400 bg-brand-50 text-brand-700 ring-1`
- Edit mode: pill turns amber, pencil icon replaces bookmark, Save/Cancel buttons appear
- Create: dashed-border trigger → inline name input
- Three-dot menu: Rename, Delete, Edit View, New Collection, Add to Collection — fixed-positioned dropdown (desktop) or bottom sheet (mobile)
- Click to apply, click active to deactivate (clears filters)

### AddPlaceModal

Two-tab modal (URL paste / CSV upload):
- URL tab: Input field + state machine (idle → loading → success/duplicate/error)
- CSV tab: Link to `/upload` page
- Dark backdrop + centered card / bottom-sheet

### AddToCollectionModal

Collection picker modal supporting single-place and batch modes:
- Header: "Add to Collection" title + contextual label (place title or "N places from View Name")
- List of all collections with:
  - `CollectionAvatar` (emoji/color icon, or checkmark when all places already added)
  - Collection name and place count
  - "All added" badge (sage-600) when all places are members
  - "N already in" label (warm-400) for partial batch membership
- Instant add/remove on click with toast feedback
- Empty state links to `/collections`
- Bottom-sheet on mobile (`items-end`, `rounded-t-2xl`), centered on desktop

### CollectionAvatar

Ringed circle avatar for collections:
- Displays emoji character or accent-color dot
- 5 size variants: `xs` (28×28), `sm` (36×36), `md` (40×40), `lg` (32×32 → sm:36×36, responsive), `xl` (44×44 → sm:56×56, responsive)
- Ring border via inset `box-shadow` in accent color; emoji centered within ring; color dot fills the circle interior
- Used in collection cards, `AddToCollectionModal`, and collection detail headers

### EmojiPicker

Categorized emoji picker with search:
- ~794 emojis across 8 categories: Food & Drink, Travel & Places, Activities, Nature, Objects, Smileys, Symbols, Flags
- Category tab navigation at top
- Text search input for filtering across all categories
- "No icon" option to clear selection
- Scrollable grid container (max-height 200px)
- Selected emoji: `ring-2 ring-warm-400 bg-warm-100 scale-110`
- Used in collection create/edit forms

### PlaceActionMenu

Context menu for place actions in collection view:
- Two options: "Remove from collection" and "Delete place permanently"
- Mobile: bottom sheet with `rounded-t-2xl`
- Desktop: positioned dropdown menu
- Red destructive styling for delete action
- Used on collection detail page (`/collections/[id]`)

### MapView

MapLibre GL JS map component:
- Dynamic import (avoids SSR issues)
- MapTiler "pastel" style tiles
- Custom SVG pin markers with hover/selected states
- Popups with warm styling (Nunito, rounded-xl, warm-200 border)
- Geolocate control: custom styled white rounded button (`border-radius: 8px`, `box-shadow`). Default icon: warm-700 crosshair. Active icon: brand-500 crosshair. User location dot: brand-500 fill with brand-400 30% ring
- Bidirectional selection sync with card list
- `mapMode` prop: `'collapsed'` / `'expanded'` / `'default'`
- `ResizeObserver` for container sync

### MobileMapShell

Collapsible wrapper for MapView on mobile:
- Two states: collapsed (128px, min 80px) / expanded (55vh)
- Drag handle supports pointer-drag resizing with snap thresholds
- Passes `mapMode` to MapView for behavior adjustments

### Toast System

Fixed bottom-center stack:
- Position: `fixed bottom-6 left-1/2 -translate-x-1/2`
- Types with colors:
  - **Success**: `bg-sage-50/95 border-sage-200/60 text-sage-800` + checkmark icon
  - **Duplicate**: `bg-amber-50/95 border-amber-200/60 text-amber-800` + warning icon
  - **Error**: `bg-red-50/95 border-red-200/60 text-red-700` + × icon
  - **Info**: `bg-blue-50/95 border-blue-200/60 text-blue-800` + info icon
- Animation: `toast-in` keyframe (opacity 0→1, translateY 8→0, scale 0.96→1, 250ms)
- Auto-dismiss: success/duplicate 2500ms, error 4000ms, with-actions 5000ms
- Optional action buttons with `|` separator

---

## Responsive Behavior

### Breakpoints

| Breakpoint | Width | Key changes |
|---|---|---|
| Default | < 640px | Mobile-first: compact spacing, single column, swipe gestures |
| `sm` (640px) | ≥ 640px | Larger padding, 2-column grids, text size bumps |
| `md` (768px) | ≥ 768px | Desktop tag filter rows replace mobile scroll strip |
| `lg` (1024px) | ≥ 1024px | Split map+list layout replaces stacked mobile layout |

### Mobile-Specific UI
- `MobileMapShell` with collapsible map
- Swipe-to-delete on PlaceCard, PlaceListItem, and collection cards
- Horizontal-scroll tag filter strip
- Bottom-sheet modals (`items-end`, `rounded-t-2xl`)
- Nav "+ Add Place" icon-only (no text)
- Safe area inset support (`env(safe-area-inset-*)`)
- `touch-action: manipulation` on interactive elements
- `-webkit-tap-highlight-color: transparent`

### Desktop-Specific UI
- Sticky right map panel (42% width)
- Hover-reveal action buttons on cards/list items
- Labeled tag filter rows ("Custom" label)
- Click-drag tag reordering (no long-press needed)
- Centered modals
- Three-dot menus on saved view pills
- Full nav bar text

---

## Motion & Transitions

### Card Flip
- `perspective: 800px` (mobile) / `1000px` (desktop)
- `transform: rotateY(180deg)` toggle
- `backface-visibility: hidden` on both faces
- `transition-duration: 0.5s`

### Swipe to Delete
- `transform: translateX()` on touch drag
- Clamped to `[-72px, 0]`
- Snap threshold: 36px
- Gesture locking (> 5px movement determines axis)

### Tag Drag-and-Drop
- Ghost element: `position: fixed`, `z-index: 9999`, `scale(1.06)`, box shadow
- Original element: `opacity: 0.3` during drag
- 40px edge zones trigger auto-scroll
- Mouse: immediate click-drag with 9px threshold
- Touch: 400ms (desktop) / 500ms (mobile places page) long-press to initiate

### Map Markers
- Hover: `scale(1.15)`, 200ms ease
- Selected: `scale(1.35)`, stronger shadow
- `transform-origin: bottom center`

### Map Panel (Mobile)
- Height transition: pointer-drag resizable between 80px minimum and 55vh expanded, with snap thresholds

### Toast Entry
- `@keyframes toast-in`: `opacity: 0 → 1`, `translateY(8px) → 0`, `scale(0.96) → 1`, 250ms ease-out

### Buttons & Controls
- All interactive elements: `transition-colors` (150ms default)
- Color picker circles: `hover:scale-110`, selected `scale-110`
- Focus rings: `ring-2 ring-brand-500/20` or `ring-brand-400/20`
