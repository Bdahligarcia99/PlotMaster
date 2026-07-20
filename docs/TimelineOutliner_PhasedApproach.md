# Timeline Outliner — Phased Approach

**Status:** Planning document (not yet implemented).  
**Last updated:** Consolidates product and technical decisions from design discussions.

This document describes a **timeline / story outliner** module for Synapse IWE. It is modeled after the **family tree node editor** (canvas + script + entities + inspector) but optimized for **long-form story planning**: parallel arcs (character, subplot, act, theme, etc.), **beats** along a time axis, and **crossing connectors** that link two existing beats where two arcs intersect in the narrative.

---

## 1. Vision and core metaphor

| Family tree | Timeline outliner |
|-------------|-------------------|
| People, unions, generations | **Lanes**, **beats**, **time** |
| Hierarchical / genealogical edges | **Straight** segments along a lane; **connector** links between two beats on different lanes |
| Script: persons, unions | Script: **lanes**, **beats**, **crossings** |
| Toolbar: new person / new child / union | Toolbar: **new lane** / **new beat** / **crossing connector** (same slots; see §1.1) |

**Purpose:** Give writers a **visual outline** for a novel (or other medium): multiple **lanes** = simultaneously occurring threads; **beats** = story moments along each thread; **crossing connectors** = additive links between two existing beats where two threads intersect in story space (e.g. two characters meet at the same moment). Crossing connectors do **not** swap a beat's lane or continuity as an automatic side effect of connecting (mirrors family tree **Union** nodes: purely additive, endpoints unchanged). Manually **dragging** a beat block to a different lane is a separate, deliberate user action and is allowed — it is unrelated to, and does not reintroduce, the old automatic continuity-swap behavior.

**Rendering model:** Lanes and beats are **not** graph nodes with pixel positions (unlike the family tree canvas). A **lane** is a literal **snap area** — a Kanban-style column beats stack inside — and a **beat** is a draggable **block** that snaps into stack slots within its lane (reordered or moved to another lane via drag-and-drop). A **crossing connector** is drawn as an **SVG overlay line** between two beat blocks; it is a data record and a rendered line, never a graph node/hub that the beats attach to.

**Time direction (vertical layout):** Beats stack **bottom → top**; **bottom = beginning** of the story, at the lane's "starting gate" (see the race-track viewport model in Phase 1).

**Orientation:** **Per project** (persisted). Determines whether **time** runs along the primary vertical or horizontal axis and where new lanes accumulate (e.g. bottom for vertical).

### 1.1 Family tree UI parity (toolbar and mental model)

The outliner **reuses the same interaction vocabulary** as the family tree so switching workspaces feels familiar. Map core actions as follows:

| Family tree control / concept | Timeline outliner behavior |
|------------------------------|---------------------------|
| **New person** | **New lane** — adds a parallel arc (character, subplot, act, theme, etc.). Same toolbar **slot** and similar icon/placement as family tree “new person” where practical. |
| **New child** | **New beat** — adds the next story moment **on** the active lane (or selected lane), stacking **up** the time axis from the beginning. Same **slot** and flow as “new child.” |
| **Union** (create partnership / connect two parents) | **Create crossing connector** — after choosing **two beats** (typically one on each lane; see §3.2), the same **union-style** control (or equivalent **slot** in the toolbar) completes a **crossing**. Labels or tooltips in timeline mode should say **crossing** / **cross beat** while keeping **layout and muscle memory** aligned with union creation (select two nodes → Union). |

**Principles:**

- **Toolbar grouping** (order of controls) should match family tree (e.g. add lane, add beat, union/crossing, then shared tools like save/export if present).
- **Dropdowns** that exist on family tree (e.g. union type) may gain **timeline-specific** options later, but the **pattern** (split button, chevron menu) should feel the same.
- **Inspector + entities panel + script pane** triad mirrors family tree architecture; copy **selection**, **double-click opens detail**, and **Shift+click** patterns from §3.

When wording would confuse (e.g. “person” vs “lane”), use **subtitle text**, **tooltips**, or **module-specific labels** while preserving **control order and iconography** family.

---

## 2. Domain model (v1)

### 2.1 Lane

- **Id**, **label**
- **Lane type:** Suggested presets (e.g. character, act, theme, subplot) plus **user-defined** custom types (string or enum + custom list)
- **Sort order** / index among lanes (for display and reorder)

**No fixed starter content:** Users create lanes freely (no mandatory three-act template).

**No hard limit** on lane count (practical limits from UX/performance only).

### 2.2 Beat (node)

- **Id**, **laneId**, **order** along time within that lane (or derived from position + normalized on save)
- **Properties (minimum):** **title**, **description**, **date** (story-facing; can be partial or free text early)
- Room for additional properties in later sub-phases

Script and UI refer to these as **beats**.

### 2.3 Crossing connector

A **crossing connector** is a distinct data record — analogous in *intent* to a family tree **Union** node (an additive, selectable link) — but it is **never rendered as a graph node/hub**. It is a plain record referencing two beat ids, drawn as an **SVG overlay line** directly between the two beat blocks.

- **Id**
- **`beatIdA`**, **`beatIdB`** — references to two **existing** beats (each remains on its own lane with its own order)
- **Properties (optional):** **title**, **description**, **date** (story-facing metadata for the intersection moment)
- **Multiple crossing connectors** are allowed between the **same pair** of lanes (several story moments at different beats)

**v1 constraint:** Each connector links exactly **two beats**. Creating or deleting a connector never moves a beat between lanes or changes its order — that only happens via an explicit drag (see §1's "Rendering model" and §3.4).

**Future (“crossing v2”):** A single connector joining **more than two** beats/lanes at once. Chain crossings on different beat pairs (A–B, B–C) already work naturally in v1 because each connector is independent.

### 2.4 Edges

- **Within-lane:** Sequencing is **implicit DOM order** — beats simply stack in array order inside their lane's column; there is no explicit "edge" record between consecutive beats on the same lane.
- **Cross-lane:** Crossing connectors are **rendered**, not modeled, as edges — an SVG line computed on the fly between the two linked beat blocks' current positions (recomputed on drag/resize/reorder). Each lane's own stack order continues independently, **unaffected** by connectors (mirrors family tree: partner edges do not reroute a person's own parent/child edges).

---

## 3. UX parallels to family tree

Section **§1.1** defines the **toolbar mapping** (new person → lane, new child → beat, union → crossing). The subsections below spell out **selection**, **crossing creation**, and **editing** behaviors that build on that mapping.

### 3.1 Selection

| Pattern | Timeline behavior |
|--------|---------------------|
| **Click** | Select **beat** or **crossing connector**; highlight on canvas + entities |
| **Click background** | Clear selection; inspector behavior aligned with family tree conventions |
| **Entities panel** | Click **lane** or **beat** → same as canvas selection |
| **Double-click** | Focus inspector for **beat**, **lane**, or **crossing connector** properties |
| **Shift+click** | **Crossing creation:** second beat pick completes pair (see §3.2); optional multi-select for bulk actions later |

**Lane selection:** Click the lane's **name label** at the base of the viewport (its "starting gate") → inspector shows **lane** fields. Connector lines redraw live to wherever the linked beats currently sit.

### 3.2 Crossing creation (beat-centric)

- **Semantic selection** is **two existing beats**, matching the family tree Union flow (select two person nodes → Union).
- Beats are typically on **different lanes** (same-lane connectors are allowed but uncommon).
- Action creates a **crossing connector** record with a line drawn to both beats — **purely additive**; neither beat moves lanes or changes order.
- **Toggle:** Re-selecting the same two already-connected beats and activating the **Crossing** control again **removes** that connector (toggle off), rather than creating a duplicate.
- **Primary control:** Same **toolbar slot and flow as Union** in family tree (§1.1): user selects **beat A** and **beat B**, then activates **Union / Create crossing connector** (timeline label + tooltip as needed).

### 3.3 Delete behaviors

**Lane delete:** Warn that **all beats on that lane** (and any crossing connectors whose endpoints reference those beats) will be removed; confirm.

**Beat delete modes** (expose in UI over time):

- Delete **this beat only**
- Delete **this beat and all following** on that lane’s ordered sequence

**Crossing connector delete:** Mirrors family tree union delete — removing the connector deletes only the connector record and its line; **both beats remain** on their lanes. Deleting a beat that is an endpoint removes that connector (and its line) as well. The **toggle-off** flow in §3.2 (re-select the same two beats and activate **Crossing** again) is a faster alternative to selecting the connector line/marker and deleting it via the Inspector.

### 3.4 Reorder

- **Beats:** Drag-and-drop a beat block to reorder it within its own lane's stack, **or** drop it into a different lane's stack (an explicit, deliberate move — see §1's "Rendering model"). Order is renormalized on both the source and destination lane.
- **Lanes:** Drag a lane's **starting gate** label to reorder lanes (see Phase 1); beats and connector lines follow the new column order.
- **Crossing connectors:** No special reorder rules — the connector line redraws between wherever the two linked beats currently sit, including immediately during a drag (same spirit as family tree edges reflowing when a person node moves).

---

## 4. Entities, aspects, and active workspace

**Long-term:** One **entity** (e.g. a character) has **multiple aspects**:

- **Profile / character** aspect (attributes, bio)
- **Family-tree** aspect (person node, unions, roles)
- **Timeline** aspect (lane membership, beat references, dates along arcs)

**Active workspace** determines how the **entities panel** behaves:

| Workspace | Panel emphasis |
|-----------|----------------|
| **Family tree** | Entities relevant to **people nodes**; actions place/link people on the tree |
| **Profiles** | **Character** editing; load shared fields (name, birthday, gen, etc.) |
| **Timeline** | **Story/arc** entities; **character aspect** when entity originated elsewhere; lanes/beats navigation |

**Filtering:** Show **only entities (and rows) relevant** to the current module; treat selections according to that module’s actions.

**Shared fields:** Attributes such as **name, birthday, gen,** etc. are **linked** across modules (single canonical source per field where possible; conflict rules TBD). Profiles can surface data created in family tree or timeline and vice versa.

**Implementation note:** Early phases may scope entities to **timeline-only** types; **unified cross-module entity host** can land in a later phase without blocking the outliner MVP.

---

## 5. Phased implementation

Phases are **sequential recommendations**; some overlap is possible with clear interfaces.

---

### Phase 0 — Prerequisites and integration points

**Goal:** Stable boundaries so the outliner does not fork the app structure.

- [x] Decide project schema: **per-project orientation** storage location (alongside family tree project model).
- [x] Stub **route / screen**: `TimelineScreen` (or equivalent) and entry from workspace shell.
- [x] **Empty state** + “coming soon” acceptable until Phase 1 delivers canvas.
- [x] Document **IDs**: beat id, lane id, crossing connector id format (UUID strings recommended).

**Deliverable:** Placeholder screen + saved project fields for `timelineOrientation`.

**Implemented in:** `StorageDriver` (`TimelineProjectPayload`), `timelineStore`, `/timeline/:projectId` → `TimelineScreen`, `src/storage/timelineIds.ts`.

---

### Phase 1 — Lanes and beats (no crossings)

**Goal:** Vertical-first board using **DOM lane columns + dnd-kit sortable beat blocks** (not React Flow / graph nodes — see §1's "Rendering model"), store, basic layout.

- [x] **`timelineStore`**: lanes array, beats array, CRUD, **order** within lane, **bottom = start** layout convention.
- [x] **Board:** lanes as **droppable DOM columns** (Kanban-style snap areas, one `DndContext` for the whole board); beats as **`useSortable` blocks** stacked (`flex-direction: column-reverse`) along the time axis — no pixel x/y, no graph edges between consecutive beats (sequencing is implicit array order, per §2.4).
- [x] **Race-track viewport model:** a **zoom stepper** (discrete steps, e.g. 3/4/5/6/8/10/12 — same interaction pattern as the family tree export-guide scale stepper) sets a target visible-lane-count `N`. Lane column width = `viewportWidth / min(N, actualLaneCount)`. While `actualLaneCount <= N`, lanes evenly fill the full viewport width with **no horizontal scroll**; once `actualLaneCount > N`, lanes render at the fixed zoomed width (`viewportWidth / N`) and **horizontal scroll** reveals the rest. **Vertical** is the only unbounded expansion axis, scrolling all lane columns together in one shared container so beats at the same stack position line up horizontally across lanes. Each lane's **name** is pinned at the base of the viewport (its "starting gate") — always visible regardless of scroll position — with new beats appearing directly above it and stacking upward as the story progresses.
- [x] **Toolbar (family tree parity, §1.1):** **New person** slot → **new lane**; **New child** slot → **new beat**; place **Union** slot as disabled until Phase 2 — implement **lane + beat** actions plus the **zoom stepper** in this phase.
- [x] **Create lane** — new lane appears at the **accumulation edge** (rightmost column); triggered from the **new lane** control.
- [x] **Create beat** — add beat to selected lane (or default lane); triggered from the **new beat** control; titles on blocks.
- [x] **Drag-and-drop:** a beat block can be reordered within its own lane **or** dropped into a different lane (explicit manual action — see §1's relaxed drag rule); dnd-kit multi-container drag (`DndContext` + per-lane `SortableContext`).
- [x] **Lane reorder:** drag a lane's **starting gate** label to reorder lanes horizontally; beats stay on their lane and connector lines reflow with the new column order.
- [x] **Inspector:** **Lane** — label, **lane type** (preset + custom). **Beat** — title, description, date.
- [x] **Entities panel (timeline mode):** tree **Lanes → Beats**; click to select.
- [x] **Script v1:** serializable **declarations** for lanes and beats + `@timeline` body; **round-trip** lane/beat create/rename/order.

**Out of scope:** Crossing connectors, cross-lane connector lines.

**Deliverable:** Usable single-thread and multi-lane outline with linear, drag-reorderable beats and a bounded, zoomable race-track viewport.

**Implemented in:** `timelineStore`, `TimelineBoard`, `LaneColumn`, `BeatBlock`, `TimelineToolbar`, `TimelineInspector`, `TimelineEntitiesPanel`, `TimelineScriptPane`, `timelineScript.ts`.

---

### Phase 2 — Crossing connectors (v1)

**Goal:** Additive connectors linking two existing beats across lanes, mirroring family tree Union behavior — rendered as SVG lines, never as graph nodes.

- [x] **Crossing connector** record (`beatIdA`, `beatIdB` + optional title/description/date) + an **`SVG ConnectorOverlay`** line between the two beat blocks (no continuity swap, no beat lane changes, no hub node).
- [x] **Creation flow:** select **beat A**, **shift+select beat B**, then the **Crossing** toolbar control (same slot/affordance as family tree Union) → new connector + line drawn between both beats.
- [x] **Inspector** for crossing connector (title/description/date, delete).
- [x] **Script:** encode connectors as `Crossing <id> a: <beatIdA> b: <beatIdB> [title/description/date]`; **round-trip** connector create/delete.
- [x] **Delete:** deleting a connector removes only the connector record and its line; both beats remain. Deleting a beat removes any connectors that reference it.

**Deliverable:** Crossing connectors linking any two beats across lanes, purely additive — no lane-continuity changes.

**Implemented in:** `ConnectorOverlay`, `timelineStore` (`addConnection`/`updateConnection`/`removeConnection`), `timelineScript.ts`, `TimelineToolbar`, `TimelineInspector`, `TimelineEntitiesPanel` (Crossings list).

---

### Phase 3 — Orientation and polish

**Goal:** Per-project **horizontal / vertical** time axis; layout reflow.

- [ ] Persist **orientation** on project.
- [ ] **Toggle UI** reflows: time axis and lane accumulation edge flip; **positions** recomputed or stored in logical order only.
- [ ] **Export** (optional): PDF or image of timeline (reuse patterns from family tree export if applicable).
- [ ] **Performance:** many beats per lane; virtualize list in entities if needed.

**Deliverable:** Orientation is a first-class project setting.

---

### Phase 4 — Lane operations and beat delete modes

**Goal:** Production-grade editing.

- [ ] **Lane delete** with **warning** and cascade delete beats.  
- [ ] **Beat delete modes:** this node only vs this + **all following** on lane.  
- [ ] **Undo/redo** (if app-wide pattern exists, hook timeline store).

**Deliverable:** Safer bulk operations aligned with user spec.

---

### Phase 5 — Entities panel and cross-module aspects (incremental)

**Goal:** Align with **workspace-aware** entities and shared attributes.

- [ ] **Module switch:** entities panel **filters** and **actions** by active workspace (family tree / profiles / timeline).  
- [ ] **Timeline:** use **character aspect** for lanes tied to existing profile entities (when IDs exist).  
- [ ] **Shared fields:** read/write **name, birthday, gen**, etc., from a **single entity host** (may require refactors to existing profile/tree stores).  
- [ ] **Link projects / multi-module projects** (from roadmap): defer heavy lifting to a dedicated phase; stub **entity id** on lanes/beats where needed.

**Deliverable:** First vertical slice of “one entity, many aspects” without requiring full multi-module project composer.

---

### Phase 6 — Crossing v2 (future)

**Scope (not detailed here):**

- A single connector joining **more than two** beats/lanes at once (hub with 3+ links).

Chain crossings on different beat pairs (A–B, B–C) already work in v1 because each connector is independent. Revisit multi-endpoint hubs only after v1 connector usage is validated.

---

## 6. Testing and acceptance (cross-phase)

- **Round-trip:** Script ↔ canvas for lanes, beats, and crossing connectors.  
- **Connector independence:** Reordering either lane never affects the other lane’s beat order or the connector’s endpoints; only the rendered edge path changes.  
- **Regression:** Family tree scene and profile editor unchanged when timeline flag is off.  
- **Orientation:** Switch orientation does not lose beats; lane order and connector references preserved.

---

## 7. Open items (to refine during Phase 3+)

- ~~Visual style for the crossing connector hub~~ — **resolved:** plain `SVG` line with a small clickable midpoint marker, no intermediate node (see §2.3).
- ~~Whether beats store absolute flow coordinates or only logical order~~ — **resolved:** beats store **only** `laneId` + logical `order`; there are no pixel coordinates — lane column width and beat position are derived at render time from the zoom stepper and DOM stacking order (see Phase 1's race-track viewport model).
- **Date** field format (ISO vs fuzzy story labels).
- **Script grammar** review: current tokens are `Lane`, `Beat`, `Crossing` inside the `@declarations`/`@timeline` sections (see `timelineScript.ts`); revisit naming once entities/aspects (Phase 5) land.
- **Accessibility:** keyboard nav along lane order (dnd-kit `KeyboardSensor` is wired for drag; broader keyboard navigation of the board itself is still open).

---

## 8. Document maintenance

When implementation starts, add:

- Links to ADRs or PRs per phase.  
- “Implemented in vX.Y” checkmarks next to deliverables.

---

*End of phased approach document.*
