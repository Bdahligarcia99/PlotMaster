WRITING TOOLS APP — BLUEPRINT (SANDBOX → CLAUDE HANDOFF)
Goal: Build the app’s main launch experience (UI-first, no real functionality yet), but design it so wiring can be added incrementally.

========================================
1) PRODUCT IDENTITY
========================================
This is a modular Writing Tools app built around visual thinking + structured planning.
Target “feel”: A precision narrative engineering tool that also feels like a visual thinking lab.
Key principle: Start messy (freeform), evolve toward structure (project-linked + declared entities), never force structure early.

========================================
2) CORE CONCEPTS (USER-FACING)
========================================
A) Workspace
- A workspace is an instance of a module (Timeline, Family Tree, Profiles, Ideas).
- A workspace can be Standalone OR attached to a Master Project.
- Standalone: freeform-first; no forced entities.
- Project-attached: can link to project entities, profiles/states, cross-module references.

B) Master Project
- A Master Project is an optional linking layer that unifies multiple module workspaces.
- Provides shared entity pool + unified project-level Script.
- Projects are intentionally created by selecting modules (opt-in; nothing pre-enabled).

C) Progressive Structure
- Nodes can exist freeform (local) or be linked/promoted to declared entities.
- UI users can ignore scripting; scripting exists as a deterministic power layer.

========================================
3) LAUNCH EXPERIENCE / MAIN SCREEN (BUILD THIS FIRST)
========================================
When launching the app, show a Home screen with two primary routes:
1) New Workspace
2) New Project

Home Screen Sections:
- Header: App name + subtle tagline (“Write with structure. Think in graphs.” optional)
- Primary Actions:
  - Button: “New Workspace”
  - Button: “New Project”
- Recent Items:
  - Recent Workspaces list (type, name, last opened)
  - Recent Projects list (name, enabled modules, last opened)
- Global utilities:
  - Settings (stub)
  - Search (stub)
  - “Open Script” should only appear when inside a Project (not on Home)

Main Screen UX Constraints:
- UI-first; no blank “white void” canvases on launch.
- Provide calm orientation and intentional choices.

========================================
4) WORKSPACE CREATION FLOW (UI ONLY FOR NOW)
========================================
New Workspace Modal:
- Workspace Name
- Module Type dropdown:
  - Timeline
  - Family Tree
  - Profiles
  - Ideas (Idea Playground)
- Attachment (optional):
  - Standalone (default)
  - Attach to existing Project (dropdown; disabled if no projects exist)

After creation:
- Navigates to that workspace’s module screen with an empty but structured canvas/layout.

========================================
5) PROJECT CREATION FLOW (UI ONLY FOR NOW)
========================================
New Project Modal:
- Project Name
- Select Modules (none pre-selected):
  - Timeline
  - Family Tree
  - Profiles
  - Ideas
- Create Project button

After creation:
- Navigates to Project Dashboard.

========================================
6) PROJECT DASHBOARD (UI FIRST)
========================================
Project Dashboard displays:
- Project Name
- Enabled module cards (only those selected):
  - Timeline card
  - Family Tree card
  - Profiles card
  - Ideas card
- Each card shows stub stats:
  - Timeline: lanes count, anchors count, nodes count (placeholder)
  - Family Tree: unions count, people count (placeholder)
  - Profiles: profiles count, states count (placeholder)
  - Ideas: bubbles count, merges count (placeholder)
- Script Card/Entry:
  - “Open Project Script” button
  - Shows declared entity count + errors indicator (placeholder)
- Module enable/disable controls (UI stub):
  - Disabling a module hides it but DOES NOT delete data (future behavior)
  - Re-enabling restores it (future behavior)

========================================
7) MODULES (FEATURES + BEHAVIORAL SPECS)
========================================

----------------------------------------
7.1 TIMELINE OUTLINER (Causality-first planning board)
----------------------------------------
Purpose:
- Visualize flow of events clearly first (causality/sequence).
- Multi-series / lanes on one canvas.
- Grid-enforced layout; diagonals allowed for edges/connections (not required for nodes).
- Orientation toggle for the entire canvas: vertical time-axis OR horizontal time-axis (project/workspace-level setting).

Key Concepts:
- Lanes/Series: rows (or columns) representing characters, arcs, subplots, etc.
- Nodes: events or notes; can be freeform or linked to entities.
- Anchors: define time regions/segments (v1 sequential only; v2 nested segments).
- Segments: time intervals between anchors, can have different scale (years vs months, etc.). In v1: sequential segments only.
- Cross-segment linking allowed: causality edges can connect nodes across segments.

Notes/Text:
- Nodes, anchors, edges support descriptions/notes.
- Inspector panel contains a longer description field.

Focus/Zoom:
- Global zoom control.
- Segment focus mode (v2 or later): expands a selected segment visually without changing underlying time data.

No forced profiles:
- Timeline nodes can exist without any character profiles.
- Linking to profiles/states is optional and later wiring.

----------------------------------------
7.2 FAMILY TREE CREATOR (Genealogy + story relationships)
----------------------------------------
Purpose:
- Build family trees independently of story projects.
- Supports freeform nodes/placeholders.
- UI users can build without knowing script.

Key Concepts:
- Union node: `<=>` represents a neutral biological union capable of producing children (no labels like married/divorced in v1).
- Children attach to the UNION (couple-centric), not duplicated per parent.
- Local nodes allowed (unknown ancestor, placeholders).
- Promote local nodes to declared entity later.

Text Editing (DSL):
- Script and UI are linked. Script is auto-formatted canonical.
- For project-level scripting: Entities are declared in @declare only (no inline declarations).
- Family tree can contain local IDs if created via UI in standalone mode.

Canonical example:
  ( Nora <=> Andrea ) {
    child Allara
    child Errnesto
  }

----------------------------------------
7.3 CHARACTER PROFILES (Identity + developmental states)
----------------------------------------
Purpose:
- Capture character reality + evolution over time.
- Core feature: “States by Era” (developmental states).

Key Concepts:
- Profile is optional; entities can exist without profiles.
- Base identity vs time-scoped states.
- States can include: beliefs, emotional baseline, relationship snapshot, physical changes, stability (optional).
- Can link state nodes into timeline later (optional wiring).

Notes/Text:
- Profiles need backstory/notes fields (short + long).

----------------------------------------
7.4 IDEA PLAYGROUND (Development module / idea evolution lab)
----------------------------------------
Purpose:
- Capture fragmented ideas, refine them, preserve evolution/provenance.
- Works standalone or attached to project.

Key Concepts:
- Bubbles are NOT entities. They are WIP artifacts.
- Import rule: paste text; blank lines split into separate bubbles.
- Combine/Merge: creates a new bubble synthesized from sources.
- Sources always preserved; can be hidden/collapsed.
- Connect: relate bubbles without merging.
- Hide Sources:
  - per-bubble toggle + global toggle

Promotion:
- Promoting a bubble creates a new target object elsewhere (profile detail, timeline note, etc.)
- Promotion is FORKED (target edits do not change the bubble).
- Bubble keeps a link to promoted target + ancestry trail.

========================================
8) SCRIPT SYSTEM (PROJECT-LEVEL, DETERMINISTIC)
========================================
Project-level Script View:
- One script for the entire project (not per module).
- Organized into module sections.
- Auto-formatted canonical output always.
- Deterministic parsing (no AI).

Mandatory top section:
@declare
  [EntityName]
  [EntityName2]
Rules:
- All entities must be declared here (front-loaded).
- No inline declarations anywhere else.
- Unknown names in other sections cause errors + quick fix “add to @declare”.

Module sections:
@profiles
@family_tree
@timeline
@ideas
Only present if module enabled.

UI ↔ Script Sync:
- Canvas edits update script.
- Script edits update model/canvas.
- If a UI-only node exists (local/freeform), script may represent it as an internal ID token (e.g., n1, t3, b7) until promoted to a declared entity (especially in standalone workspaces).

========================================
9) ENGINE / DATA MODEL DIRECTION (FOR FUTURE WIRING)
========================================
We may choose an “everything is a node” internal engine (Option 3):
- GraphNode typed objects + GraphEdge typed relationships.
- Modules impose constraints and render specific views.
- Even if internal is Option 3, v1 UI remains structured and calm.

Regardless:
- Must support: local nodes, promotion to declared entities, typed edges, module filters.

========================================
10) SCOPE BOUNDARIES (ANTI-SCOPE-CREEP)
========================================
V1 (UI-first):
- Build Home screen, New Project flow, New Workspace flow.
- Project Dashboard UI with enabled module cards.
- Module shells/screens (Timeline, Tree, Profiles, Ideas) with placeholders.
- No heavy engine. No real parsing. No persistence required unless easy.

Deferred (wire later):
- Full graph engine
- Full script parser
- Nested time segments (v2)
- Relationship typing (married/divorced/etc.)
- AI parsing
- Advanced zoom math / dynamic reflow

========================================
11) WHAT TO IMPLEMENT NOW (CLAUDE TASK)
========================================
Implement UI-only scaffolding:
- Routes:
  / (Home)
  /project/:id (Project Dashboard)
  /workspace/:id (Workspace shell)
- Components:
  HomeScreen
  NewProjectModal
  NewWorkspaceModal
  ProjectDashboard
  ModuleCard components
  TimelineWorkspaceShell
  FamilyTreeWorkspaceShell
  ProfilesWorkspaceShell
  IdeasWorkspaceShell
- Data:
  Mock in-memory store for projects + workspaces (fake IDs).
  Recent lists render from this store.

No real functionality required besides navigation + creation flows.

========================================
END BLUEPRINT
========================================