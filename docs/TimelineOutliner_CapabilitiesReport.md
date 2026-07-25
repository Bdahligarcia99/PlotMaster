# Timeline Outliner — Capabilities Report

**Generated from source code** (not planning docs).  
**Primary live entry:** `/timeline/:projectId` → [`src/screens/TimelineScreen.tsx`](../src/screens/TimelineScreen.tsx)  
**Store:** [`src/store/timelineStore.ts`](../src/store/timelineStore.ts)  
**Types:** [`src/store/timelineTypes.ts`](../src/store/timelineTypes.ts)

---

## Module Overview

**Purpose:** A story-outline workspace for Synapse IWE: parallel **lanes** (arcs), stacked **beats** on a shared vertical slot grid (bottom = story start), and additive **crossing connectors** linking beats across lanes.

**Maturity:** **Functional / near production-ready** for the core outliner loop (create/edit/reorder lanes & beats, crossings, script round-trip, save/load, Beat Text Editor). Not a shell or placeholder on the dedicated timeline route. Remaining gaps are mainly polish and blueprint leftovers: horizontal orientation UI, confirm-on-lane-delete, undo/redo, export, cross-module entity linking, and a stale stub still mounted from `WorkspaceShell`.

**What a user can do today:** Open a Timeline project, add lanes and story/anchor beats, drag beats within or across lanes (including multi-select group drag), resize beat width/height globally from handles or toolbar sliders, create/toggle multi-beat crossings, edit properties in the Inspector (including five date modes), browse Lanes → Beats and Crossings in Entities, edit a bidirectional timeline script, paste/structure text in the Beat Text Editor and create beats from it, and persist project data (with manual Save/Reload). Session view prefs (zoom, beat width, text size, expand) reset on reload.

---

## UI Layout

Live layout is owned by [`TimelineScreen.tsx`](../src/screens/TimelineScreen.tsx). Spatially (top → bottom, left → right):

| Region | Component | Wiring status |
|--------|-----------|---------------|
| Top bar | Project name rename, Save/Reload ([`TimelineSaveControls.tsx`](../src/components/timeline/TimelineSaveControls.tsx)), toggles for Entities / Script / Inspector | **Wired** |
| Toolbar (hidden while Beat Text Editor is open) | [`TimelineToolbar.tsx`](../src/components/timeline/TimelineToolbar.tsx) | **Wired** |
| Left sidebar | [`TimelineEntitiesPanel.tsx`](../src/components/timeline/TimelineEntitiesPanel.tsx) — resizable; collapsible to a thin strip | **Wired**; switches to Preview/Files tabs when Beat Text Editor is open |
| Center (default) | [`TimelineBoard.tsx`](../src/components/timeline/TimelineBoard.tsx) — race-track viewport + starting-gate row | **Wired** |
| Center (Beat Text Editor mode) | [`BeatTextEditorPanel.tsx`](../src/components/timeline/beatEditor/BeatTextEditorPanel.tsx) replaces board + script | **Wired** |
| Bottom | [`TimelineScriptPane.tsx`](../src/components/timeline/TimelineScriptPane.tsx) — resizable height; collapsible | **Wired** (hidden in Beat Text Editor mode) |
| Right overlay | [`TimelineInspector.tsx`](../src/components/timeline/TimelineInspector.tsx) — absolute overlay; resizable; opens on selection/double-click | **Wired**; closes when selection clears |

**Stale stub (not the live path):** [`WorkspaceShell.tsx`](../src/screens/WorkspaceShell.tsx) still mounts [`TimelineCanvasPlaceholder.tsx`](../src/components/timeline/TimelineCanvasPlaceholder.tsx) (“Phase 1 — lanes and beats coming soon”) when a project is opened via `/project/:id` with timeline module. Real work happens on `/timeline/:projectId` (also how Intro creates/opens timeline projects).

---

## Canvas & Interaction

Implementation is **DOM columns + dnd-kit**, not React Flow. Key files: [`TimelineBoard.tsx`](../src/components/timeline/TimelineBoard.tsx), [`LaneColumn.tsx`](../src/components/timeline/LaneColumn.tsx), [`BeatBlock.tsx`](../src/components/timeline/BeatBlock.tsx), [`LaneGateCell.tsx`](../src/components/timeline/LaneGateCell.tsx), [`ConnectorOverlay.tsx`](../src/components/timeline/ConnectorOverlay.tsx).

### Viewport / “zoom”

- Discrete **visible-lane-count** steps: 3, 4, 5, 6, 8, 10, 12 (`ZOOM_LANE_COUNT_STEPS`). Lane width = `viewportWidth / min(zoomLaneCount, laneCount)`, floored at `LANE_MIN_WIDTH_PX` (140).
- Horizontal scroll when lane count exceeds zoom target; vertical scroll shared across all lanes.
- Shift+wheel / dominant horizontal wheel pans the board horizontally.
- Inspector open adds right padding + extra track width so lanes can scroll clear of the overlay.
- **No free pan/zoom transform** (no camera matrix); not a graph canvas.

### What is rendered

| Element | Behavior |
|---------|----------|
| Lane columns | Droppable tracks; darker center rail; `flex-col-reverse` so slot 0 is at the bottom (starting gate) |
| Beat blocks | Title; optional date / synopsis / detail when expanded; anchor glyph for `kind: "anchor"`; amber dot when connected |
| Empty slots | Invisible spacers sized to the global slot grid (no placeholder “empty beat” objects) |
| Starting gates | Sticky bottom row; lane label; drag to reorder lanes horizontally |
| Crossings | SVG star/hub: lines from each beat center to centroid + clickable hub marker |

### Selection & drag

- Click beat / lane gate / crossing hub → select; background click clears.
- Shift / Ctrl / Meta + click → multi-select (beats, lanes).
- Double-click beat/lane/crossing → select + open Inspector.
- Beat drag: pointer activation distance 8px; live drop preview (slot + lane); single-beat or **group move** when dragging a multi-selected set; swap if landing on an occupied slot.
- Lane reorder via gate cells (`SortableContext` + `horizontalListSortingStrategy`).
- Width resize handle (global `beatWidthPercent`); height resize handle when expanded (global `expandedBeatHeightPx`). Viewport scroll is **locked to the resized beat** during drag (`flushSync` + rect-diff correction; height transition suppressed while resizing).
- Selection autoscrolls the primary beat into view on the board and highlights matching lines in the script View pane.

### Keyboard

| Shortcut | Effect |
|----------|--------|
| Delete / Backspace | Deletes selected beats (ignored when focus is in input/textarea/contenteditable) — [`TimelineScreen.tsx`](../src/screens/TimelineScreen.tsx) |
| Modifier + click | Multi-select |
| dnd-kit `KeyboardSensor` | Keyboard drag for sortables |
| CodeMirror defaults + history | Inside Beat Text Editor only |

**Not present:** Cmd+S binding, app-level undo/redo, arrow-key board navigation, dedicated crossing hotkey.

---

## Domain Model as Implemented

### Persisted project payload

[`TimelineProjectPayload`](../src/storage/StorageDriver.ts) (`version: 1`, `moduleType: "timeline"`):

| Field | Type | Notes |
|-------|------|-------|
| `timelineOrientation` | `"vertical" \| "horizontal"` | Persisted; board layout always uses vertical stacking today |
| `lanes` | `TimelineLaneRecord[]` | |
| `beats` | `TimelineBeatRecord[]` | |
| `connections` | `TimelineConnectionRecord[]` | |
| `importLabelPrefixes` | `string[]` | Beat Text Editor prefix list |
| `documents` | `TimelineDocumentRecord[]` | Saved Beat Text Editor docs |

### Runtime types ([`timelineTypes.ts`](../src/store/timelineTypes.ts))

**Lane**

```ts
{ id: string; label: string; laneType: string; sortOrder: number }
```

Presets for `laneType`: `character`, `act`, `theme`, `subplot` (+ freeform custom string).

**Beat**

```ts
{
  id: string;
  laneId: string;
  slot: number;           // global slot grid; 0 = bottom / start
  kind: "story" | "anchor";
  title: string;
  synopsis: string;
  detail: string;
  dateSpec: BeatDateSpec;
}
```

**BeatDateSpec**

```ts
{
  mode: "none" | "label" | "absolute" | "relative" | "resolved";
  label?: string;
  absolute?: string;
  relative?: { years: number; months: number; days: number; originBeatId: string };
  resolved?: string;
}
```

**Connection (crossing)**

```ts
{
  id: string;
  beatIds: string[];   // N ≥ 2, at most one beat per lane
  title: string;
  description: string;
  date: string;        // freeform string — not BeatDateSpec
}
```

**Selection**

```ts
{ type: "lane" | "beat" | "connection"; id: string }[]
```

**IDs:** [`generateTimelineId()`](../src/storage/timelineIds.ts) → short opaque `_` + base36 string (not UUID).

### Legacy / dropped concepts

On load ([`normalizeLoadedBeat`](../src/store/timelineStore.ts)):

- `kind: "empty"` beats are **dropped** (slot grid replaced spacer/ghost beats).
- Legacy `order` → `slot`; `description` → `detail`; `date` string → `dateSpec`; `anchorId` / `ghostSide` discarded.
- Legacy connections with `beatIdA` / `beatIdB` migrate to `beatIds`.

### Session-only (in-memory, not in project payload)

`zoomLaneCount`, `beatWidthPercent`, `beatTextScalePercent`, `beatsExpanded`, `expandedBeatHeightPx`, `beatPlacementMode`, `scriptPanelLayout`, `selection`, `scriptDraft`, `hasUnsavedChanges`, `isSaving`, `lastSaveError`, `autosaveEnabled` (always `true`, no UI).

---

## Building / Editing Flows

### Working flows

1. **Create lane** — Toolbar **Lane** → appends rightmost lane, selects it, default type `character`.
2. **Add story beat** — Select lane or beat, then **+ Beat** (or menu → Beat). Requires selection; otherwise disabled with message. Placement:
   - **Auto:** next free slot at top of that lane’s occupied range.
   - **Place above / below selected beat:** splices relative to selection (`insertStoryBeatRelativeToBeat`).
3. **Add anchor beat** — Beat menu → **Anchor Beat** (no auto-spawned ghosts; those were removed with empty beats).
4. **Edit beat/lane/crossing** — Select → Inspector (or double-click). Blur commits fields. Beat dates via [`BeatDateEditor.tsx`](../src/components/timeline/BeatDateEditor.tsx): None / Resolved / Label / Actual date / Relative (origin candidates = other beats on same lane).
5. **Delete beat** — Inspector Delete, Multi-Beat panel Delete, or Delete/Backspace with beats selected. Cascades: removes connections referencing those beats.
6. **Delete lane** — Inspector Delete on a lane: **immediate**, no confirm dialog. Cascades beats on that lane + connections touching them.
7. **Reorder beats** — Drag block within lane or to another lane; group drag for multi-select.
8. **Reorder lanes** — Drag starting-gate cell.
9. **Crossing** — Multi-select ≥2 beats on distinct lanes → **Crossing** (toggles off if same set already connected). Inspector edits title/description/date; Delete removes connector only.
10. **Bulk rename titles** — Toolbar **Rename titles** (selected beats, or all beats on target lane) → modal → sequential `Base N`.
11. **Beat Text Editor** — Paste/structure document (separators, field tools, templates, prefix strip) → **Create beats** into chosen lane; Save/load documents via Entities Files tab.
12. **Multi-beat Inspector mode** — Isolation OFF → list beats on active lane, edit one, stage slot inserts, Apply; multi-select syncs with board; bulk delete.

### View controls (toolbar)

| Control | Works? | Persisted? |
|---------|--------|------------|
| Lane count − / + | Yes | No |
| Beat width % | Yes (+ beat edge handle) | No |
| Text size % | Yes (viewport beats only) | No |
| Expand / Collapse beats | Yes | No |
| Expanded height px | Yes when expanded (+ bottom handle) | No |

### Disabled / gated UI (intentional)

- **+ Beat** / beat menu / **Rename titles** — disabled without a valid lane/beat target (or rename targets).
- **Crossing** — disabled unless selection can form a crossing (`canFormCrossing`).
- **Create beats (N)** in Beat Text Editor — disabled with no lane or zero segments.
- **Commit separators** — disabled when already committed / empty rules apply.

### Stubbed or unused relative to blueprint

| Item | Reality |
|------|---------|
| Empty Beat / ghost beats / ghosts-per-anchor sliders | **Not creatable**; legacy empties stripped on load |
| “Require anchor pick when 2+ exist” | **Not implemented** |
| Orientation toggle | Store + payload only; **no UI**; board always vertical |
| Lane-delete warning | **No confirm** — deletes immediately |
| Beat delete “this + all following” | **Not implemented** (single / multi-id delete only) |
| Undo / redo | **Not implemented** at timeline store level |
| Export PDF/image | **Not implemented** |
| Cross-module character/entity linking | **Not implemented** — Entities is timeline-local |
| `renameDocument` | Store action exists; **no UI** |
| Autosave toggle | Always on; **no UI** (unlike Family Tree) |
| `TimelineCanvasPlaceholder` | Still used only by WorkspaceShell legacy path |

---

## Script / DSL Support

**Bidirectional.** [`timelineScript.ts`](../src/store/timelineScript.ts) + [`TimelineScriptPane.tsx`](../src/components/timeline/TimelineScriptPane.tsx).

- **Generate** from model → Code/View panes.
- **Edit** Code textarea → on blur, `applyScriptText` parses and replaces lanes/beats/connections (errors shown, draft kept on failure).
- **Sync from canvas** resets draft from current model.
- Layout modes: Split / Code / View (`scriptPanelLayout`, session-only).
- Compact checkbox replaces non-empty quoted values with `"..."` for display; focuses Code with full text for editing.
- View pane highlights lines (and whole beat `{ … }` blocks) for selected beat IDs; autoscrolls to highlight.

### Current syntax (generated shape)

```text
@declarations

Lane <id> "<label>" type: <laneType> sort: <n>

Beat <id> lane: <laneId> slot: <n> [kind: anchor] {
  title: "..."
  synopsis: "..."          # optional if empty
  detail: "..."            # optional if empty
  dateMode: label|absolute|relative|resolved
  dateLabel: "..."         # or dateAbsolute / dateRelative / dateResolved
}

Crossing <id> beats: id1,id2[,id3...] [title: "..."] [description: "..."] [date: "..."]

@timeline
```

Legacy single-line beat fields (no braces) still parse. Comments (`#`) and `@` section markers are skipped. `@timeline` body is currently empty (marker only).

---

## Persistence

| Mechanism | Detail |
|-----------|--------|
| Driver | [`LocalStorageDriver`](../src/storage/StorageDriver.ts) — keys `synapse-iwe:projects:index` and `synapse-iwe:project:data:<id>` (legacy `plotmaster:` keys still read) |
| Manual Save / Reload | Top-bar [`TimelineSaveControls`](../src/components/timeline/TimelineSaveControls.tsx); Reload confirms if dirty |
| Autosave | Debounced ~500ms when snapshot of `{ orientation, lanes, beats, connections }` changes **and** `hasUnsavedChanges` |

**Saved on successful save:** orientation, lanes, beats, connections, `importLabelPrefixes`, `documents`.

**Autosave quirk:** Document-only or prefix-only edits set `hasUnsavedChanges` but are **outside** the autosave snapshot — they need **manual Save** (or a subsequent lanes/beats/connections edit) to flush.

**Lost on refresh (session-only):** selection, zoom, beat width/text scale/expand prefs, placement mode, script panel layout, unsaved script draft, in-progress Beat Text Editor buffer if not saved as a document.

---

## Known Gaps vs. Blueprint

Compared to [`docs/TimelineOutliner_PhasedApproach.md`](./TimelineOutliner_PhasedApproach.md) (design intent). Status reflects **code today**, not checkbox claims in that doc.

| Blueprint item | Status in app today |
|----------------|---------------------|
| Phase 0 route + payload + IDs | **Done** (`/timeline/:projectId`, payload, short IDs) |
| Phase 1 lanes/beats board, zoom race-track, DnD, inspector, entities, script v1 | **Done** (slot grid instead of per-lane dense `order`; empties removed) |
| Phase 2 crossings (N-beat, SVG hub, script, inspector) | **Done** |
| Phase 3 orientation toggle + layout reflow | **Partial** — field persisted; **no UI**; no horizontal board |
| Phase 3 export | **Not started** |
| Phase 3 performance / virtualization | **Not started** (acceptable at current scale) |
| Phase 3 session view controls | **Done** (width, expand, height, text size, zoom) |
| Phase 4 lane delete + warning | **Partial** — delete works; **no warning** |
| Phase 4 beat delete modes (node vs node+following) | **Not started** |
| Phase 4 undo/redo | **Not started** |
| Phase 5 cross-module entities / shared attributes | **Not started** |
| Empty beats + anchor ghost system (§2.2a/b) | **Superseded / removed** — slot grid; anchors exist without ghosts |
| WorkspaceShell timeline area | **Still stub** (`TimelineCanvasPlaceholder`) — dead end vs live `TimelineScreen` |
| Script `@timeline` narrative body | **Marker only** — no body grammar beyond declarations |
| Beat Text Editor | **Implemented** (beyond original phased doc; full paste → create beats + saved documents) |

### Honesty summary

The dedicated Timeline Outliner screen is a **working product surface**, not a mock. The main maturity caveats are: leftover WorkspaceShell placeholder, orientation/export/undo still missing, lane delete is unsafe without confirm, autosave can miss document-only changes, and several experimental blueprint features (empty beats, ghost anchors, require-anchor-pick) were either never finished or deliberately replaced by the slot-grid model.

---

## Major file index

| Area | Path |
|------|------|
| Screen | `src/screens/TimelineScreen.tsx` |
| Store | `src/store/timelineStore.ts` |
| Types | `src/store/timelineTypes.ts` |
| Script DSL | `src/store/timelineScript.ts` |
| Persistence types / driver | `src/storage/StorageDriver.ts`, `src/storage/timelineIds.ts` |
| Board | `src/components/timeline/TimelineBoard.tsx`, `LaneColumn.tsx`, `BeatBlock.tsx`, `LaneGateCell.tsx`, `ConnectorOverlay.tsx` |
| Chrome | `TimelineToolbar.tsx`, `TimelineEntitiesPanel.tsx`, `TimelineInspector.tsx`, `TimelineScriptPane.tsx`, `TimelineSaveControls.tsx` |
| Dates | `BeatDateEditor.tsx`, `src/utils/beatDate.ts` |
| Beat Text Editor | `src/components/timeline/beatEditor/*` |
| Multi-beat inspector | `src/components/timeline/import/TimelineInspectorMultiBeatPanel.tsx` |
| Stale placeholder | `TimelineCanvasPlaceholder.tsx` (via `WorkspaceShell.tsx`) |

---

*End of capabilities report.*
