PLOTMASTER
FAMILY TREE MODULE
MASTER MANIFESTO

⸻

I. PURPOSE

The Family Tree module is a visual genealogy system designed to represent biological, relational, and generational structures in a flexible yet precise way.

It must function in two modes:
	1.	As a freeform genealogical builder.
	2.	As a structured component within a Modular Project.

The system must remain intuitive for users who never touch scripting, while remaining extensible for future cross-module integration.

⸻

II. CORE DESIGN PRINCIPLES
	1.	Union-Centric Parenting
Children attach to unions, not duplicated per parent.
	2.	Freeform First
Manual drag-and-drop layout is always available.
	3.	Structured Evolution
Layout intelligence, generation systems, and script integration are layered in phases.
	4.	Visual Clarity Over Complexity
Relationships must remain readable at all scales.
	5.	Separation of Concerns
Family depth generation and sociological generations are distinct systems.

⸻

III. CONFIRMED CORE FEATURES (V1 FOUNDATION)

A. Canvas System
	•	Pan and zoom
	•	Snap-to-grid (toggleable)
	•	Manual node positioning
	•	React Flow-based interaction

B. Node Types
	1.	Person Node

	•	Editable name
	•	Editable notes
	•	Unique internal ID
	•	Fully draggable
	•	Can exist unlinked

	2.	Union Node

	•	Represents biological union (<=>)
	•	Created from exactly two selected Person nodes
	•	Stores partner IDs
	•	Editable notes
	•	Children attach to union

C. Edge Types
	•	Person → Union (partner connection)
	•	Union → Person (child connection)

D. Toolbar Actions
	•	Add Person
	•	Create Union (requires exactly 2 selected persons)
	•	Add Child (requires exactly 1 selected union)
	•	Grid Snap toggle

Buttons intelligently disable based on selection state.
Disabled buttons display contextual tooltips.

E. Inspector Panel
For Person:
	•	Name
	•	Notes
	•	ID

For Union:
	•	Partner names (derived)
	•	Notes
	•	ID

Inspector state driven by centralized selection state.

F. Selection Model
	•	Single select
	•	Multi-select
	•	Selection mirrored into application state

⸻

IV. LAYOUT SYSTEM (PLANNED)

A. Free Organize Mode
	•	Fully manual positioning
	•	No automatic repositioning

B. Clean Up Mode
	•	Auto-align partners
	•	Center union between partners
	•	Evenly space children
	•	Prevent overlap
	•	Does not alter relationships
	•	Pure positional transformation

C. Union Child Layout Options
Per-union layout setting:
	•	Row (default)
	•	Cluster

D. Cluster Layout (Future Phase)
	•	Grid packing
	•	Circle packing
	•	Compact grouping to prevent excessive horizontal sprawl

Cluster is a visual layout strategy only.

⸻

V. GENERATION SYSTEM

Two distinct systems must exist.

A. Family Depth Generation
	•	Automatically computed via parent → child traversal
	•	Represents generational depth in the tree
	•	Numeric index (0, 1, 2, 3…)
	•	Optional alphabetic labeling (A, B, C…)
	•	Used for structural organization

B. Formal Generation Tagging
	•	Sociological generation labels
	•	Example: Boomer, Gen X, Millennial, Gen Z
	•	May overlap multiple depth generations
	•	Assigned manually or via birth year
	•	Separate from depth generation

These systems must never be conflated.

C. Generation Bands (Future Phase)
	•	Visual overlays representing generational layers
	•	Custom naming allowed
	•	Does not alter graph structure

⸻

VI. NAVIGATION SYSTEM

A. Scrivener-Style Left Pane
	•	Tree of Person nodes organized by depth generation
	•	Collapsible by generation
	•	Clicking selects and centers node on canvas
	•	Works even for very large trees

B. Search (Future Phase)
	•	Search by name
	•	Jump to node

⸻

VII. SCRIPT SYSTEM (Future Integration)

A. Bottom Script Editor Pane
	•	Two-way sync with tree
	•	Manual editing of structure via DSL
	•	Live preview

B. Promotion / Entity Linking
	•	Person nodes may link to Character Profile entities
	•	Cross-module integration within Modular Project

⸻

VIII. UNION TYPES (Future Phase)

Union nodes will support relationship typing:

Examples:
	•	Active union
	•	Divorced
	•	Separated
	•	Affair
	•	Adoptive

Visual differentiation via edge style:
	•	Solid line
	•	Gap
	•	Dashed
	•	Dotted

A visual Key / Legend panel will explain these representations.

⸻

IX. EXPORT SYSTEM

PDF export capabilities:
	•	Current view
	•	Clean layout view
	•	Optional notes
	•	Optional legend
	•	Generation band visibility toggle

Export only after layout system stabilizes.

⸻

X. MODULAR PROJECT INTEGRATION

A. Standalone Project
	•	Family Tree operates independently

B. Attached to Modular Project
	•	Shares entity pool
	•	Cross-module linking
	•	Unified script

Future flexibility may allow:
	•	Project linking to multiple Modular Projects
	•	Multiple Family Tree projects within a Modular Project

These decisions are deferred.

⸻

XI. EXPLICITLY DEFERRED
	•	Persistence layer
	•	Script parsing engine
	•	AI auto-layout
	•	Complex inheritance modeling
	•	Medical or biological metadata
	•	Cross-project entity merging
	•	Multiple relationship types in V1

⸻

XII. LONG-TERM VISION

The Family Tree module will evolve into:

A dual-mode system capable of:
	•	Freeform genealogical drafting
	•	Structured generational analysis
	•	Sociological tagging
	•	Visual clarity at scale
	•	Cross-module integration
	•	Printable, archival output

It must remain:

Precise
Expandable
Readable
And architecturally disciplined.

⸻

XIII. BRANCH VISIBILITY SYSTEM

A. Manual Branch Minimization

The Family Tree module supports manual collapsing and expanding of branches.

Purpose:
	•	Reduce visual clutter in large trees
	•	Focus on specific lineages
	•	Improve navigation
	•	Maintain structural integrity

Behavior:
	1.	A Person node or Union node may be collapsed.
	2.	When collapsed:
	•	All descendants (children, grandchildren, etc.) are hidden.
	•	Edges connected to hidden nodes are hidden.
	3.	The collapsed node displays:
	•	Expand icon indicator
	•	Optional descendant count badge (future)
	4.	Expanding restores all hidden descendants.

Important constraints:
	•	Collapsing does NOT delete nodes.
	•	Collapsing does NOT modify relationships.
	•	Collapsing does NOT alter generation depth.
	•	Collapse state is purely visual.
	•	Collapse state may optionally persist in the future, but not required initially.

⸻

B. Collapse Scope Rules

Collapsing applies downward only.

If collapsing:
	•	A Person → hides all unions and descendants below that person.
	•	A Union → hides all children and their descendants.

Collapsing does not affect ancestors or siblings.

⸻

C. Interaction Model

Collapse can be triggered by:
	•	Small collapse/expand icon on node
	•	Inspector toggle: “Collapse Descendants”
	•	Context menu (future)

Manual action only. No automatic depth-based hiding.

⸻

D. Rendering Rule

Visibility is computed dynamically:
	•	Maintain full graph internally.
	•	Compute visibleNodes and visibleEdges based on collapse state.
	•	React Flow renders only visible elements.
	•	No structural mutations to the graph.

⸻

E. Left Pane Integration

If a branch is collapsed:
	•	Descendants may be hidden or nested under the collapsed parent.
	•	Clicking a hidden descendant from the left pane auto-expands necessary ancestors.