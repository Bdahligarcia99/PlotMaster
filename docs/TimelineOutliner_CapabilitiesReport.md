# Timeline Outliner — Capabilities Report

**Generated from source code** (not planning docs).  
**Primary live entry:** `/timeline/:projectId` → [`src/screens/TimelineScreen.tsx`](../src/screens/TimelineScreen.tsx)  
**Store:** [`src/store/timelineStore.ts`](../src/store/timelineStore.ts)  
**Types:** [`src/store/timelineTypes.ts`](../src/store/timelineTypes.ts)

---

## Module Overview

**Purpose:** A story-outline workspace for Synapse IWE: parallel **lanes** (arcs), stacked **beats** on a shared vertical slot grid (bottom = story start), and additive **crossing connectors** linking beats across lanes.

**Maturity:** **Functional / near production-ready** for the core outliner loop (create/edit/reorder lanes & beats, crossings, script round-trip, save/load, Text Editor workspace with per-lane derived files). Remaining gaps are mainly polish and blueprint leftovers: horizontal orientation UI, confirm-on-lane-delete in Block mode, undo/redo, export, cross-module entity linking, and a stale stub still mounted from `WorkspaceShell`.

**What a user can do today:** Open a Timeline project, add lanes and story/anchor beats, drag beats within or across lanes (including multi-select group drag), resize beat width/height globally from handles or toolbar sliders, create/toggle multi-beat crossings, edit properties in the Inspector (including five date modes), browse Lanes → Beats and Crossings in Entities (Block mode), edit a bidirectional timeline script, switch to **Text** display mode to edit per-lane derived files (and optional user-made draft files), and persist project data (with manual Save/Reload). Some view prefs persist in the payload; others reset on reload.

---

## UI Layout

Live layout is owned by [`TimelineScreen.tsx`](../src/screens/TimelineScreen.tsx). Spatially (top → bottom, left → right):

| Region | Component | Wiring status |
|--------|-----------|---------------|
| Top bar | Project name rename, Save/Reload ([`TimelineSaveControls.tsx`](../src/components/timeline/TimelineSaveControls.tsx)), Display Mode dropdown, toggles for Sub Entities / Script / Inspector | **Wired** |
| Toolbar (Block mode only) | [`TimelineToolbar.tsx`](../src/components/timeline/TimelineToolbar.tsx) | **Wired** |
| Left sidebar | [`TimelineEntitiesPanel.tsx`](../src/components/timeline/TimelineEntitiesPanel.tsx) — resizable; collapsible to a thin strip | **Wired**; Block mode = Lanes/Beats/Crossings tree; Text mode = Derived + User-made file lists |
| Center (Block mode, `displayMode: "block"`) | [`TimelineBoard.tsx`](../src/components/timeline/TimelineBoard.tsx) — race-track viewport + starting-gate row | **Wired** |
| Center (Text mode, `displayMode: "text"`) | [`TimelineTextEditorWorkspace.tsx`](../src/components/timeline/TimelineTextEditorWorkspace.tsx) — multi-pane CodeMirror editors | **Wired** |
| Bottom (Block mode only) | [`TimelineScriptPane.tsx`](../src/components/timeline/TimelineScriptPane.tsx) — resizable height; collapsible | **Wired** |
| Right overlay (Block mode only) | [`TimelineInspector.tsx`](../src/components/timeline/TimelineInspector.tsx) — absolute overlay; resizable | **Wired** |

**Display mode switch:** [`DisplayModeDropdown`](../src/components/ui/DisplayModeDropdown.tsx) in the top bar (via `TimelineScreen` → `ModuleSwitcherNavbar`). Timeline supports `"block"` (board + script) and `"text"` (file workspace). Persisted as `displayMode` on the project payload; restored on load ([`timelineStore.ts`](../src/store/timelineStore.ts) `loadTimeline`, lines ~345–346).

**Stale / orphaned UI (not the live Text Editor path):**

- [`BeatTextEditorPanel.tsx`](../src/components/timeline/beatEditor/BeatTextEditorPanel.tsx) — **not imported or mounted anywhere** in the app today. The old single-panel paste → create-beats flow lives only in this dead component.
- [`TimelineCanvasPlaceholder.tsx`](../src/components/timeline/TimelineCanvasPlaceholder.tsx) — still used by [`WorkspaceShell.tsx`](../src/screens/WorkspaceShell.tsx) legacy route only.

---

## Lane Files, Documents & Text Editor Mode

This section answers the lane-to-file model as implemented **today** (verified in store + beatEditor code).

### Single document type, two kinds

Per-lane files are **not** a separate persistence concept from Beat Text Editor saved documents. Both use the same record type in the same array:

```137:147:src/storage/StorageDriver.ts
/** Saved text document in Timeline Text Editor mode (user-made notes or lane-derived files). */
export interface TimelineDocumentRecord {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
  /** Defaults to "user" when absent (legacy projects). */
  kind?: "user" | "derived";
  /** Set when kind === "derived" — the lane this file mirrors. */
  laneId?: string;
}
```

Runtime store field: `documents: TimelineDocumentRecord[]` ([`timelineStore.ts`](../src/store/timelineStore.ts) ~237).

On load, [`normalizeDocument`](../src/store/timelineStore.ts) (~137–146) coerces missing/invalid `kind` to `"user"`; only `kind === "derived"` retains `laneId`.

**Derived** (`kind: "derived"`, `laneId` set): auto-created mirror of one lane's beats as text.  
**User-made** (`kind: "user"`, no `laneId`): optional freeform draft; can be converted into a new lane + derived file.

There is no third document type or separate file-store API.

### Lane-to-file relationship & 1:1 enforcement

**Intended model:** one derived document per lane, one lane per derived document.

| Rule | Enforced in code? | Where |
|------|-------------------|-------|
| Every lane gets a derived doc when missing | **Yes, on demand** | `ensureDerivedDocuments()` (~638–675): loops lanes, creates derived doc if none with matching `laneId` |
| Derived doc created when lane added | **Yes** | `addLane()` calls `ensureDerivedDocuments()` after append (~524) |
| Derived doc removed when lane deleted | **Yes** | `removeLane()` filters out `kind === "derived" && laneId === laneId` (~1126–1128) |
| Derived doc renamed when lane label changes | **Yes** | `updateLane({ label })` updates matching derived doc `name` (~1022–1027); `ensureDerivedDocuments` also syncs name (~664–668) |
| Orphan derived docs (lane gone) pruned | **Yes** | `ensureDerivedDocuments` filters derived docs whose `laneId` ∉ current lanes (~641–643) |
| At most one derived doc per `laneId` | **Soft** | Creation paths check `docs.find(d => d.kind === "derived" && d.laneId === lane.id)` before insert; **no deduplication** if corrupt/legacy data contains duplicates |
| User-made docs | **0..N, optional** | `createUserDocument`, `saveDocument` (always `kind: "user"`) |
| Every file belongs to exactly one lane | **Derived only** | User-made files have no lane until `convertUserDocumentToLane` |

**Not strictly live-synced:** editing beats on the **Block board** (Inspector, drag, toolbar) updates `beats[]` but does **not** call `syncDerivedDocumentFromBeats`. Derived `content` in `documents[]` can be **stale** until:

1. User opens that derived file in Text mode → [`TimelineTextEditorWorkspace`](../src/components/timeline/TimelineTextEditorWorkspace.tsx) calls `syncDerivedDocumentFromBeats(laneId)` when seeding the draft (~149–152), or  
2. User commits a derived-file save via `saveDerivedLaneFile`, which regenerates content from beats after applying edits (~807–818).

**Ambiguity:** If the user saves the project while derived file text is stale (never opened in Text mode after board edits), **persisted `documents[].content` may not match current `beats[]`** until the next sync. Canonical beat data is always `beats[]`; derived files are a serialized view.

### Derived lane file format (separate from script DSL)

Implemented in [`laneFileFormat.ts`](../src/components/timeline/beatEditor/laneFileFormat.ts). **Not** the same syntax as [`timelineScript.ts`](../src/store/timelineScript.ts).

**Generated shape** (`generateLaneFileContent`, ~31–46):

```text
id: _abc123
Title: Beat title
Synopsis: ...
Detail: ...
Date: <resolved display string via resolveBeatDate()>
- - - - - - 
```

Blocks are separated by `SEPARATOR_LINE` (`"- - - - - -"`) from [`beatDocumentModel.ts`](../src/components/timeline/beatEditor/beatDocumentModel.ts) line 4.

**Parse/write API:** `parseLaneFileContent` / `saveDerivedLaneFile` / `convertUserDocumentToLane`. Dates in lane files use **display/resolved text** (`dateSpecFromResolvedText`), not the script's structured `dateMode` / `dateRelative` fields.

**Script pane DSL** (same underlying `beats[]`, different grammar):

```130:182:src/store/timelineScript.ts
// generateTimelineScript — nested Lane { beats: [ Beat id slot: N { title: "..." ... } ] }
// Crossing lines at @declarations level
```

| Aspect | Lane file (`laneFileFormat.ts`) | Script pane (`timelineScript.ts`) |
|--------|----------------------------------|-----------------------------------|
| Scope | Single lane's beats | All lanes + crossings |
| Lane metadata | Not in file (implicit via `laneId`) | `Lane id "label" type: … sort: …` |
| Beat identity | Optional `id:` line per block | Required `Beat <id> slot: <n>` header |
| Crossings | **Not represented** | `Crossing <id> beats: a,b,…` |
| Round-trip entry | `saveDerivedLaneFile`, `convertUserDocumentToLane` | `applyScriptText` (replaces entire model) |
| Parser | `parseLaneFileContent` | `parseTimelineScript` |

**`applyScriptText`** (~1262–1275) replaces `lanes`, `beats`, `connections` only — it does **not** call `ensureDerivedDocuments` or update `documents[]`. After a script apply, derived file contents can be stale until `ensureDerivedDocuments` / `syncDerivedDocumentFromBeats` run (ensure runs on `loadTimeline` and `addLane` only today).

### Crossings in the file-division model

Crossings are **`TimelineConnectionRecord[]`** on the project payload — **not** embedded in any lane file.

```128:135:src/storage/StorageDriver.ts
export interface TimelineConnectionRecord {
  id: string;
  beatIds: string[];
  title: string;
  description: string;
  date: string;
}
```

- **Not duplicated** across lane files; `generateLaneFileContent` only serializes beats whose `laneId` matches.
- **Not owned** by either lane's derived file; they exist only in `connections[]` and in the **script pane** as top-level `Crossing` declarations.
- **Side effect on lane save:** when committing a derived lane file, beats removed from that lane are deleted from `beats[]`, and any connection referencing those beat IDs is removed ([`saveDerivedLaneFile`](../src/store/timelineStore.ts) ~765–770). Crossings are never created or edited through lane files.

A crossing beat (endpoint) appears in **its own lane's** derived file only, with that beat's fields — not as a crossing record.

### Folder / grouping above lane files

**No folder or hierarchy** exists in types or store. All documents are a **flat** `documents[]` array inside one `TimelineProjectPayload`.

UI grouping in Text mode ([`TimelineEntitiesPanel.tsx`](../src/components/timeline/TimelineEntitiesPanel.tsx) ~109–221) is presentational only:

- **Derived** — derived docs sorted by lane `sortOrder`
- **User-made** — user docs sorted by `updatedAt` desc

Project-level containment is the `.synproj` / localStorage project blob — not a nested folder tree of files.

### Text Editor workspace vs old Beat Text Editor

| | **Live: Text display mode** | **Orphan: BeatTextEditorPanel** |
|--|-----------------------------|----------------------------------|
| Entry | `displayMode === "text"` → `TimelineTextEditorWorkspace` | Not mounted |
| Primary data flow | Edit **derived** lane files ↔ `beats[]` via `saveDerivedLaneFile`; optional **user** drafts → `convertUserDocumentToLane` | Paste/structure → `createBeatsFromSegments` → append beats to picked lane |
| File list | Entities panel Derived / User-made | N/A |
| Multi-pane | Yes (split editors, unified scroll) | Single editor |
| Commit path | `TimelineScreen.commitAllDirtyDrafts` → `saveDerivedLaneFile` / `saveUserDocumentContent` before project save | In-component save via `saveDocument` |

The Text Editor is **no longer** only a freeform import tool. **Derived lane files are the first-class per-lane text representation**, bidirectionally synced on commit (with the staleness caveat above). User-made files retain the draft → convert workflow.

`importBeats` / `createBeatsFromSegments` remain in the store (~555–588) but are **only referenced from the orphaned `BeatTextEditorPanel`**.

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
| CodeMirror defaults + history | Inside Text Editor panes only |

**Not present:** Cmd+S binding, app-level undo/redo, arrow-key board navigation, dedicated crossing hotkey.

---

## Domain Model as Implemented

### Persisted project payload

[`TimelineProjectPayload`](../src/storage/StorageDriver.ts) (`version: 1`, `moduleType: "timeline"`):

| Field | Type | Notes |
|-------|------|-------|
| `timelineOrientation` | `"vertical" \| "horizontal"` | Persisted; board layout always uses vertical stacking today |
| `displayMode` | `"block" \| "text"` | Optional; defaults to `"block"` on load if absent |
| `lanes` | `TimelineLaneRecord[]` | |
| `beats` | `TimelineBeatRecord[]` | Canonical beat graph |
| `connections` | `TimelineConnectionRecord[]` | Crossings only; not in lane files |
| `importLabelPrefixes` | `string[]` | Prefix strip list for Text Editor auto-label tools |
| `documents` | `TimelineDocumentRecord[]` | **Derived lane files + user-made drafts** (see above) |
| `beatWidthPercent` | `number` | Persisted |
| `expandedBeatHeightPx` | `number` | Persisted (integer-rounded on write) |
| `beatTextScalePercent` | `number` | Persisted |

[`saveTimeline`](../src/store/timelineStore.ts) (~397–410) writes all of the above. Autosave snapshot ([`storeSnapshot`](../src/store/timelineStore.ts) ~1289–1301) includes `documents`, `importLabelPrefixes`, and display prefs — **not** the outdated “documents outside autosave snapshot” behavior from earlier reports.

### Runtime types ([`timelineTypes.ts`](../src/store/timelineTypes.ts))

**Lane**

```ts
{ id: string; label: string; laneType: string; sortOrder: number; color?: string }
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
- Documents without `kind` → treated as `"user"`.

### Session-only (in-memory, not in project payload)

`zoomLaneCount`, `beatsExpanded`, `beatPlacementMode`, `scriptPanelLayout`, `selection`, `scriptDraft`, `hasUnsavedChanges`, `isSaving`, `lastSaveError`, `autosaveEnabled` (always `true`, no UI), Text Editor **draft buffers** (`textDrafts` in `TimelineScreen` — dirty editor state before commit).

---

## Building / Editing Flows

### Working flows

1. **Create lane** — Toolbar **Lane** → appends rightmost lane, selects it, default type `character`; **`ensureDerivedDocuments`** creates matching derived file.
2. **Add story beat** — Select lane or beat, then **+ Beat** (or menu → Beat). Placement: Auto / above / below selected beat.
3. **Add anchor beat** — Beat menu → **Anchor Beat**.
4. **Edit beat/lane/crossing** — Select → Inspector (or double-click). Blur commits fields.
5. **Delete beat** — Inspector Delete, Multi-Beat panel Delete, or Delete/Backspace with beats selected. Cascades: removes connections referencing those beats. Does not auto-refresh derived file text.
6. **Delete lane** — Inspector Delete on a lane: **immediate**, no confirm dialog in Block mode. Removes beats, connections touching them, and derived doc. Text mode empty derived file → confirm → `confirmDeleteLaneFromDocument`.
7. **Reorder beats / lanes** — Drag on board.
8. **Crossing** — Multi-select ≥2 beats on distinct lanes → **Crossing** toggle. Stored in `connections[]` + script only.
9. **Bulk rename titles** — Toolbar **Rename titles** → modal.
10. **Text mode — edit derived lane file** — Open Derived file → edit → commit (`saveDerivedLaneFile`) updates `beats[]` for that lane; may remove connections if beats deleted from file.
11. **Text mode — user draft → lane** — **+ New** user file → edit → **Convert to Lane** (`convertUserDocumentToLane`); doc becomes `kind: "derived"`.
12. **Multi-beat Inspector mode** — Isolation OFF → list beats on active lane, edit one, stage slot inserts, Apply.

### View controls (toolbar, Block mode)

| Control | Works? | Persisted? |
|---------|--------|------------|
| Lane count − / + | Yes | No |
| Beat width % | Yes (+ beat edge handle) | **Yes** (`beatWidthPercent`) |
| Text size % | Yes (viewport beats only) | **Yes** (`beatTextScalePercent`) |
| Expand / Collapse beats | Yes | No |
| Expanded height px | Yes when expanded (+ top handle) | **Yes** (`expandedBeatHeightPx`) |
| Magnify tool | Yes | No |

### Disabled / gated UI (intentional)

- **+ Beat** / beat menu / **Rename titles** — disabled without a valid lane/beat target.
- **Crossing** — disabled unless selection can form a crossing (`canFormCrossing`).
- **Convert to Lane** — disabled for derived files; user files must parse cleanly and must not contain `id:` lines.
- **Commit separators** — N/A in current workspace (separator insertion via toolbar in Text mode).

### Stubbed or unused relative to blueprint

| Item | Reality |
|------|---------|
| `BeatTextEditorPanel` | **Orphaned** — not mounted; `createBeatsFromSegments` unused in live UI |
| Empty Beat / ghost beats | **Not creatable**; legacy empties stripped on load |
| Orientation toggle | Store + payload only; **no UI**; board always vertical |
| Lane-delete warning (Block mode) | **No confirm** — immediate delete |
| Undo / redo | **Not implemented** |
| Export PDF/image | **Not implemented** |
| Cross-module entity linking | **Not implemented** |
| `renameDocument` | Store action exists; **no UI** |
| Document folders | **Not implemented** |
| Live sync board → derived file text | **Not automatic** — sync on open/commit only |
| `TimelineCanvasPlaceholder` | WorkspaceShell legacy path only |

---

## Script / DSL Support

**Bidirectional** for the **whole project model**. [`timelineScript.ts`](../src/store/timelineScript.ts) + [`TimelineScriptPane.tsx`](../src/components/timeline/TimelineScriptPane.tsx).

- **Generate** from model → Code/View panes.
- **Edit** Code textarea → on blur, `applyScriptText` parses and replaces lanes/beats/connections (errors shown, draft kept on failure). **Does not update `documents[]`.**
- **Sync from canvas** resets draft from current model.
- Layout modes: Split / Code / View (`scriptPanelLayout`, session-only).
- View pane highlights lines for selected beat IDs.

Lane files use a **different parser** ([`laneFileFormat.ts`](../src/components/timeline/beatEditor/laneFileFormat.ts)) and do not participate in script blur-apply.

---

## Persistence

| Mechanism | Detail |
|-----------|--------|
| Driver | [`LocalStorageDriver`](../src/storage/StorageDriver.ts) — keys `synapse-iwe:projects:index` and `synapse-iwe:project:data:<id>` (legacy `plotmaster:` keys still read) |
| Manual Save / Reload | Top-bar [`TimelineSaveControls`](../src/components/timeline/TimelineSaveControls.tsx); Reload confirms if dirty; Text mode may require **commit drafts** first (`hasDraftChanges`) |
| Autosave | Debounced ~500ms when [`storeSnapshot`](../src/store/timelineStore.ts) changes and `hasUnsavedChanges` — includes **`documents`** |

**Saved on successful save:** `timelineOrientation`, `displayMode`, `lanes`, `beats`, `connections`, `importLabelPrefixes`, `documents`, `beatWidthPercent`, `expandedBeatHeightPx`, `beatTextScalePercent`.

**Lost on refresh (session-only):** selection, zoom lane count, beats expanded, placement mode, script panel layout, unsaved script draft, Text Editor in-memory drafts (`textDrafts`) unless committed to store via save/commit.

---

## Known Gaps vs. Blueprint

Compared to [`docs/TimelineOutliner_PhasedApproach.md`](./TimelineOutliner_PhasedApproach.md) (design intent). Status reflects **code today**.

| Blueprint item | Status in app today |
|----------------|---------------------|
| Phase 0 route + payload + IDs | **Done** |
| Phase 1 lanes/beats board, DnD, inspector, entities, script v1 | **Done** |
| Phase 2 crossings | **Done** (`connections[]`; not in lane files) |
| Per-lane text files | **Done** (derived `TimelineDocumentRecord` + `laneFileFormat.ts`) |
| Beat Text Editor as import-only side tool | **Superseded** — Text display mode + derived files; old panel orphaned |
| Document folders | **Not started** |
| Live derived-file sync from board edits | **Partial** — on open/commit only |
| Phase 3 orientation / export / undo | **Not started** (orientation field persisted, no UI) |
| Cross-module entities | **Not started** |
| WorkspaceShell timeline stub | **Still present** |

---

## Major file index

| Area | Path |
|------|------|
| Screen | `src/screens/TimelineScreen.tsx` |
| Store | `src/store/timelineStore.ts` |
| Types | `src/store/timelineTypes.ts` |
| Script DSL (project-wide) | `src/store/timelineScript.ts` |
| Lane file format (per-lane) | `src/components/timeline/beatEditor/laneFileFormat.ts` |
| Beat template / segments | `src/components/timeline/beatEditor/beatDocumentModel.ts` |
| Text Editor workspace (live) | `src/components/timeline/TimelineTextEditorWorkspace.tsx` |
| Text Editor panel (orphaned) | `src/components/timeline/beatEditor/BeatTextEditorPanel.tsx` |
| Persistence types / driver | `src/storage/StorageDriver.ts`, `src/storage/timelineIds.ts` |
| Board | `src/components/timeline/TimelineBoard.tsx`, `LaneColumn.tsx`, `BeatBlock.tsx`, … |
| Entities (Block + Text file lists) | `src/components/timeline/TimelineEntitiesPanel.tsx` |

---

*End of capabilities report.*
