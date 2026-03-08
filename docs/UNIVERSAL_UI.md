# Universal UI

A reference for recurring UI elements and panel patterns in PlotMaster. Use this when building new modules to ensure consistency.

---

## Theme & Colors

All UI uses the dark theme. Tailwind classes:

| Class | Hex | Use |
|-------|-----|-----|
| `dark-bg` | `#1a1a2e` | Page background |
| `dark-surface` | `#16213e` | Cards, panels, TopBar |
| `dark-accent` | `#0f3460` | Borders, dividers, secondary surfaces |
| `dark-text` | `#e4e4e7` | Primary text |
| `dark-muted` | `#a1a1aa` | Labels, placeholders, secondary text |

Focus ring: `focus:border-blue-500 focus:ring-1 focus:ring-blue-500`

---

## Recurring UI Components

### Button

**Path:** `src/components/ui/Button.tsx`

```tsx
import Button from "../components/ui/Button";

<Button variant="primary" size="md">Save</Button>
<Button variant="secondary" size="sm">Cancel</Button>
<Button variant="ghost">Back</Button>
<Button variant="danger">Delete</Button>
```

| Prop | Values | Default |
|------|--------|---------|
| `variant` | `primary`, `secondary`, `ghost`, `danger` | `secondary` |
| `size` | `sm`, `md`, `lg` | `md` |

### TopBar

**Path:** `src/components/ui/TopBar.tsx`

```tsx
import TopBar from "../components/ui/TopBar";

<TopBar
  left={<ProjectsButton />}
  right={<InspectorToggle />}
/>
```

### Save & Reload Controls

Use in module toolbars for data persistence. Place in TopBar `right` or in a module-specific toolbar.

**Save button:**
- Variant: `primary`, size: `sm`
- States: "Save" (default), "Saving…" (loading), "Saved ✓" (brief feedback after success)
- Disable when no project loaded or while saving
- Optional: status text ("Unsaved changes", "Save failed") to the left

**Reload button:**
- Variant: `secondary`, size: `sm`
- Discards unsaved changes and reloads from storage
- When there are unsaved changes: show confirmation modal ("Reload will discard unsaved changes. Continue?")
- When no unsaved changes: reload immediately

**Pattern:**

```tsx
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";

const [showReloadConfirm, setShowReloadConfirm] = useState(false);

const handleReloadClick = () => {
  if (hasUnsavedChanges) setShowReloadConfirm(true);
  else doReload();
};

<div className="flex items-center gap-2">
  <span className={`text-xs min-w-[7rem] text-right ${lastSaveError ? "text-red-400" : "text-dark-muted"}`}>
    {isSaving ? "Saving…" : lastSaveError ? "Save failed" : hasUnsavedChanges ? "Unsaved changes" : "\u00A0"}
  </span>
  <Button variant="primary" size="sm" onClick={handleSave} disabled={!projectId || isSaving}>
    {showSavedCheck ? "Saved ✓" : isSaving ? "Saving…" : "Save"}
  </Button>
  <Button variant="secondary" size="sm" onClick={handleReloadClick} disabled={!projectId}>
    Reload
  </Button>
</div>

<Modal isOpen={showReloadConfirm} onClose={() => setShowReloadConfirm(false)} title="Reload?">
  <p className="text-dark-muted text-sm mb-4">Reload will discard unsaved changes. Continue?</p>
  <div className="flex gap-3">
    <Button variant="ghost" onClick={() => setShowReloadConfirm(false)} className="flex-1">Cancel</Button>
    <Button variant="primary" onClick={doReload} className="flex-1">Continue</Button>
  </div>
</Modal>
```

**Example:** `FamilyTreeSaveControls` in `src/components/family-tree/FamilyTreeSaveControls.tsx`

---

### Projects Button (Top-Left Nav)

Use in every module's TopBar for consistency:

```tsx
const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);

<button
  onClick={() => setIntroDialogOpen(true)}
  className="flex items-center gap-2 px-3 py-1.5 text-dark-muted hover:text-dark-text transition-colors"
  title="Open projects"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
  Projects
</button>
```

### Save & Reload Controls

Use in module toolbars for data that persists. Place in TopBar right, typically alongside status text.

**Save button:**
- Variant: `primary`, size: `sm`
- States: "Save" (default), "Saving…" (loading), "Saved ✓" (brief feedback after success)
- Disable when no project loaded or while saving
- Optional: status text (e.g. "Unsaved changes", "Save failed" in red)

**Reload button:**
- Variant: `secondary`, size: `sm`
- If there are unsaved changes, show a confirmation modal before reloading
- Modal: "Reload?" title, "Reload will discard unsaved changes. Continue?" body, Cancel + Continue buttons

**Pattern:**

```tsx
<div className="flex items-center gap-2">
  <span className={`text-xs min-w-[7rem] text-right ${lastSaveError ? "text-red-400" : "text-dark-muted"}`}>
    {isSaving ? "Saving…" : lastSaveError ? "Save failed" : hasUnsavedChanges ? "Unsaved changes" : "\u00A0"}
  </span>
  <Button
    variant="primary"
    size="sm"
    onClick={handleSave}
    disabled={!activeProjectId || isSaving}
    title="Save"
  >
    {showSavedCheck ? "Saved ✓" : isSaving ? "Saving…" : "Save"}
  </Button>
  <Button
    variant="secondary"
    size="sm"
    onClick={handleReloadClick}
    disabled={!activeProjectId}
    title="Reload last saved version (discard unsaved changes)"
  >
    Reload
  </Button>
</div>
```

**Reload confirmation modal:**

```tsx
<Modal isOpen={showReloadConfirm} onClose={() => setShowReloadConfirm(false)} title="Reload?">
  <p className="text-dark-muted text-sm mb-4">
    Reload will discard unsaved changes. Continue?
  </p>
  <div className="flex gap-3">
    <Button variant="ghost" onClick={() => setShowReloadConfirm(false)} className="flex-1">Cancel</Button>
    <Button variant="primary" onClick={doReload} className="flex-1">Continue</Button>
  </div>
</Modal>
```

**Example:** `FamilyTreeSaveControls` in `src/components/family-tree/FamilyTreeSaveControls.tsx`

### Card

**Path:** `src/components/ui/Card.tsx`

```tsx
import Card from "../components/ui/Card";

<Card padding="lg">
  <h3>Title</h3>
  <p>Content</p>
</Card>
```

| Prop | Values |
|------|--------|
| `padding` | `none`, `sm`, `md`, `lg` |

### Input

**Path:** `src/components/ui/Input.tsx`

```tsx
import Input from "../components/ui/Input";

<Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
<Input label="Email" error="Invalid email" />
```

### Select

**Path:** `src/components/ui/Select.tsx`

```tsx
import Select from "../components/ui/Select";

<Select
  label="Type"
  options={[{ value: "a", label: "Option A" }, { value: "b", label: "Option B" }]}
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>
```

### Checkbox

**Path:** `src/components/ui/Checkbox.tsx`

```tsx
import Checkbox from "../components/ui/Checkbox";

<Checkbox label="Enable feature" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
```

### Modal

**Path:** `src/components/ui/Modal.tsx`

```tsx
import Modal from "../components/ui/Modal";

<Modal isOpen={open} onClose={() => setOpen(false)} title="Confirm">
  <p>Are you sure?</p>
  <Button onClick={() => setOpen(false)}>OK</Button>
</Modal>
```

---

## Panels

### 1. Properties Panel (Inspector)

Right-side panel for editing selected entity properties. Width: `w-64` (256px).

**Structure:**
- Fixed width, right border
- Header: "Inspector" (uppercase, muted)
- Empty state: "Select a node to edit properties."
- Form fields: label + input/textarea/select

**Base structure:**

```tsx
<div className="w-64 flex-shrink-0 border-l border-dark-accent bg-dark-surface p-4 overflow-y-auto">
  <h3 className="text-sm font-medium text-dark-muted uppercase tracking-wide mb-3">
    Inspector
  </h3>
  {/* Empty state */}
  <p className="text-dark-muted text-xs">Select a node to edit properties.</p>
  {/* Or: form fields */}
  <div className="mb-4">
    <label className="block text-dark-muted text-sm mb-2">Name</label>
    <input className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500" />
  </div>
</div>
```

**Examples:** `FamilyTreeInspector`, `ProfilesInspector`, `TimelineInspector`, `IdeasInspector`

---

### 2. Entities Panel

Left sidebar listing entities (characters, nodes, etc.). Collapsible, typically 260px wide.

**Structure:**
- Header: "Entities" (uppercase, muted) + optional subtitle
- Search input (optional)
- Scrollable list of entity items
- Each item: icon/avatar, name, optional chevron/action

**Base structure:**

```tsx
<div className="w-[260px] flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden">
  <div className="p-4 border-b border-dark-accent/50">
    <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">Entities</h2>
    <p className="text-dark-muted text-xs mt-1">Optional subtitle</p>
  </div>
  <div className="p-3 border-b border-dark-accent/50">
    <input
      type="text"
      placeholder="Search..."
      className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500"
    />
  </div>
  <div className="flex-1 overflow-y-auto p-2">
    {/* Entity list items */}
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-accent/30 hover:bg-dark-accent/30 transition-colors">
      <span className="text-dark-text text-sm">Entity name</span>
    </div>
  </div>
</div>
```

**Examples:** `FamilyTreeLeftSidebar`, `TimelineEntitiesPanel`, `ProfilesEntitiesPanel`, `IdeasEntitiesPanel`

---

### 3. Script Editor Panel

Bottom pane for script/code editing. Resizable height, typically 160–520px.

**Structure:**
- Header: "Script" (uppercase, muted) + optional layout toggles (Split / Code / View)
- Code area: textarea or code block
- Optional: copy button, layout switcher

**Base structure:**

```tsx
<div className="h-full flex flex-col border-t border-dark-accent/50 bg-dark-surface">
  <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 border-b border-dark-accent/50 shrink-0">
    <span className="text-xs font-medium text-dark-muted uppercase tracking-wide">Script</span>
    {/* Optional: layout toggles, copy button */}
  </div>
  <div className="flex-1 flex overflow-hidden min-h-0 p-3">
    <textarea
      className="w-full flex-1 px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-muted text-sm font-mono resize-none focus:outline-none focus:border-blue-500"
      spellCheck={false}
    />
  </div>
</div>
```

**Examples:** `FamilyTreeScriptPane`, `ProfilesScriptPane`, `TimelineScriptPane`, `IdeasScriptPane`

---

## Workspace Layout Pattern

Standard layout for modules with all three panels:

```
┌─────────────────────────────────────────────────────────────────┐
│ TopBar (Projects | Project name | Entities toggle | Inspector)  │
├──────────────┬────────────────────────────────────┬────────────┤
│              │                                     │            │
│  Entities    │           Main Canvas/Content       │ Properties │
│  Panel       │                                     │ (Inspector)│
│  (260px)     │                                     │  (256px)   │
│              ├────────────────────────────────────┤            │
│              │         Script Editor Panel         │            │
│              │         (resizable height)          │            │
└──────────────┴────────────────────────────────────┴────────────┘
```

**Toggle buttons (TopBar right):**
- "Entities" – show/hide left sidebar
- "Inspector" – show/hide right properties panel

**Collapsed states:**
- When Entities hidden: thin vertical "Entities" tab on left edge
- When Script hidden: thin horizontal "Script" tab on bottom edge

**State:**
```tsx
const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
const [scriptPaneOpen, setScriptPaneOpen] = useState(true);
const [inspectorOpen, setInspectorOpen] = useState(false);
```

---

## Form Field Styling

Consistent styling for form elements in panels:

```css
/* Input / textarea */
px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm
focus:outline-none focus:border-blue-500

/* Label */
block text-dark-muted text-sm mb-2

/* Section spacing */
mb-4
```

---

## File Locations

| Component | Path |
|-----------|------|
| Button | `src/components/ui/Button.tsx` |
| TopBar | `src/components/ui/TopBar.tsx` |
| Card | `src/components/ui/Card.tsx` |
| Input | `src/components/ui/Input.tsx` |
| Select | `src/components/ui/Select.tsx` |
| Checkbox | `src/components/ui/Checkbox.tsx` |
| Modal | `src/components/ui/Modal.tsx` |
| Save & Reload Controls | Per-module: `*SaveControls.tsx` (e.g. `FamilyTreeSaveControls.tsx`) |
| Properties (Inspector) | Per-module: `*Inspector.tsx` |
| Entities | Per-module: `*EntitiesPanel.tsx` |
| Script Editor | Per-module: `*ScriptPane.tsx` |
