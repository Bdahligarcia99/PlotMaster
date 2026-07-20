# Synapse IWE — Capabilities Report

**Version:** 2.5.0 (alpha)  
**Last updated:** June 27, 2026  
**Purpose:** A consolidated reference of what Synapse IWE can do today, what is partially built, and what is planned across all writing modules.

---

## 1. Product Overview

Synapse IWE is a modular **writing tools** application for story planning and character development. It is built around **visual thinking** (graph canvases, charts, outlines) plus an optional **deterministic script layer** for power users.

**Design philosophy**

- Start messy (freeform), evolve toward structure (declared entities, cross-module links).
- UI-first: writers can work entirely through panels and canvases without touching script.
- Module workspaces share a common layout vocabulary (entities panel, canvas, inspector, script pane).

**Target feel:** A precision narrative engineering tool that also works like a visual thinking lab.

---

## 2. Module Status at a Glance

| Module | UI label | Availability | Maturity |
|--------|----------|--------------|----------|
| Family Tree | Family Tree | Available | **Production-ready core** — richest feature set |
| Character Profiles | Characters / Profiles | Available | **Functional core** — chart editor, templates, script sync |
| Timeline Outliner | Timeline Outliner | Available (shell) | **Placeholder canvas** — detailed phased plan exists |
| Ideas Playground | Ideas Playground | Available (shell) | **Placeholder canvas** — spec in blueprint only |
| Image Playground | Image Playground | Not available | **Registered only** — coming soon |

---

## 3. Application Platform

### 3.1 Implemented today

| Capability | Details |
|------------|---------|
| **Web app** | Vite + React; runs in the browser |
| **Desktop app** | Tauri wrapper (`npm run desktop`); supports opening projects in new windows |
| **Project launcher** | Intro dialog at launch: create projects, open recents, delete projects |
| **Standalone workspaces** | One module per workspace (Family Tree, Profiles, Timeline, Ideas) |
| **Modular projects** | Optional “master project” that links multiple module workspaces via a project dashboard |
| **Persistence** | Family Tree: storage driver (localStorage, Tauri-ready interface). Profiles: localStorage per project. Other modules: in-memory / stub |
| **Universal UI shell** | Shared TopBar, entities panel, inspector, resizable script pane, dark theme |
| **Versioning policy** | New modules bump major version; minor/patch for improvements within current module set |

### 3.2 Planned (platform)

| Capability | Details |
|------------|---------|
| **Unified project script** | Single `@declare` + module sections (`@profiles`, `@family_tree`, `@timeline`, `@ideas`) for entire master projects |
| **Cross-module entity pool** | One entity with multiple “aspects” (profile, family-tree person, timeline lane/beat) |
| **Shared field linking** | Name, birthday, generation, etc. synced across modules from a canonical source |
| **Global search & settings** | Stubs on home screen in original blueprint |
| **Module enable/disable** | Hide module in dashboard without deleting data; re-enable restores |
| **Full graph engine** | Internal “everything is a node” model with typed edges and module-specific views |
| **Undo/redo** | App-wide pattern (where not yet wired per module) |

---

## 4. Family Tree

**Purpose:** Visual genealogy for biological and relational structures — usable as a standalone tree builder or (eventually) as part of a linked master project.

### 4.1 Implemented capabilities

#### Canvas & interaction

- React Flow canvas with **pan** (Space + drag), **zoom**, fit view, and lock
- **Person nodes** and **union nodes** (`<=>`)
- **Manual drag** positioning with optional **snap to grid**
- **Marquee selection** (shortcut: `M`) with add/subtract modifiers
- Single, multi, and range selection (sidebar and canvas)
- **Double-click** inline name editing on canvas
- Connection handles for partners (person → union) and children (union → person)

#### Building the tree

- **Add Person** — plain or assigned to a generation anchor
- **Create Union** — between exactly two selected people (forward unions: parents above children)
- **Backward unions** — start from children, add parents above over time
- **Add Child** to selected union; optional **persist union selection** after adding
- **Add Parent** to incomplete backward unions
- **Partner swap** (left/right order) in inspector and toolbar
- **Parent roles** — father / mother assignment per union slot
- **Sort** — automatic layout: align partners, center unions, space children, prevent overlap
- Sort alignment options for single-child and 3+ children rows

#### Person model

- **First, middle, last name** fields with smart display-name resolution
- **Nicknames** (comma-separated)
- **Notes** per person and per union
- **Unknown placeholders** (`?`, `???`) and auto **“Unknown N”** labels for unnamed persons
- **Review suggestions** modal — batch apply inferred names and roles (e.g. Mr./Mrs., father/mother)

#### Generation system

- **Generation anchors** — horizontal bands for organizing persons by depth
- Add/remove anchors; custom labels on ruler (letters, numbers, or both)
- Assign persons to anchors; **generation inheritance** indicator
- **Family depth** computed via parent → child traversal (distinct from sociological generation labels — see planned)

#### Navigation & organization

- **Left sidebar (entities)** — family units (union + partners + children), unlinked persons
- Collapse/expand family units in sidebar
- Click to select; Shift/Ctrl/Cmd modifiers for range and multi-select
- Inspector links to **parents** and **siblings**

#### Script pane

- **Generated script view** from current tree (canonical DSL format)
- Layout modes: Split / Code / View
- **Compact declarations** toggle
- Copy to clipboard
- Code editor: **read-only placeholder** (“Code editor coming soon”) — no two-way parse yet

#### Persistence & export

- **Save / Reload** with unsaved-changes confirmation
- **Autosave** toggle
- Project rename inline in top bar
- **PDF export** — current view or clean layout; options for notes and generation bands
- **Script export** from export dialog

#### Developer / debug overlays

- Node info overlay (coordinates, center, size, spacing between two selected nodes)

### 4.2 Planned capabilities (Family Tree)

| Area | Planned feature |
|------|-----------------|
| **Script** | Two-way sync: edit script → update canvas; live parse |
| **Script** | Link person nodes to declared Character Profile entities in master projects |
| **Layout** | Clean Up vs Free Organize modes as explicit user modes |
| **Layout** | Per-union child layout: Row vs **Cluster** (grid/circle packing) |
| **Union types** | Active, divorced, separated, affair, adoptive — with edge styles and legend |
| **Branch visibility** | Collapse/expand branches **on canvas** (sidebar collapse exists today); descendant count badges |
| **Navigation** | Search by name; jump to node |
| **Generations** | **Formal generation tagging** (Boomer, Gen X, etc.) separate from depth generation |
| **Export** | Optional legend in PDF; export polish after layout stabilizes |
| **Integration** | Shared entity pool and unified project script when attached to master project |
| **Deferred** | AI auto-layout, medical/biological metadata, complex inheritance, cross-project entity merge |

---

## 5. Character Profiles (Profile Builder)

**Purpose:** Capture character identity and structured detail through customizable chart layouts. Designed to support developmental **states by era** in a future phase.

### 5.1 Implemented capabilities

#### Characters & structure

- **Add/remove characters** per project
- **Hierarchical sections** — heading levels H1 through H4 with nesting
- **Content blocks** per section:
  - **Note** — free text
  - **Attributes** — key/value pairs with ordering
  - **Image** — optional label and URL (or paste)
- **Drag-and-drop** reorder for sections and content blocks
- Section collapse in chart editor

#### Attribute system

- Types: **text**, **number**, **number scroll**, **select**, **date**, **custom**
- Per-key metadata: options list, min/max/step, allow custom values on selects
- **Custom data types** defined at template level (named option lists)
- **Builtin data types** via script (`@builtin` lines)

#### Layout modes

| Mode | Behavior |
|------|----------|
| **Fill** | Edit character values in the chart layout |
| **Edit layout** | Restructure the selected character’s sections/blocks |
| **Create layout** | Design a new template from scratch |

#### Chart presentation

- **List layout** — H2 sections stacked vertically
- **Grid layout** — H2 sections in columns (disabled during comparison mode)
- **Comparison mode** — Shift+click second character; side-by-side read-only view

#### Templates

- **Save layout** from a character as a named template
- **Load template** onto a character: **Replace** (one-time copy) or **Link** (layout driven by template)
- **Linked characters** sync structure when template is updated
- **Manage templates** — rename, delete, edit template in create-layout mode
- Template modal: save / load / manage flows

#### Script pane

- **Bidirectional sync** for Profiles module
- `@profiles` DSL: characters, sections, notes, attributes, images, custom/builtin types
- Editable code pane with **Run** to apply parsed script to store
- Generated view with compact declarations option
- Smart indent on new lines
- Parse errors surfaced in UI

#### Persistence

- Characters and templates stored in **localStorage** per project ID

### 5.2 Planned capabilities (Profiles)

| Area | Planned feature |
|------|-----------------|
| **States by era** | Time-scoped character states (beliefs, emotional baseline, relationships, physical changes) — core blueprint feature, not yet built |
| **Inspector panel** | Currently a stub; planned wiring to selected character fields (name, backstory, labels) |
| **Linked templates** | **Option B** (deferred): editable layouts for linked characters — fork, local overrides, or propose-to-template |
| **Cross-module** | Link profile entities to family tree persons and timeline beats |
| **Timeline integration** | Optional state nodes referenced on timeline lanes |
| **Master project** | Profiles section in unified project script with `@declare` entity front-loading |

---

## 6. Timeline Outliner

**Purpose:** Visual story outline for long-form planning — parallel **lanes** (arcs, characters, subplots), **beats** along a time axis, and **crossing beats** where two lanes intersect.

**Current status:** Workspace shell only (entities panel, inspector stub, script stub, placeholder canvas). Full product spec lives in `docs/TimelineOutliner_PhasedApproach.md`.

### 6.1 Planned domain model (v1)

| Concept | Description |
|---------|-------------|
| **Lane** | Parallel story thread (character, act, theme, subplot, or custom type) |
| **Beat** | Story moment on a lane — title, description, date (story-facing) |
| **Crossing beat** | Intersection of **two lanes** — continuity swaps (X topology) |
| **Time direction** | Bottom = story beginning, beats stack upward (mirrored for horizontal orientation) |
| **crossingPairId** | Pairs two lanes for reorder; cleared when all crossings between them are removed |

### 6.2 Planned UX (mirrors Family Tree)

| Family Tree control | Timeline equivalent |
|--------------------|---------------------|
| New person | **New lane** |
| New child | **New beat** on active lane |
| Union | **Create crossing beat** between two lanes |

Shared patterns: entities panel, inspector, script pane, Shift+click for crossing pair selection, lane reorder by dragging origin (paired lanes move together).

### 6.3 Phased implementation plan

| Phase | Goal | Key deliverables |
|-------|------|------------------|
| **0** | Integration stubs | Route/screen, project schema for orientation, placeholder acceptable |
| **1** | Lanes & beats (no crossings) | `timelineStore`, canvas, toolbar parity, inspector, entities tree, script v1 round-trip |
| **2** | Crossing beats | Diagonal edges, `crossingPairId`, union-style creation flow, script encoding |
| **3** | Orientation & polish | Per-project vertical/horizontal time axis, optional PDF/image export |
| **4** | Lane operations | Lane reorder/delete with warnings; beat delete modes (this only vs this + following); undo/redo |
| **5** | Cross-module entities | Workspace-aware entities panel; character aspect on lanes; shared fields with Profiles/Tree |
| **6** | Crossing v2 (future) | Chains (A–B, B–C), hubs, more than two lanes |

### 6.4 Blueprint additions (broader vision)

Beyond the phased doc, the original blueprint also describes:

- **Anchors** and **segments** for time regions (v1 sequential; v2 nested segments)
- **Cross-segment causality edges**
- Global zoom and segment focus mode (v2+)
- Optional linking of beats to character profiles — never required

---

## 7. Ideas Playground

**Purpose:** Capture fragmented ideas, refine them, and preserve evolution and provenance — standalone or attached to a master project.

**Current status:** Workspace shell with placeholder canvas and stub script pane only.

### 7.1 Planned capabilities (from blueprint)

| Feature | Description |
|---------|-------------|
| **Bubbles** | WIP artifacts — not declared entities |
| **Import** | Paste text; blank lines split into separate bubbles |
| **Combine / merge** | New synthesized bubble; sources preserved |
| **Connect** | Relate bubbles without merging |
| **Hide sources** | Per-bubble and global toggles |
| **Promotion** | Fork a bubble into a profile detail, timeline note, etc.; target edits do not change the bubble; bubble keeps link + ancestry trail |
| **Script section** | `@ideas` in unified project script |
| **Canvas** | Visual bubble graph (not yet designed in phased doc) |

---

## 8. Image Playground

**Status:** Listed in module registry with `available: false`.

No implementation beyond the registry entry. Intended as a future visual/media exploration module; scope not yet specified in planning docs.

---

## 9. Master Projects & Script System

### 9.1 Implemented today

- **Create modular project** — select which modules to enable (none pre-selected)
- **Project dashboard** — module cards with placeholder stats; “Open Project Script” button (stub)
- **Open module** from dashboard creates/opens a standalone workspace for that module type
- **Profiles script** — module-local `@profiles` DSL with parser and generator
- **Family Tree script** — one-way generation from tree to script view

### 9.2 Planned: unified project script

```
@declare
  [EntityName]
  [EntityName2]

@profiles
@family_tree
@timeline
@ideas
```

**Rules (planned)**

- All entities declared in `@declare` only — no inline declarations elsewhere
- Unknown names in module sections → errors + quick-fix “add to @declare”
- Canvas edits update script; script edits update model (deterministic, no AI)
- Local/freeform nodes use internal IDs until promoted to declared entities
- Module sections appear only when that module is enabled on the project

---

## 10. Workspace Layout (All Modules)

Every mature module follows the same spatial pattern documented in `docs/UNIVERSAL_UI.md`:

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar — Projects, project name, panel toggles, save (if wired) │
├──────────────┬────────────────────────────────────┬────────────┤
│  Entities    │           Main canvas / chart       │ Inspector    │
│  (260px)     │                                     │ (256px)      │
├──────────────┴────────────────────────────────────┴────────────┤
│                    Script editor (resizable)                    │
└─────────────────────────────────────────────────────────────────┘
```

**Shared components:** Button, Input, Select, Checkbox, Modal, Card, TopBar, save/reload pattern with confirmation modal.

---

## 11. Roadmap Summary

### Near term (highest implementation momentum)

1. **Timeline Outliner Phase 0–1** — lanes, beats, store, basic canvas
2. **Family Tree script parser** — two-way sync
3. **Profiles inspector** — connect to live character data
4. **Profiles states by era** — developmental states over time

### Medium term

5. **Timeline Phase 2–4** — crossings, orientation, lane/beat delete modes
6. **Ideas Playground** — bubble model, merge/connect, promotion
7. **Master project script** — `@declare` + cross-module validation
8. **Cross-module entity aspects** — one character across Profiles, Tree, Timeline

### Long term

9. **Image Playground**
10. **Union relationship typing** and branch collapse on Family Tree canvas
11. **Nested timeline segments** and segment focus zoom
12. **Crossing v2** — multi-lane and chain crossings
13. **Full graph engine** and advanced export/print workflows

---

## 12. Explicit Non-Goals (v1 boundaries)

Documented scope boundaries to prevent creep:

- No AI parsing or auto-layout in v1 family tree
- No medical/biological metadata on persons
- No mandatory character profiles for timeline beats
- No nested time segments until timeline v2
- No third-lane timeline crossings until crossing v2
- Relationship labels (married/divorced) deferred in family tree v1

---

## 13. Reference Documents

| Document | Contents |
|----------|----------|
| `Synapse_IWE_BluePrint.md` | Original product blueprint — modules, script system, launch UX |
| `FamilyTree.md` | Family Tree master manifesto — principles, deferred features |
| `docs/FAMILY_TREE_UI_REPORT.md` | Complete Family Tree UI inventory |
| `docs/TimelineOutliner_PhasedApproach.md` | Timeline outliner phased implementation plan |
| `docs/UNIVERSAL_UI.md` | Shared UI patterns and panel specs |
| `docs/LINKED_TEMPLATES_FUTURE.md` | Deferred linked-template editing options for Profiles |

---

*This report reflects the codebase and planning docs as of Synapse IWE v2.5.0 alpha. Update the “Last updated” date and module maturity table when major modules ship new phases.*
