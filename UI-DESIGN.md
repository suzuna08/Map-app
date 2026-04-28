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
- [Settings Page](#settings-page)
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

Four custom palettes defined in `app.css` via Tailwind v4's `@theme` block:

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
| `sage-200` | `#d6d1ca` | Feature card icon backgrounds, secondary UI |
| `sage-400` | `#7e95a6` | Muted accent, secondary icons |
| `sage-500` | `#637d8e` | Secondary text in steel-blue contexts |
| `sage-700` | `#3d5060` | Area tag text, success text |

**Warm** — Neutral taupes, used for text, borders, cards, and backgrounds:
| Token | Hex | Usage |
|---|---|---|
| `warm-50` | `#faf9f7` | Card backgrounds, bottom dock, inputs |
| `warm-100` | `#f3efe8` | Hover backgrounds, pill backgrounds |
| `warm-200` | `#e8e1d4` | Borders, dividers |
| `warm-300` | `#d5cab8` | Dashed borders, placeholder-ish elements |
| `warm-400` | `#b5a892` | Secondary text, metadata |
| `warm-500` | `#978a74` | Body text, descriptions |
| `warm-600` | `#7a6e5a` | Input text, interactive text |
| `warm-700` | `#5a5042` | Strong secondary text |
| `warm-800` | `#3b332a` | Primary text, headings |

**Danger** — Muted warm terracotta reds, used for destructive actions (swipe-to-delete backgrounds, confirm buttons):
| Token | Hex | Usage |
|---|---|---|
| `danger-50` | `#f4eceb` | Light destructive backgrounds |
| `danger-100` | `#e8d6d4` | Destructive hover states |
| `danger-200` | `#d4b5b2` | Destructive borders |
| `danger-500` | `#9a5f5b` | Swipe-delete background, destructive accent |
| `danger-600` | `#7f4844` | Confirm-delete buttons |
| `danger-700` | `#6a3b38` | Destructive hover |
| `danger-800` | `#56302d` | Strong destructive accent |

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

### Navigation Bar → Bottom Dock

The former sticky top nav bar has been replaced by a floating bottom dock (`AppBottomDock.svelte`) with **three rendering modes** depending on screen size and user customization:

#### Desktop Bottom Bar (default, ≥ 640px, no custom position)
- **Position**: `fixed inset-x-0 bottom-0 z-50`, centered with `justify-center`, safe-area padding via `pb-[max(0.75rem,env(safe-area-inset-bottom))]`
- **Container**: `rounded-[1.25rem] border border-warm-200/80 bg-warm-50/95 backdrop-blur-lg shadow-lg shadow-warm-900/10` — frosted-glass pill with `max-w-lg`
- **Tabs**: Places (map pin), Collections (grid), Settings (gear) — each tab is `min-h-[2.5rem] w-[4.5rem]` / `sm:w-[5rem]` with icon + label (`text-[9px]` / `sm:text-[10px]`)
- **Active tab**: `bg-brand-100 text-brand-800`
- **Idle tab**: `text-warm-500 hover:bg-warm-100 hover:text-warm-700`
- **Drag handle**: 6-dot grip on the left side. Dragging repositions the dock freely; position persisted to localStorage. A reset button (↻ icon) on the right restores the dock to the bottom
- **Scroll-aware passive mode**: `pointerenter` on the pill immediately restores active mode

#### Custom-Positioned Draggable (any screen, after user drags)
When the user drags the dock via the grip handle, it becomes a freely-positioned `fixed` pill at the exact `left/top` coordinates. The position is clamped to stay within 8px of viewport edges and persisted in localStorage (`dock-position`). A reset button (↻ icon) clears the custom position and returns to the default bottom bar

#### Mobile Collapsible Right-Edge Drawer (< 640px, no custom position)
- **Expanded**: Vertical `flex-col` dock sliding in from the right edge (`transform: translateX(0/100%)`, 250ms ease-out). Contains a vertical drag handle, collapse chevron, and 3 nav links stacked vertically (`3.5rem` wide, `2.75rem` min-height each). Active state uses CSS classes `mobile-dock-link-active` (`bg-brand-100 text-brand-800`); idle uses `mobile-dock-link-idle`. Padded for `env(safe-area-inset-right)`
- **Collapsed**: Slim hint tab fixed on the right edge (`rounded-l-xl`, brand-50 background, warm-200 border). Shows a chevron icon and map pin icon. Tapping expands the dock
- **Vertical drag**: Both collapsed and expanded states support vertical repositioning via pointer drag. Position defaults to 65% of viewport height, clamped to 60px from top/bottom edges, persisted in localStorage (`dock-mobile-y`)
- **Tap-outside-to-close**: A document click listener collapses the expanded dock when tapping outside
- **First-visit hint**: On first load (if `dock-hint-seen` not in localStorage and `prefers-reduced-motion` is not set), a subtle nudge animation shifts the expanded dock 10px right and back after 1.2s, then stores the flag. Respects `prefers-reduced-motion: reduce`

The dock is shown only when authenticated and on an app-shell route (`/places`, `/collections`, `/upload`, `/settings`). A `bottomDockSuppressed` store allows modals to temporarily hide the dock. The root layout sets a `--app-dock-reserve` CSS variable so page content pads above the dock (automatically `0px` on mobile where the dock is on the right edge). A scroll-aware `dock-scroll-state` store transitions the desktop bottom dock between active (full opacity) and passive (45% opacity, translated 10px down) modes based on scroll direction.

Adding places is handled by the search bar on the Places page, which detects Google Maps URLs inline.

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
   - **Import**: Upload icon in sage-200 `rounded-lg` square, title + description
   - **Tag**: Tag icon in brand-100 `rounded-lg` square, title + description
   - **Find**: Search icon in sage-200 `rounded-lg` square, title + description

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
- **Right panel** (42%): Sticky `MapView` pinned at `top: 0` with `h-[100dvh]`, full viewport height

### Mobile Layout (< lg)

A vertical stack with `overflow: hidden` on the outer container (`h-[100dvh]`):
- **Top**: Search, contextual capture, and saved views bar in a fixed panel (`shrink-0`)
- **Middle**: `MobileMapShell` wrapping `MapView` — draggable (128px default, 55vh expanded, 80px minimum) with a drag handle for pointer-drag resizing
- **Bottom**: Scrollable content panel (`flex-1 min-h-0 overflow-y-auto`) with bottom padding for the dock (`--app-dock-reserve`)

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
- `bg-brand-50/80 border-brand-200/60 rounded-lg`
- "Adding into: Tag1 + Tag2" with auto-tag ON/OFF toggle
- Amber/green indicator pill

#### 4. Enrichment Banner
Shown when unenriched places exist:
- `border-amber-200 bg-amber-50 rounded-lg`
- "{N} missing details" text + "Fetch Details" button (`bg-amber-600`)

#### 5. Tag Filter Rows

**Mobile (< lg)**: Wrapping row of all custom tag pills. Tags support drag-to-reorder via long-press (500ms). A "+ Edit" dashed button at the end opens TagManager as an inline popover dropdown (absolute-positioned, `w-72`, `rounded-xl border-warm-200 bg-warm-50 shadow-lg`). A fixed backdrop dismisses the popover on tap-outside.

**Desktop (lg+)**: Labeled row with "Tags" label + tag pills. Tags support click-drag reorder (400ms long-press). A "+" dashed button opens TagManager as an inline popover dropdown (same styling as mobile).
Tag pills: `rounded-full`, colored background, bold text. Selected state adds `ring-2 ring-offset-1 shadow-sm`. Unselected state at `opacity-80`, hover at full opacity.

#### 6. Collection Scope Banner
Shown when browsing a specific collection:
- Brand-tinted banner with folder icon, collection name, "+ Add places" and "Show all" buttons

#### 7. Search + Sort + View Controls Row
A compact row with:
- **Place count**: `text-xs font-semibold text-warm-500`
- **Search input**: `rounded-full` pill shape with search icon, clear button. Doubles as URL input — detects Google Maps URLs and shows "Enter to add" hint
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
- Popups: `rounded-xl` white card with Nunito font, warm-200 border, place title + category + personal rating + photo thumbnail strip (88×88px, `max-width: none` to override Tailwind preflight)
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

Two-mode page: a collection hub with horizontal tab selector and inline browse mode. The page auto-selects the first collection on load (or restores the `?collection=<id>` from the URL), so the user always lands in browse mode rather than an empty overview.

### Collection Tab Selector

A horizontally scrollable row of collection pills (sticky on desktop) near the top of the page:
- Each pill: `CollectionAvatar` (xs size) + collection name, `rounded-lg border` with gap-1.5
- Selected pill: `border-brand-200 bg-brand-50 text-warm-800`
- Unselected: `border-transparent text-warm-500 hover:bg-warm-100 hover:text-warm-700`
- Pills support drag-to-reorder via `sortable` action (long-press 500ms on mobile; order persisted via `sort_order` column)
- "New Collection" button (`bg-brand-600` with plus icon) in the header bar opens the create modal

### Create Collection Modal
A centered modal (`sm:max-w-md`, bottom-sheet on mobile) with:
- **Name input**: Text field with `CollectionAvatar` preview, placeholder "e.g. Weekend Brunch Spots"
- **Emoji picker**: Categorized picker with ~794 emojis across 8 categories (Food & Drink, Travel & Places, Activities, Nature, Objects, Smileys, Symbols, Flags), category tab navigation, text search, and a "--" no-icon option. Selected state: `ring-2 ring-warm-400 bg-warm-100 scale-110`. Scrollable grid (max-height 200px)
- **Color picker**: Row of 6 color circles, selected state gets `ring-2 ring-offset-2 ring-warm-400 scale-110`
- **Actions**: "Create collection" button (brand-600, full-width) + "Cancel" text button

### Browse Mode (Always Active When Collections Exist)

When a pill is clicked (or auto-selected on load), the page shows a full map + list experience matching the Places page layout:
- **Desktop**: Split layout — 58% scrollable content, 42% sticky `MapView`. The tab selector + `CollectionScopeHeader` are both sticky at top
- **Mobile**: `MobileMapShell` (collapsible draggable map) + scrollable content below
- **`CollectionScopeHeader`** below tabs: avatar (clickable → color/emoji picker), name (inline editable), description (inline editable), visibility toggle, share link button, "+ Add Places" button, overflow menu (delete with confirmation)
- **Controls bar**: Place count, search input (desktop only, `w-28 sm:w-40` with clear button), sort dropdown (Recent, A–Z, My Rating), grid/list toggle
- `PlaceCard` / `PlaceListItem` rendering with collection-scoped actions (remove from collection vs. delete place)
- URL state synced via `?collection=<id>` for deep-linkability

### Add Places Modal
A centered modal (`sm:max-w-lg`, bottom-sheet on mobile) with a smart search/URL input:
- Detects Google Maps URLs and shows an "Add" button for URL mode
- Standard search mode: filters user's places by title, description, address, category, area, and tags (comma-separated terms)
- Tag filter pills below the search input for narrowing by user tags
- Scrollable list of non-member places with plus icons, tag previews, and click-to-add

### Empty State
Centered icon + "No collections yet" + "Create your first collection" link

---

## Collection Detail Page

**Route**: `/collections/[id]`

### Header Panel
Sticks at the top of the viewport (`sticky top-0 z-10`), sage-tinted background (`bg-[#faf7f2]`):

1. **Breadcrumb**: "Collections > {name}" trail
2. **Header row**:
   - **Left**: Clickable color circle/emoji (opens color+emoji picker), click-to-edit name (`font-extrabold`), click-to-edit description
   - **Right**: Copy link button (when shared), Private/Shared toggle, "+ Add Places" button (brand-600)
3. **Map panel**: Same split layout as Places — desktop has a sticky 42% right map panel; mobile uses `MobileMapShell` with draggable height
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
- **Add by URL**: Paste a Google Maps URL to add a new place directly, with loading states and error handling
- **Add Multiple**: Batch add support for adding multiple places at once
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
- **Save button** (right-aligned): Logged-in users (non-owners) can click to duplicate the collection into their own account. States: default (`bg-brand-500 text-white`), saving (spinner), saved (`bg-sage-200 text-sage-700`), disabled for owners (`bg-warm-200 text-warm-400`)

### Collapsible Map
Expandable MapView with place markers inside `rounded-xl border`. Toggle button showing place count + chevron. Height: 180px mobile, 220px desktop.

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

## Settings Page

**Route**: `/settings`

Simple account page (`max-w-lg`, centered, padded for bottom dock):

1. **Title**: "Settings" in `text-2xl font-extrabold text-warm-800`
2. **Account section**: `rounded-2xl border border-warm-200 bg-white p-5 shadow-sm`
   - Heading: "Account" in `text-sm font-extrabold uppercase tracking-wide text-warm-500`
   - User email display
   - Full-width "Sign out" button: `rounded-xl border border-warm-200 bg-warm-50 text-warm-700`, hover `bg-warm-100`
3. **Data section**: `rounded-2xl border border-warm-200 bg-white p-5 shadow-sm`
   - Heading: "Data" in same uppercase heading style
   - Description text for bulk CSV import
   - Full-width "Import from CSV" link button: `rounded-xl border-brand-200 bg-brand-50 text-brand-700`, with upload icon, navigates to `/upload`

This page replaces the former "Sign out" button in the top nav bar.

---

## Component Library

### PlaceCard

A 3D-flipping card with front (info) and back (notes):

**Front face**:
- **Header row**: Category pill, area pill, price level (left); personal rating display (right)
- **Title**: `font-extrabold`, 1-line clamp (`truncate` + `min-w-0`)
- **Description**: 2-line clamp, warm-400 text
- **Tags section**: Inline colored tag pills + TagInput for adding new tags
- **Action row**: Maps link (map-pin icon), Website link, Enrich button, Collection picker, Delete — all with hover-reveal on desktop, always visible on mobile
- **Rating**: Compact `RatingDisplay` button ("4.5 ★" / "Not rated")

**Back face** (notes):
- Full-height textarea with auto-save (800ms debounce)
- "Back" button to flip to front

**Interactions**:
- Click dead space or tap card to flip (3D `rotateY(180deg)`, `perspective: 800px`/`1000px`) — no dedicated "Notes" button on front face
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

Two rendering modes controlled by a `mode` prop (`'modal' | 'popover'`):

**Popover mode** (used on places page for both mobile and desktop):
- Rendered inside an absolute-positioned container (`w-72 rounded-xl border-warm-200 bg-warm-50 shadow-lg`)
- Header: "Manage Tags" title (`text-base font-bold`) + close button
- New tag input: color dot + text input (`text-[0.9375rem]`), palette row when typing
- Tag list: scrollable, sortable (drag-and-drop reorder via `sortable` action)
- Per-tag row: color dot (`h-3.5 w-3.5`, clickable → inline palette), name (`text-[0.9375rem]`, clickable → inline rename), delete button (hover-reveal)
- Fixed backdrop for tap-outside dismissal

**Modal mode** (full-screen):
- Teleported via portal action, full-screen overlay with centered card
- Same tag list functionality as popover but with larger layout

### TagContextMenu

Right-click menu on tags:
- Rename, Recolor (opens palette), Delete options
- Positioned at cursor, clamped to viewport edges
- Dismisses on click-outside or Escape

### TopBarTagAdd (unused)

> **Note**: This component exists in the codebase but is not imported by any page — it is dead code. The places page uses a "Manage" button opening the full `TagManager` instead.

Compact creation widget originally designed for the filter bar:
- Dashed-border "+ Add" pill → expands to inline input
- Portal dropdown for suggestions
- Auto-assigns color via `colorForTag()` hash
- Auto-assigns `order_index` via `getNextOrderIndex()`

### SavedViewsBar

Horizontal pill row for saved view presets:
- Pill per view: bookmark icon + name
- Active: `border-brand-400 bg-brand-50 text-brand-700 ring-1`
- Active + dirty (filters changed since apply): adds `border-dashed` + small brand-500 dot indicator
- Create: `SaveViewButton` component — dashed-border trigger → inline name input with Save/Cancel buttons
- Three-dot menu: Rename, New Collection, Add to Collection, Delete — fixed-positioned dropdown (desktop) or bottom sheet (mobile). Delete uses `text-danger-600` styling
- Click to apply, click active to deactivate (clears filters)
- Drag-to-reorder via `sortable` action with 500ms long-press on mobile; order persisted via `reorderSavedViews()`

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

A context menu for places within collection views. Provides two destructive actions: "Remove from collection" and "Delete place permanently". Mobile: bottom sheet with `rounded-t-2xl`. Desktop: positioned dropdown menu. Red destructive styling for delete action. Used on collection detail page (`/collections/[id]`).

### CollectionScopeHeader

Sticky header component for the collection browse mode on `/collections`:
- `border-b border-warm-200/80 bg-[#faf7f2]` background
- Left: `CollectionAvatar` (lg size, clickable → color/emoji picker dropdown), inline-editable name (`font-extrabold`), inline-editable description
- Right: Copy share link, visibility toggle (Shared/Private), "+ Add Places" button (`bg-brand-600`), overflow menu (⋯) with delete confirmation
- Color picker dropdown: 6 circles + `EmojiPicker` below, absolute positioned

### CollectionSwitcher

Modal for switching between collections without leaving browse mode:
- Bottom-sheet on mobile, centered on desktop
- Search input for filtering collections by name
- Scrollable list of collections with `CollectionAvatar` + name + place count
- Clicking selects the collection and closes the modal

### SaveViewButton

Responsive component for creating new saved views:
- **Desktop (≥ 1024px)**: Dashed-border pill with bookmark icon + "Bookmark" label. Click opens a popover dropdown (`absolute top-full`, `w-64 rounded-xl border-warm-200 bg-warm-50 shadow-lg`) with a name input and Save button. Backdrop click dismisses
- **Mobile (< 1024px)**: Same trigger pill (bookmark icon + "Bookmark"). Click opens a bottom-sheet overlay (`fixed inset-0`, slide-up card with `rounded-t-2xl`) containing a name input and Save button. Backdrop click or swipe dismisses
- Detects Google Maps URLs in search text and excludes them from the snapshot
- Creates a `buildFiltersSnapshot` of the current filter state
- `isMobile` detection via `window.matchMedia('(max-width: 1023px)')`

### AppBottomDock

Floating navigation component with three rendering modes:

**Desktop bottom bar** (default, ≥ 640px):
- Fixed to bottom of viewport, centered `max-w-lg` pill
- Frosted glass: `bg-warm-50/95 backdrop-blur-lg rounded-[1.25rem] shadow-lg`
- 3 navigation tabs: Places, Collections, Settings — each `min-h-[2.5rem] w-[4.5rem] sm:w-[5rem]`
- 6-dot drag handle on left, optional reset button (↻) on right when custom-positioned
- Active tab: `bg-brand-100 text-brand-800`; Idle: `text-warm-500`
- Safe-area aware via `env(safe-area-inset-bottom)`
- Scroll-aware passive state: reduces opacity to 45% and translates 10px down during downward scroll (cumulative delta > 8px), restores on scroll-up or idle (400ms timeout). Uses `dock-scroll-state.ts` store with rAF-based throttling and direction lock (3px delta). Hover or pointer-enter immediately restores active mode

**Custom-positioned draggable** (after user drags the grip):
- Same pill layout but positioned at absolute `left/top` coordinates, clamped to 8px from edges
- Position persisted in localStorage (`dock-position`)
- Reset button restores to default bottom bar

**Mobile collapsible right-edge drawer** (< 640px):
- Expanded: vertical `flex-col` dock sliding in from right (`translateX`, 250ms ease-out), `rounded-l-[1.25rem]`, drag handle for vertical repositioning, collapse chevron, 3 nav links stacked vertically (`3.5rem` wide)
- Collapsed: slim hint tab on right edge (`rounded-l-xl`, brand-50 bg), chevron + map pin icon
- Vertical position draggable (default 65% viewport height, persisted in localStorage)
- Tap-outside-to-close, first-visit nudge animation, `prefers-reduced-motion` respected
- Suppressible via `bottomDockSuppressed` store (hidden during action sheets)

### MapView

MapLibre GL JS map component:
- Dynamic import (avoids SSR issues)
- MapTiler "pastel" style tiles
- Custom SVG pin markers with hover/selected states
- Popups with warm styling (Nunito, rounded-xl, warm-200 border)
- Geolocate control: custom styled white rounded button (`border-radius: 8px`, `box-shadow`). Default icon: warm-700 crosshair. Active icon: brand-500 crosshair. User location dot: brand-500 fill with brand-500 30% opacity ring
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
- Collapsible right-edge dock drawer for navigation (Places, Collections, Settings) with vertical layout, drag-to-reposition, and tap-outside-to-close
- Safe area inset support (`env(safe-area-inset-*)`)
- `touch-action: manipulation` on interactive elements
- `-webkit-tap-highlight-color: transparent`

### Desktop-Specific UI
- Sticky right map panel (42% width, `top-0`, full viewport height)
- Hover-reveal action buttons on cards/list items
- Labeled tag filter rows ("Custom" label)
- Click-drag tag reordering (no long-press needed)
- Centered modals
- Three-dot menus on saved view pills
- Same bottom dock navigation (tabs slightly larger at `sm:w-[5rem]`)

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
