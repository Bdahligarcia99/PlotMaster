# Family Tree Feature — UI Elements Report

A comprehensive inventory of all UI elements (buttons, dropdowns, inputs, etc.) and their functions in the Family Tree feature.

---

## 1. Top Bar (FamilyTreeScreen)

| Element | Type | Function |
|---------|------|----------|
| **Projects** | Button | Opens the intro/projects dialog |
| **Project name** | Button (when not editing) | Click to rename the project; shows current name |
| **Project name** | Input (when editing) | Inline edit field; Enter to save, Escape to cancel |
| **Family Tree** | Badge | Displays module type (non-interactive) |
| **FamilyTreeSaveControls** | Component | Save, Reload, and status (see §2) |
| **Entities** | Toggle button | Show/hide the left sidebar (entities panel) |
| **Script** | Toggle button | Show/hide the bottom script pane |
| **Inspector** | Icon button | Show/hide the right inspector panel |

---

## 2. Save Controls (FamilyTreeSaveControls)

| Element | Type | Function |
|---------|------|----------|
| **Status text** | Span | Shows "Saving…", "Save failed", "Unsaved changes", or blank |
| **Save** | Button | Saves the tree (flushes debounce); disabled when no project or saving |
| **Reload** | Button | Reloads last saved version; prompts confirmation if there are unsaved changes |
| **Reload modal** | Modal | "Reload?" — Cancel and Continue buttons to confirm discard of unsaved changes |

---

## 3. Toolbar (FamilyTreeToolbar)

### 3.1 Person Controls
| Element | Type | Function |
|---------|------|----------|
| **+ Person** | Button | Adds a new person node (no generation anchor) |
| **Person dropdown ▼** | Dropdown trigger | Opens person spawn options |
| **Auto (no gen)** | Dropdown item | Adds person with no generation anchor |
| **Gen X / Gen A / etc.** | Dropdown items | Adds person assigned to that generation anchor |

### 3.2 Union & Child Controls
| Element | Type | Function |
|---------|------|----------|
| **Create Union** | Button | Creates a union between 2 selected people; disabled unless exactly 2 people selected |
| **+ Child** | Button | Adds child to selected union; disabled unless exactly 1 union selected |
| **+ Child dropdown ▼** | Dropdown trigger | Opens child options |
| **Persist union selection** | Checkbox | When checked, keeps union selected after adding a child |

### 3.3 Marquee & Layout
| Element | Type | Function |
|---------|------|----------|
| **Marquee Select** | Toggle button | Toggle marquee selection mode; shortcut: M; when active, drag draws selection box |
| **+ Gen Anchor** | Button | Adds a generation anchor band |
| **Gen Anchor dropdown ▼** | Dropdown trigger | Opens generation anchor options |
| **Add Generation** | Dropdown item | Same as + Gen Anchor button |
| **Show generation anchors** | Checkbox | Toggle visibility of generation bands on canvas |
| **Show inherit indicator** | Checkbox | Toggle generation-inheritance flash indicator |
| **Label Mode** | Radio options | Letters, Numbers, or Both for generation labels |

### 3.4 Sort & Clear
| Element | Type | Function |
|---------|------|----------|
| **Sort** | Button | Sorts family units according to layout rules |
| **Sort dropdown ▼** | Dropdown trigger | Opens sort alignment options |
| **Single-child alignment** | Radio options | Left parent, Center, Right parent |
| **3+ children alignment** | Radio options | Left, Center, Right |
| **Clear** | Button | Clears tree and storage; disabled when no project |

### 3.5 Display Options
| Element | Type | Function |
|---------|------|----------|
| **Snap to Grid** | Checkbox | Snap node positions to grid |
| **Show Node Info** | Checkbox + dropdown | Toggle node info overlay; dropdown for info type |
| **Node Info dropdown ▼** | Dropdown trigger | Choose which info to show: Top-left (x,y), Center (cx,cy), Size (w,h), Spacing (2 selected) |
| **Autosave** | Checkbox | Toggle autosave; shows "All changes saved" or "Autosave off" when toggled |

---

## 4. Left Sidebar — Entities (FamilyTreeLeftSidebar)

| Element | Type | Function |
|---------|------|----------|
| **Search** | Input | Placeholder for search (currently read-only) |
| **Family unit expand/collapse ▶** | Button | Expands or collapses a family unit in the list |
| **Family unit row** (e.g., "Alice ↔ Bob") | Button | Selects the union; Shift+click for range select; Ctrl/Cmd+click for multi-select |
| **Parent row** | Button | Selects that person; same modifiers as unit row |
| **Child row** | Button | Selects that child person; same modifiers |
| **Unlinked person row** | Button | Selects unlinked person; same modifiers |

---

## 5. Canvas (FamilyTreeCanvas)

### 5.1 ReactFlow Controls (built-in)
| Element | Type | Function |
|---------|------|----------|
| **Zoom in** | Button | Increases zoom |
| **Zoom out** | Button | Decreases zoom |
| **Fit view** | Button | Fits all nodes in view |
| **Lock** | Button | Toggles interactive lock |

### 5.2 Canvas Interactions
| Interaction | Function |
|-------------|----------|
| **Space + drag** | Pan canvas |
| **Drag node** | Move person or union (when not in marquee mode) |
| **Click node** | Select node |
| **Shift+click node** | Add to selection (range select when used with sidebar) |
| **Ctrl/Cmd+click node** | Toggle selection |
| **Marquee drag** (when Marquee Select active) | Box-select multiple nodes; Shift=add, Alt=subtract |
| **Double-click PersonNode** | Inline-edit person name |
| **Person node top unlink** | Hover button above person; detaches from parent union (disabled when none) |
| **Person node bottom unlink** | Hover button below person; detaches from partner union (disabled when none; with 2+ unions requires selecting target union first) |
| **Generation ruler label** | Click to edit custom label; Enter to save, Escape to cancel |

### 5.3 Overlays (informational, mostly non-interactive)
| Element | Function |
|---------|----------|
| **Generation bands** | Horizontal bands for generations (display only when "Show generation anchors" is on) |
| **Generation ruler** | Right-side labels; labels are clickable to edit |
| **Node info overlay** | Shows coords/size when "Show Node Info" is enabled |
| **Spacing overlay** | Shows ΔX/ΔY when 2 nodes selected and Spacing option on |
| **Node handles** | Person: top (parents), bottom (children); Union: top (partners), bottom (children) |

---

## 6. Script Pane (FamilyTreeScriptPane)

| Element | Type | Function |
|---------|------|----------|
| **Layout: Split** | Button | Split view: code pane + view pane |
| **Layout: Code** | Button | Code pane only |
| **Layout: View** | Button | View pane only |
| **Compact declarations** | Checkbox | Toggle compact vs expanded script format in view |
| **Copy** | Button | Copies generated script to clipboard; shows "Copied!" briefly |
| **Code textarea** | Textarea | Placeholder "(Code editor coming soon)" — read-only |
| **View textarea** | Textarea | Displays generated family tree script — read-only |

---

## 7. Inspector (FamilyTreeInspector)

### 7.1 Person Selected
| Element | Type | Function |
|---------|------|----------|
| **Swap Partners** (icon) | Icon button | In header when union selected — swaps left/right partners |
| **Set as Anchor** | Button | Sets selected person as anchor node |
| **Clear Anchor** | Button | Clears anchor (when current selection is anchor) |
| **Generation anchor** | Select dropdown | Assigns person to a generation (None or Gen A, B, etc.) |
| **Parents** | Link(s) | Click parent name to select that node |
| **Name** | Input | Edit person name |
| **Notes** | Textarea | Edit person notes |

### 7.2 Union Selected
| Element | Type | Function |
|---------|------|----------|
| **Swap Partners** | Button | Swaps left and right partner order |
| **Partners** | Text | Displays partner names (read-only) |
| **Notes** | Textarea | Edit union notes |

---

## 8. Resizers

| Element | Type | Function |
|---------|------|----------|
| **Entities resize handle** | Vertical divider | Drag to resize left sidebar width |
| **Script resize handle** | Horizontal divider | Drag to resize script pane height |
| **Show Entities** (when sidebar hidden) | Button | Vertical tab to reopen left sidebar |
| **Script** (when pane hidden) | Button | Horizontal bar to reopen script pane |

---

## 9. Person Node (PersonNode) — on canvas

| Element | Type | Function |
|---------|------|----------|
| **Node body** | Clickable div | Select on click; Ctrl/Cmd+click toggles selection |
| **Name (display)** | Text | Shows person name |
| **Name (edit)** | Input | Appears on double-click; Enter to save, Escape to cancel |
| **Connection handles** | Handles | Top: parents; Bottom: children — for drawing edges |
| **Gen inherit flash** | Overlay | Brief flash when generation is inherited (informational) |

---

## 10. Union Node (UnionNode) — on canvas

| Element | Type | Function |
|---------|------|----------|
| **Node body** | Clickable div | Select on click; Ctrl/Cmd+click toggles selection |
| **"<=>" label** | Text | Visual indicator (non-interactive) |
| **Connection handles** | Handles | Top: partners; Bottom: children |

---

## 11. Keyboard Shortcuts

| Key | Function |
|-----|----------|
| **Space** | Hold to enable pan mode (drag to pan) |
| **M** | Toggle Marquee Select tool |
| **Shift+Click** | Range-select in sidebar; select 2 people for union |
| **Ctrl/Cmd+Click** | Multi-select / toggle selection |
| **Enter** | Save inline edits (name, generation label) |
| **Escape** | Cancel inline edits |

---

## 12. Modals & Dialogs

| Modal | Trigger | Contents |
|-------|---------|----------|
| **Bloodline warning** | Deleting a bridge connection inside a family (union delete, unlink, or person delete) | "Delete all descendants?" — No / Yes, delete descendants |
| **Reload?** | Reload button when unsaved | Confirm discarding unsaved changes; Cancel / Continue |
| **Intro/Projects** | Projects button in top bar | Create project, recent projects (outside Family Tree component) |

---

*Generated from Synapse IWE Family Tree codebase*
