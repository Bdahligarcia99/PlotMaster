# Timeline Outliner — Phased Approach

**Status:** Planning document (not yet implemented).  
**Last updated:** Consolidates product and technical decisions from design discussions.

This document describes a **timeline / story outliner** module for Synapse IWE. It is modeled after the **family tree node editor** (canvas + script + entities + inspector) but optimized for **long-form story planning**: parallel arcs (character, subplot, act, theme, etc.), **beats** along a time axis, and **crossing beats** where two arcs intersect in the narrative.

---

## 1. Vision and core metaphor

| Family tree | Timeline outliner |
|-------------|-------------------|
| People, unions, generations | **Lanes**, **beats**, **time** |
| Hierarchical / genealogical edges | **Straight** segments along a lane; **diagonal** segments for lane crossover |
| Script: persons, unions | Script: **lanes**, **beats**, **crossings** |
| Toolbar: new person / new child / union | Toolbar: **new lane** / **new beat** / **crossing beat** (same slots; see §1.1) |

**Purpose:** Give writers a **visual outline** for a novel (or other medium): multiple **lanes** = simultaneously occurring threads; **beats** = story moments along each thread; **crossing beats** = moments where two threads merge in story space (e.g. two characters meet), implemented as an **X** swap of continuity between two lanes.

**Time direction (vertical layout):** Beats stack **bottom → top**; **bottom = beginning** of the story. (Mirror rules when orientation is horizontal.)

**Orientation:** **Per project** (persisted). Determines whether **time** runs along the primary vertical or horizontal axis and where new lanes accumulate (e.g. bottom for vertical).

### 1.1 Family tree UI parity (toolbar and mental model)

The outliner **reuses the same interaction vocabulary** as the family tree so switching workspaces feels familiar. Map core actions as follows:

| Family tree control / concept | Timeline outliner behavior |
|------------------------------|---------------------------|
| **New person** | **New lane** — adds a parallel arc (character, subplot, act, theme, etc.). Same toolbar **slot** and similar icon/placement as family tree “new person” where practical. |
| **New child** | **New beat** — adds the next story moment **on** the active lane (or selected lane), stacking **up** the time axis from the beginning. Same **slot** and flow as “new child.” |
| **Union** (create partnership / connect two parents) | **Create crossing beat** — after choosing **two lanes** (or a beat on each lane as lane shorthand; see §3.2), the same **union-style** control (or equivalent **slot** in the toolbar) completes a **crossing**. Labels or tooltips in timeline mode should say **crossing** / **cross beat** while keeping **layout and muscle memory** aligned with union creation. |

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
- **`crossingPairId`:** `string | null` — see §4. When non-null, this lane is **paired** with exactly one other lane for reorder purposes.

**No fixed starter content:** Users create lanes freely (no mandatory three-act template).

**No hard limit** on lane count (practical limits from UX/performance only).

### 2.2 Beat (node)

- **Id**, **laneId**, **order** along time within that lane (or derived from position + normalized on save)
- **Properties (minimum):** **title**, **description**, **date** (story-facing; can be partial or free text early)
- Room for additional properties in later sub-phases

Script and UI refer to these as **beats**.

### 2.3 Crossing beat

- **Id**
- **Lane A** and **lane B** (the only two lanes involved in v1)
- **Timeline placement** / links to continuity: crossing **creates a new beat** (or junction) that represents the narrative intersection; exact graph representation (single node vs two anchors + junction) is an implementation detail in Phase B.
- **Multiple crossing beats** are allowed between the **same pair** of lanes (several story moments)

**v1 constraint:** Crossing is only between **two lanes**. No third lane, no A–B and B–C chains until a future “crossing v2” pass.

### 2.4 Edges

- **Within-lane:** Straight segments along the time axis between consecutive beats (where the narrative is linear on that lane).
- **Cross-lane:** **Diagonal** segments forming an **X**: after the crossing, the **series** from lane A continues on lane B and vice versa (swap of continuity). The intersection is the **crossing beat**.

---

## 3. UX parallels to family tree

Section **§1.1** defines the **toolbar mapping** (new person → lane, new child → beat, union → crossing). The subsections below spell out **selection**, **crossing creation**, and **editing** behaviors that build on that mapping.

### 3.1 Selection

| Pattern | Timeline behavior |
|--------|---------------------|
| **Click** | Select **beat** or **crossing beat**; highlight on canvas + entities |
| **Click background** | Clear selection; inspector behavior aligned with family tree conventions |
| **Entities panel** | Click **lane** or **beat** → same as canvas selection |
| **Double-click** | Focus inspector for **beat** or **lane** properties (lane: name, type, etc.) |
| **Shift+click** | **Crossing creation:** second pick completes pair (see §4.2); optional multi-select for bulk actions later |

**Lane selection:** Click **lane chrome / origin** → inspector shows **lane** fields. **Drag lane origin** to reorder (moves **pair** if `crossingPairId` is set — see §4).

### 3.2 Crossing creation (lane-centric)

- **Semantic selection** is **two lanes**, not “any two beats” as the primary concept.
- **Shorthand:** User may **click a beat** ⇒ resolve to **that beat’s lane** as the selected lane for the operation.
- Action creates a **new crossing beat** between those two lanes (plus continuity swap / X geometry per spec).
- **Primary control:** Same **toolbar slot and flow as Union** in family tree (§1.1): user resolves **lane A** and **lane B**, then activates **Union / Create crossing beat** (timeline label + tooltip as needed).

### 3.3 Delete behaviors

**Lane delete:** Warn that **all beats on that lane** (and crossing metadata tied only to that lane) will be removed; confirm.

**Beat delete modes** (expose in UI over time):

- Delete **this beat only**
- Delete **this beat and all following** on that lane’s ordered sequence

(Crossing-specific delete rules: defined in Phase B when graph structure is fixed.)

### 3.4 Reorder

- **Lanes without a pair:** Drag origin → move lane; beats follow (auto-select / layout reflow).
- **Lanes with `crossingPairId`:** **Both lanes in the pair move together**; they **cannot** be separated in reorder until all crossings between them are removed (see §4.3).

---

## 4. Crossing pair ID (`crossingPairId`)

### 4.1 Rules (v1)

- Exactly **two lanes** per crossing relationship.
- The **same two lanes** may host **many crossing beats**; they still share **one** `crossingPairId`.
- When the **first** crossing is created between lane A and B:
  - Allocate `crossingPairId = newId()`
  - Set `lane.crossingPairId = crossingPairId` on **both** A and B.
- When **additional** crossings are added between **the same** A and B: **reuse** the existing `crossingPairId` (no second pair).
- When **all** crossing beats between A and B are **removed**:
  - Clear `crossingPairId` on both lanes (they reorder independently again).

### 4.2 Invariants

- If `crossingPairId` is non-null, there is **exactly one other lane** with the same id (enforced by editor logic).
- Reorder operations **never** split a pair.

### 4.3 Future (“crossing v2”)

- Chains (A–B, B–C), hubs, or more than two lanes: likely **connected components** or **group merge/split** instead of a strict pair id. **Out of scope** for initial phases; this document preserves v1 simplicity.

---

## 5. Entities, aspects, and active workspace

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

## 6. Phased implementation

Phases are **sequential recommendations**; some overlap is possible with clear interfaces.

---

### Phase 0 — Prerequisites and integration points

**Goal:** Stable boundaries so the outliner does not fork the app structure.

- [ ] Decide project schema: **per-project orientation** storage location (alongside family tree project model).
- [ ] Stub **route / screen**: `TimelineScreen` (or equivalent) and entry from workspace shell.
- [ ] **Empty state** + “coming soon” acceptable until Phase 1 delivers canvas.
- [ ] Document **IDs**: beat id, lane id, `crossingPairId` format (UUID strings recommended).

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

**Out of scope:** Crossing beats, diagonal edges, `crossingPairId`.

**Deliverable:** Usable single-thread and multi-lane outline with linear beats only.

---

### Phase 2 — Crossing beats (pair-only, v1)

**Goal:** Two-lane crossings, X continuity, pair reorder, lane-centric selection.

- [ ] **`crossingPairId`** assignment / reuse / clear on last crossing removed.
- [ ] **Crossing beat** entity + **diagonal** edge layout (straight-line segments only, including diagonals per earlier spec).
- [ ] **Creation flow:** select **lane A** (or beat ⇒ lane A), **shift+select lane B** (or beat ⇒ lane B), then **Union / Create crossing beat** (same affordance as family tree union) → new crossing beat + topology swap.
- [ ] **Reorder:** dragging **either lane** in a pair moves **both** lanes and all beats; forbid unpairing until crossings removed.
- [ ] **Inspector** for crossing beat (title/description/date as needed).
- [ ] **Script:** encode crossings and pair id (or derive pair id from script on load); **round-trip** crossing create/delete.
- [ ] **Delete:** define behavior when deleting a crossing beat or a beat involved in a crossing (document edge cases).

**Deliverable:** Full v1 crossing model as specified; **no** three-lane or chain crossings.

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

- [ ] **Lane reorder** by dragging **lane origin** (respect **pair** moves).  
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

- More than two lanes or **chain** crossings (A–B, B–C).  
- **Group merge/split** or graph **connected components** for reorder.  
- Optional **hub** lanes.

Revisit only after v1 crossing usage is validated.

---

## 7. Testing and acceptance (cross-phase)

- **Round-trip:** Script ↔ canvas for lanes, beats, crossings, pair ids.  
- **Pair reorder:** Two paired lanes always move together; clearing last crossing clears pair id.  
- **Regression:** Family tree scene and profile editor unchanged when timeline flag is off.  
- **Orientation:** Switch orientation does not lose beats; order and pair invariants preserved.

---

## 8. Open items (to refine during Phase 1–2)

- Exact **internal graph** for a crossing beat (single junction node vs multiple nodes).  
- **Date** field format (ISO vs fuzzy story labels).  
- **Script grammar** final tokens (`@lane`, `@beat`, `@crossing`, …).  
- Whether **beats** store **absolute flow coordinates** or **only logical order** + layout engine.  
- **Accessibility:** keyboard nav along lane order.

---

## 9. Document maintenance

When implementation starts, add:

- Links to ADRs or PRs per phase.  
- “Implemented in vX.Y” checkmarks next to deliverables.

---

*End of phased approach document.*
