# Mobile vs Desktop Feature Comparison

> Generated from codebase scan — identifies all UI/UX differences and potential misalignments.

---

## Breakpoints Summary

| Breakpoint | Tailwind | What it controls |
|---|---|---|
| **640px** | `sm:` | AppBottomDock mode, PlaceCard/PlaceListItem layout split |
| **768px** | `md:` | Map panel width min, inline tag column in list view |
| **1024px** | `lg:` | Full page layout branch (MobileMapShell vs desktop), TagSidebar visibility |

**Detection method:** Each component independently checks `window.innerWidth` on mount + resize. No shared mobile state store.

---

## 1. Overall Page Layout

### Places Page (`/places`)

| Aspect | Mobile (`< 1024px`) | Desktop (`≥ 1024px`) |
|---|---|---|
| Layout direction | Vertical stack: map on top → list below | Horizontal split: list left ↔ map right |
| Map component | `MobileMapShell` (draggable height) | `MapView` in resizable side panel |
| Map sizing | 3 snap points (80px collapsed, ~vh-600 medium, ~55% large) | CSS variable `--desktop-map-pct` (default 42%, range 25%–75%) |
| Resize interaction | Vertical drag on bottom handle + double-tap toggle | Horizontal drag on left edge + double-click reset |

### Collection Detail (`/collections/[id]`)

Same pattern as Places page — `MobileMapShell` on mobile, side-panel `MapView` on desktop.

---

## 2. Navigation Dock (AppBottomDock)

| Aspect | Mobile (`< 640px`) | Desktop (`≥ 640px`) |
|---|---|---|
| Position | Right edge, vertical | Bottom center, horizontal |
| Collapse behavior | Slides in/out to a slim tab on the right | Fades to passive state on scroll-down |
| Interaction | Drag vertically to reposition; tap to expand/collapse | Hover to reveal; click to navigate |
| First-visit hint | Nudge animation (slide-in then back) | None |
| Custom position mode | Overrides to floating horizontal pill | Floating horizontal pill + reset button |
| Scroll-state integration | `dock-scroll-state` runs but doesn't drive mobile dock (it uses own `mobileCollapsed`) | `dock-scroll-state` drives active/passive fade |
| Safe area | `env(safe-area-inset-right)` | `env(safe-area-inset-bottom)` |

**Nav links (same on both):** Places, Collections, Settings

---

## 3. PlaceCard (Card/Grid View)

| Feature | Mobile (`< 640px`) | Desktop (`≥ 640px`) | ⚠️ Misalignment? |
|---|---|---|---|
| Container | `rounded-xl`, 148px height | `rounded-2xl`, 170px height | — |
| Delete method | **Swipe-to-delete** (72px reveal, confirm step) | Only via 3-dot menu | ⚠️ Different mental model |
| Selection | `handleMobileTap` (respects swipe state) | `handleDesktopFlip` | — |
| Flip to notes | Tap to flip | Click to flip | — |
| Hover effects | None | `hover:shadow-md` | — |
| 3-dot menu items | Open in Map, Rate, Add to Collection, Get Details, Auto-tag, Delete | **Same** | ✅ |

---

## 4. PlaceListItem (List View)

| Feature | Mobile (`< 640px`) | Desktop (`≥ 640px`) | ⚠️ Misalignment? |
|---|---|---|---|
| Layout | Swipe container + tap-to-expand row | Standard clickable row with chevron | — |
| Tags in row | Not shown (only in expanded panel) | First tag + count shown inline | ⚠️ Info density differs |
| Delete method | **Swipe-to-delete** (72px reveal) | Delete button in expanded panel (`hidden sm:flex`) | ⚠️ Different pattern |
| Expand trigger | Tap row | Click row / chevron | — |

---

## 5. Search Behavior

| Feature | Mobile | Desktop | ⚠️ Misalignment? |
|---|---|---|---|
| Focus behavior | Expands full-width, hides sort/view controls, shows back button | Stays inline, controls always visible | — (intentional UX) |
| Dismiss | Back button (← arrow) | Click away / Escape | — |
| Width on focus | 100% | Fixed width | — |

---

## 6. Tag Sidebar

| Feature | Mobile | Desktop | ⚠️ Misalignment? |
|---|---|---|---|
| Visibility | Hidden by default, slide-in from left via `mobileOpen` prop | Always visible (`lg:translate-x-0`) | — |
| Trigger | Button/icon in header | Auto-shown | — |
| Backdrop | Shown (`lg:hidden`), tap to close | None | — |
| Actions available | Same tag management | Same tag management | ✅ |

---

## 7. Modals

| Modal | Mobile Rendering | Desktop Rendering | ⚠️ Misalignment? |
|---|---|---|---|
| **AddPlaceModal** | Fixed centered, `pt-[12vh]` | Same, max-width 512px | ✅ |
| **AddToCollectionModal** (no anchor) | Bottom sheet (`items-end`, `rounded-t-2xl`) | Centered dialog (`items-center`, `rounded-2xl`) | — (platform convention) |
| **AddToCollectionModal** (with anchor) | Popover near button | Same | ✅ |
| **CollectionSwitcher** | Bottom sheet (`items-end`, `rounded-t-2xl`) | Centered dialog (`items-center`, `rounded-2xl`) | — (platform convention) |
| **PlaceActionMenu** | Absolutely positioned near anchor | Same | ✅ |
| **TagManager** (`mode='modal'`) | Full-screen backdrop, `inset-x-4 top-[10%]` | `sm:left-1/2 sm:top-[15%]`, narrower | — |

---

## 8. Buttons & Actions — Full Comparison

### Header / Scope Header Actions

| Action | Mobile | Desktop | ⚠️ |
|---|---|---|---|
| "Add Places" button | Icon only | Icon + text label (`hidden sm:inline`) | — |
| Search toggle | Collapsed as icon, expands on tap | Similar expand but inline | — |
| Back navigation | ← arrow in header | Same | ✅ |

### SaveViewButton

| Aspect | Mobile | Desktop |
|---|---|---|
| Appearance | Icon only (`p-1.5`) | Icon + "Save View" text (`sm:rounded-lg sm:px-2.5 sm:py-1.5`) |

### SavedViewsBar

| Aspect | Mobile | Desktop |
|---|---|---|
| Rendering | Same horizontal scroll pills | Same (minor padding via `sm:` prefixes) |
| Location on page | In mobile section (`lg:hidden`) | In desktop section (`hidden lg:block`) |

### TopBarTagAdd

No structural difference — minor width change (`sm:w-28`).

### TagInput

No structural difference — minor responsive sizing (`w-24 sm:w-28`).

---

## 9. Map Interactions

| Feature | Mobile | Desktop | ⚠️ Misalignment? |
|---|---|---|---|
| Map attribution | Top-left, compact glassy style | Bottom-right, standard | — |
| Popup offset | Accounts for handle height (24px) in collapsed mode | No offset needed | — |
| Marker interaction | Tap to select → popup | Click to select → popup | ✅ |
| Fit-to-bounds trigger | Same | Same | ✅ |

---

## 10. Features ONLY on Mobile

| Feature | Component | Notes |
|---|---|---|
| Swipe-to-delete | PlaceCard, PlaceListItem | Touch gesture with 72px reveal + confirm |
| Draggable map height | MobileMapShell | 3 snap points with drag handle |
| Right-edge collapsible dock | AppBottomDock | Vertical, slides in/out |
| First-visit dock hint animation | AppBottomDock | Nudge animation on first load |
| Full-width search expansion | places page, collections page | Hides other controls |
| Back button in search | places page, collections page | Dedicated dismiss affordance |

---

## 11. Features ONLY on Desktop

| Feature | Component | Notes |
|---|---|---|
| Resizable map width | places/+page.svelte | Horizontal drag handle, double-click reset |
| Draggable floating dock position | AppBottomDock | Custom position + reset button |
| Dock passive/active scroll states | AppBottomDock | Fade + translateY on scroll |
| Inline tag column in list rows | PlaceListItem | First tag + count shown in row |
| Delete button in expanded list row | PlaceListItem | Visible only on `sm:flex` |
| Hover shadow on cards | PlaceCard | `hover:shadow-md` |
| Always-visible TagSidebar | TagSidebar | No toggle needed |

---

## 12. Potential Misalignments & Issues

### ⚠️ Critical

| # | Issue | Details |
|---|---|---|
| 1 | **Delete discoverability differs** | Mobile uses swipe-to-delete (no visible button), Desktop uses menu or expanded-row button. Users switching platforms may not find delete. |
| 2 | **Tag visibility in list view** | Desktop shows inline tag pills in each row; mobile shows nothing until expanded. Mobile users lose at-a-glance tag info. |
| 3 | **Dock mental model completely different** | Mobile = right edge vertical collapsible; Desktop = bottom horizontal with scroll-fade. No consistency in muscle memory. |

### ⚠️ Moderate

| # | Issue | Details |
|---|---|---|
| 4 | **Two different breakpoints for "mobile"** | Dock uses 640px, page layout uses 1024px. Between 640–1024px is a hybrid zone (desktop dock + mobile map shell). |
| 5 | **No shared mobile state** | Each component checks `window.innerWidth` independently — could lead to inconsistent states if resize events are missed. |
| 6 | **Scroll-state watcher runs on mobile but does nothing** | `dock-scroll-state.ts` initializes and listens on mobile but its `'passive'` state never affects the mobile dock UI — wasted listeners. |
| 7 | **Card height difference** (148px vs 170px) | Might cause layout shift if viewport crosses 640px breakpoint during use. |

### ℹ️ Minor / Intentional

| # | Issue | Details |
|---|---|---|
| 8 | Modal presentation (bottom sheet vs centered) | Follows platform conventions — likely intentional |
| 9 | Search expansion behavior | Mobile-optimized UX — likely intentional |
| 10 | Button label visibility (icon vs icon+text) | Space optimization — intentional |

---

## 13. Hybrid Zone (640px – 1024px)

This range is particularly interesting:

- **Dock**: Renders as **desktop** style (bottom horizontal) — since `MOBILE_BREAKPOINT = 640`
- **Page layout**: Renders as **mobile** (MobileMapShell, vertical stack) — since `isMobile = innerWidth < 1024`
- **PlaceCard/PlaceListItem**: Renders as **desktop** variant — since split is at `sm:` (640px)
- **TagSidebar**: Still hidden (needs `lg:` / 1024px to auto-show)

This means a tablet user (e.g., iPad portrait at ~820px) gets:
- Desktop dock (bottom bar) ✓
- Mobile map shell (draggable vertical) ✓
- Desktop card layout (no swipe) ✓
- Hidden tag sidebar (must manually open) ✓

**Potential issue:** Desktop PlaceCard has no swipe-to-delete, but the page is in "mobile" map mode — the delete path is through the 3-dot menu only, which may feel inconsistent with the mobile-feeling map interaction.

---

## 14. Recommendation Summary

1. Consider unifying the "mobile" breakpoint to a single value (or at most two with clear semantic meaning)
2. Add a delete affordance visible on mobile cards without requiring swipe discovery
3. Consider showing at least one tag pill on mobile list items for parity
4. Gate the `dock-scroll-state` watcher behind an `!isMobile` check to avoid unnecessary listeners
5. Document the hybrid zone behavior for QA testing on tablets
