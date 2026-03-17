# Day 3 — Interactive Board Behavior Spec (drag / resize / rotate)

## Scope
Applies to board elements of type: `text`, `image`, `sticker`, `link`.

## Canvas rules
- Infinite canvas is out of MVP; viewport-bounded canvas for Day 3.
- Optional grid with snap (8px) toggle.

## Selection model
- Single-select by tap/click.
- Multi-select is out of current scope.
- Selected element shows transform frame with 4 resize handles + rotate handle.

## Gestures

### Drag
- Pointer down inside selected frame starts move.
- Move updates `transform.x` and `transform.y` continuously.
- Target: smooth interaction (mobile-first), no forced re-layout of unrelated nodes.

### Resize
- Corner handles resize width/height.
- Minimum size: `24x24`.
- Shift/2-finger modifier preserves aspect ratio.

### Rotate
- Rotate handle controls `transform.rotation` in degrees.
- Optional snap: every 15°.
- Rotation stored normalized to `[-180, 180]` for UI; schema allows wider range.

## Layering
- `zIndex` controls render order.
- Actions: bring forward / send backward / bring to front / send to back.
- Re-index operation should keep a dense sequence (0..N).

## State durability
- Local optimistic state update first.
- Autosave interval: 3–5s and on blur/unload.
- Save payload follows `board-state-v2.schema.json`.

## Undo/Redo
- Minimum history depth: 20 operations.
- Operations that should be tracked: add, delete, drag end, resize end, rotate end, z-index change, duplicate.

## Error handling
- Invalid transform values rejected client-side before save.
- Backend should respond with validation details and `requestId` when payload is invalid.
