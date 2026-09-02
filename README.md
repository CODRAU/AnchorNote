# AnchorNote

A Chrome extension (Manifest V3) that lets you highlight text and draw freehand annotations directly on top of any webpage.

## Features

- **Text highlighting** — select any text on a page to highlight it in one of several preset colors or a custom color. Overlapping highlights merge cleanly instead of nesting or breaking, via DOM range-splitting logic.
- **Marker (freehand drawing)** — draw directly on top of a page using a canvas overlay. Adjustable stroke size and opacity, with a live color preview in the popup.
- **Eraser** — remove marker strokes at any point, implemented via canvas compositing rather than as a separate drawing layer.
- **Tool settings persist across the current browsing session** — last-used tool, color, marker size, and opacity are saved via `chrome.storage.local` and restored whenever you reopen the popup.

## Known Limitations

- Highlights and drawings are **not currently saved per-page** — reloading or revisiting a page clears existing annotations. Only tool *settings* (color, size, opacity, active tool) persist, not the annotations themselves.
- Marker drawings are page-relative (normalized to page width/height), so they stay aligned through scrolling and window resizing, but are lost on navigation/reload along with highlights.

## Tech Stack

- Chrome Extension (Manifest V3)
- Vanilla JavaScript, HTML, CSS
- Chrome Storage API (`chrome.storage.local`)
- Canvas API (`OffscreenCanvas`, `requestAnimationFrame`) for drawing
- DOM `Range` / `TreeWalker` APIs for highlight merging

## How It Works (Technical Overview)

**Highlighting:** Uses the `Range` and `TreeWalker` APIs to detect when a new selection overlaps an existing highlight span, splits the old span at the correct boundary, and merges the result into a single clean highlight — avoiding invalid or nested DOM structure.

**Drawing:** A full-page `<canvas>` overlay captures mouse input when the marker tool is active (`pointerEvents` toggles so clicks pass through to the page otherwise). Strokes are stored as an ordered list of operations (points, color, size, opacity) with coordinates normalized to a percentage of page dimensions, rather than drawn directly — every frame is a full replay of all operations onto an `OffscreenCanvas`, which is then copied to the visible canvas.

**Erasing:** Implemented as its own operation type in the same list, using `globalCompositeOperation = 'destination-out'` to punch transparent holes in the drawn strokes rather than maintaining a separate erase layer.

## Development

Load the extension locally:

1. Open Chrome and go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked"
4. Select this folder

## Roadmap

- Persist highlights and drawings per-URL so they reload when revisiting a page
- Sync `content.js`'s initial tool state from `chrome.storage` on injection, rather than relying on the popup to push state