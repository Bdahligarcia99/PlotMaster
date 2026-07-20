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

**Purpose:** Give writers a **visual outline** for a novel (or other medium): multiple **lanes** = simultaneously occurring threads; **beats** = story moments along each thread; **crossing connectors** = additive links between two existing beats where two threads intersect in story space (e.g. two characters meet at the same moment). Each lane keeps its own beat sequence — connectors do **not** move beats between lanes or swap continuity (mirrors family tree **Union** nodes: purely additive, endpoints unchanged).

**Time direction (vertical layout):** Beats stack **bottom → top**; **bottom = beginning** of the story. (Mirror rules when orientation is horizontal.)

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

A **crossing connector** is a distinct entity (hub node), analogous to a family tree **Union** node — not a beat that replaces or absorbs the two endpoints.

- **Id**
- **`beatIdA`**, **`beatIdB`** — references to two **existing** beats (each remains on its own lane with its own order)
- **Properties (optional):** **title**, **description**, **date** (story-facing metadata for the intersection moment)
- **Multiple crossing connectors** are allowed between the **same pair** of lanes (several story moments at different beats)

**v1 constraint:** Each connector links exactly **two beats**. Beats are never moved between lanes as a result of creating or deleting a connector.

**Future (“crossing v2”):** A single connector joining **more than two** beats/lanes at once (hub with 3+ links). Chain crossings on different beat pairs (A–B, B–C) already work naturally in v1 because each connector is independent.

### 2.4 Edges

- **Within-lane:** Straight segments along the time axis between consecutive beats (where the narrative is linear on that lane).
- **Cross-lane:** Connector edges from each linked **beat** to the **crossing connector hub** (or direct beat-to-beat links if implementation chooses no hub node — see §7). Each lane’s own straight-line sequence continues on its own lane, **unaffected** by connectors (mirrors family tree: partner edges do not reroute a person’s own parent/child edges).

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

**Lane selection:** Click **lane chrome / origin** → inspector shows **lane** fields. **Drag lane origin** to reorder; beats follow (auto-select / layout reflow). Connector edges redraw to wherever the linked beats currently sit.

### 3.2 Crossing creation (beat-centric)

- **Semantic selection** is **two existing beats**, matching the family tree Union flow (select two person nodes → Union).
- Beats are typically on **different lanes** (same-lane connectors are allowed but uncommon).
- Action creates a **crossing connector** hub with edges to both beats — **purely additive**; neither beat moves lanes or changes order.
- **Primary control:** Same **toolbar slot and flow as Union** in family tree (§1.1): user selects **beat A** and **beat B**, then activates **Union / Create crossing connector** (timeline label + tooltip as needed).

### 3.3 Delete behaviors

**Lane delete:** Warn that **all beats on that lane** (and any crossing connectors whose endpoints reference those beats) will be removed; confirm.

**Beat delete modes** (expose in UI over time):

- Delete **this beat only**
- Delete **this beat and all following** on that lane’s ordered sequence

**Crossing connector delete:** Mirrors family tree union delete — removing the connector deletes only the connector node and its edges; **both beats remain** on their lanes. Deleting a beat that is an endpoint removes that connector (and its edges) as well.

### 3.4 Reorder

- **Lanes:** Drag origin → move lane independently; beats follow (auto-select / layout reflow).
- **Crossing connectors:** No special reorder rules — connector edges redraw between wherever the two linked beats currently sit (same as family tree edges reflowing when a person node moves).

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

- [ ] Decide project schema: **per-project orientation** storage location (alongside family tree project model).
- [ ] Stub **route / screen**: `TimelineScreen` (or equivalent) and entry from workspace shell.
- [ ] **Empty state** + “coming soon” acceptable until Phase 1 delivers canvas.
- [ ] Document **IDs**: beat id, lane id, crossing connector id format (UUID strings recommended).

**Deliverable:** Placeholder screen + saved project fields for `timelineOrientation`.

---

### Phase 1 — Lanes and beats (no crossings)

**Goal:** Vertical-first canvas mirroring family tree patterns: React Flow (or shared graph layer), store, basic layout.

- [ ] **`timelineStore`**: lanes array, beats array, CRUD, **order** within lane, **bottom = start** layout convention.
- [ ] **Canvas:** lanes as horizontal **strips** or columns; beats as **nodes** stacked along time axis; **straight edges** only between consecutive beats on a lane.
- [ ] **Toolbar (family tree parity, §1.1):** **New person** slot → **new lane**; **New child** slot → **new beat**; place **Union** slot as disabled or hidden until Phase 2, or show “Crossing (coming soon)” — implement **lane + beat** actions in this phase.
- [ ] **Create lane** — new lane appears at **accumulation edge** (e.g. bottom for vertical time-up); triggered from the **new lane** control.
- [ ] **Create beat** — add beat to selected lane (or default lane); triggered from the **new beat** control; titles on nodes.
- [ ] **Inspector:** **Lane** — label, **lane type** (preset + custom). **Beat** — title, description, date.
- [ ] **Entities panel (timeline mode):** tree **Lanes → Beats**; click to select.
- [ ] **Script v1:** serializable **declarations** for lanes and beats + `@timeline` body (exact grammar TBD in Phase 1 tick); **round-trip** lane/beat create/rename/order.

**Out of scope:** Crossing connectors, cross-lane connector edges.

**Deliverable:** Usable single-thread and multi-lane outline with linear beats only.

---

### Phase 2 — Crossing connectors (v1)

**Goal:** Additive connectors linking two existing beats across lanes, mirroring family tree Union behavior.

- [ ] **Crossing connector** entity (hub node) + **connector edges** to two beats (no continuity swap, no beat lane changes).
- [ ] **Creation flow:** select **beat A**, **shift+select beat B** (or multi-select equivalent), then **Union / Create crossing connector** (same affordance as family tree union) → new connector hub + edges to both beats.
- [ ] **Inspector** for crossing connector (title/description/date as needed).
- [ ] **Script:** encode connectors with two beat-id references; **round-trip** connector create/delete.
- [ ] **Delete:** deleting a connector removes only the connector and its edges; both beats remain. Deleting a beat removes any connectors that reference it.

**Deliverable:** Crossing connectors linking any two beats across lanes, purely additive — no lane-continuity changes.

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

- [ ] **Lane reorder** by dragging **lane origin** (lanes move independently; connector edges reflow).
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

## 7. Open items (to refine during Phase 1–2)

- **Visual style** for the crossing connector hub (dedicated node like `UnionNode`, vs. a plain edge with no intermediate node).  
- **Date** field format (ISO vs fuzzy story labels).  
- **Script grammar** final tokens (`@lane`, `@beat`, `@crossing`, …).  
- Whether **beats** store **absolute flow coordinates** or **only logical order** + layout engine.  
- **Accessibility:** keyboard nav along lane order.

---

## 8. Document maintenance

When implementation starts, add:

- Links to ADRs or PRs per phase.  
- “Implemented in vX.Y” checkmarks next to deliverables.

---

*End of phased approach document.*
