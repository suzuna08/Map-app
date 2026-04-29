# Bug Report: Card Click Causes Page Scroll / Selection Mismatch

**Status**: Resolved
**Date**: 2026-04-30
**Severity**: High (affects core interaction on every card click)
**Affected pages**: `/places`, `/collections/[id]`
**Platform**: Desktop only (>= 1024px viewport)

---

## Symptom

On desktop, clicking a place card would:
1. Correctly select the place on the map (right marker, right popup)
2. But scroll the card list **downward**, moving the clicked card out of view
3. Making it appear as though a different card was selected

Users described this as a "mirror effect" -- the card list and map appeared out of sync even though the underlying state was correct.

## Reproduction

1. Open `/places` on desktop (side-by-side layout with card list on left, map on right)
2. Click any place card
3. Observe: the map flies to the correct marker, but the card list scrolls down

The bug was **consistent** (every click), not intermittent.

## Investigation

### What was ruled out

| Hypothesis | Verdict | Evidence |
|---|---|---|
| Array index used instead of stable ID | Ruled out | All selection uses UUID `place.id`, all `{#each}` blocks keyed by `(place.id)` |
| Duplicate place IDs | Ruled out | IDs are UUIDs from Supabase |
| Name/title matching instead of ID | Ruled out | All identity operations use `place.id` |
| Stale closure in marker click handler | Ruled out | Svelte 5 runes keep prop reads current |
| Race condition between card and map | Ruled out | JS single-threaded; state assignment is synchronous |
| `sortedPlaces` reordering on selection | Ruled out | `sortedPlaces` does not depend on `selectedPlaceId` |
| `scrollToPlace` called from card click | Ruled out | Only called from `handleMapPlaceSelect`, never from `handleCardSelect` |
| Residual smooth-scroll from prior map click | Ruled out | Bug is consistent, not timing-dependent |
| `$effect` clearing selection unexpectedly | Ruled out | Debug logs confirmed `selectedPlaceId` always set correctly |
| CSS layout shift from selection highlight | Ruled out | Card has fixed `h-[170px]`; `ring-2` uses box-shadow (no layout impact) |

### Debug logging added

Temporary `[DEBUG-SEL]` console.log statements were added at every selection touchpoint:
- `PlaceCard.handleDesktopFlip` / `handleMobileTap`
- `handleCardSelect` / `handleMapPlaceSelect` (both pages)
- `scrollToPlace`
- MapView selection `$effect` (flyTo, popup toggle, marker CSS)
- Global `selectedPlaceId` change watcher

All logs confirmed the correct place ID flowed through every step. The state was never wrong.

### Root cause identified

The MapView `$effect` that fires on `selectedPlaceId` change does three things:
1. Toggles `map-marker--selected` CSS class on markers
2. Calls `map.flyTo()` to animate the camera
3. Calls `marker.togglePopup()` to open a popup on the selected marker

The popup is a **real DOM element** (not canvas-rendered) that MapLibre inserts into the map container. When the popup appeared -- particularly for markers near the bottom of the map -- the browser's built-in scroll-into-view behavior detected newly visible DOM content and **auto-scrolled the page** to accommodate it.

The desktop layout uses **page-level scroll** for the card list while the map is `position: sticky`. The auto-scroll moved the card list but the map stayed fixed, creating the visual mismatch.

### Why it looked like a "mirror" effect

- Markers at the **top** of the map: popups appeared within the map panel bounds -- no scroll
- Markers at the **bottom** of the map: popups overflowed downward -- browser scrolled the page down
- The scroll amount correlated with the marker's vertical position, creating an inversely proportional "mirror" pattern

## Fix

### 1. `overflow-hidden` on map containers

Added `overflow-hidden` (Tailwind) to clip popup DOM elements within the map panel:

- `src/routes/places/+page.svelte` -- desktop map panel div
- `src/lib/components/MapView.svelte` -- `.map-wrapper` div
- `src/routes/collections/[id]/+page.svelte` -- collection detail map panel div

### 2. Scroll position preservation in `handleCardSelect`

Both pages now capture `window.scrollY` before updating selection state and restore it on the next animation frame if the browser auto-scrolled:

```javascript
function handleCardSelect(placeId: string) {
    const scrollY = window.scrollY;
    selectedPlaceId = placeId;
    recenterTick++;
    requestAnimationFrame(() => {
        if (window.scrollY !== scrollY) {
            window.scrollTo({ top: scrollY, behavior: 'instant' });
        }
    });
}
```

### 3. Parity fix: selection-clear guard on collection page

Added a missing `$effect` to `collections/[id]/+page.svelte` that nulls `selectedPlaceId` when the selected place leaves `filteredPlaces` (e.g., after a search/filter change). The places page already had this guard.

## Files changed

| File | Change |
|---|---|
| `src/routes/places/+page.svelte` | `overflow-hidden` on map panel; scroll preservation in `handleCardSelect` |
| `src/lib/components/MapView.svelte` | `overflow-hidden` on `.map-wrapper` |
| `src/routes/collections/[id]/+page.svelte` | `overflow-hidden` on map panel; scroll preservation in `handleCardSelect`; selection-clear `$effect` |
| `IMPLEMENTATION.md` | Added Bug #18 entry |

## Risk assessment

- **Low risk**: `overflow-hidden` is standard practice for map containers; scroll preservation is a single rAF check
- **Popup clipping**: Popups near the map edge may be visually clipped, but `flyTo` with `offset` already centers the marker before the popup opens
- **Mobile**: Not affected -- mobile layout uses `MobileMapShell` with a separate scroll container (`overflow-y-auto`)
