# Script Editor Formats — Reference Sheet

Every functional module has a **Script** pane (bottom panel in canvas/board view, `Split` / `Code` / `View` layout toggle) that renders the module's data as a small text DSL. This sheet documents the *exact* syntax each module's script generator emits and — where supported — what its parser accepts back in.

Source of truth for each format:

| Module | Generator | Parser | Component |
|---|---|---|---|
| Characters | `generateChartsScript` in `src/store/chartsStore.ts` | `parseChartsScript` in `src/parseChartsScript.ts` | `src/components/charts/ChartsScriptPane.tsx` |
| Family Tree | `generateFamilyTreeScript` in `src/store/familyTreeStore.ts` | `parseFamilyTreeScript` in `src/store/familyTreeScript.ts` | `src/components/family-tree/FamilyTreeScriptPane.tsx` |
| Timeline Outliner | `generateTimelineScript` / `compactTimelineScriptDisplay` in `src/store/timelineScript.ts` | `parseTimelineScript` in `src/store/timelineScript.ts` | `src/components/timeline/TimelineScriptPane.tsx` |
| Ideas Playground | *(static placeholder string)* | none | `src/components/ideas/IdeasScriptPane.tsx` |

General conventions shared by all formats:
- 2-space indentation per nesting level.
- Quoted strings escape `\` → `\\`, `"` → `\"`; Characters/Timeline also unescape `\n`, `\r`, `\t` on parse.
- `@keyword` lines mark top-level sections (`@charts`, `@declarations`, `@familyTree`, `@timeline`).
- `#` starts a comment / section label (e.g. `# Data types`) — ignored by parsers where noted.

---

## 1. Characters — Charts DSL (`@charts`)

The only format that is fully round-trippable today: edit the `Code` pane and press **Run** (or `Cmd/Ctrl+Enter`) to apply it back to the store via `parseChartsScript`.

### Top-level structure

```
@charts

# Data types
@builtin number: [0, 120, 1]
@builtin select: [Low, Medium, High]
Element: [Fire, Water, Earth, Air]

[Character Name] {
  h1 "Section Title"
    note "Free-text note content"
    attributes
      Age: 34 | @builtin:number [0, 120, 1]
      Element: Fire | @Element allowCustom=true
    image "Concept art"
  h2 "Nested Section"
}

[Second Character] {
  ...
}
```

- First non-blank line is `@charts` (legacy documents may say `@profiles`; both are accepted on parse).
- An optional `# Data types` block follows, containing:
  - `@builtin <type>: [min, max, step]` for `number`/`numberScroll` types, or `@builtin select: [opt1, opt2, ...]`.
  - `TagName: [opt1, opt2, ...]` for user-defined custom data types.
  - Terminated by a blank line.
- One `[Character Name] {` ... `}` block per character. The bracket is the character's display name; blank/empty resolves to `Unnamed`.
- When there are no characters/sections yet, the body is a single parenthetical placeholder line instead of a block, e.g. `(No characters yet. Add characters in the Entities panel.)` or `(No sections yet. Add sections to define the layout.)` — these lines are ignored by the parser.

### Sections

```
h1 "Section Title"
h2 "Sub-section"
h3 "..."
h4 "..."
```

- Heading level keyword is one of `h1`, `h2`, `h3`, `h4` (there is no semantic nesting rule enforced by level number — nesting is purely by **indentation**: a section is a child of the nearest preceding section line at a lower indent).
- Label is a required double-quoted string: `h1 "..."`. Regex accepted on parse: `^(h1|h2|h3|h4)\s+"((?:[^"\\]|\\.)*)"\s*$`.
- Each extra indent level = one nesting level deeper (2 spaces per level by convention; parser treats each space as 1 indent unit and each tab as 2).

### Content blocks (indented one level under a section)

**Note:**
```
note "Any free text, escaped quotes \" and newlines \n supported"
```
- `note "..."` — must be inside a section.

**Attributes:**
```
attributes
  Key: value
  Age: 34 | @builtin:number [0, 120, 1]
  Element: Fire | @Element allowCustom=true
```
- Bare `attributes` keyword on its own line opens a key/value block; every subsequently indented `Key: value` line belongs to it until indentation returns to `attributes`'s own level or lower.
- If an attributes block has no pairs yet, generator emits a lone `—` placeholder line (parser skips lines matching `^\s*[—\-]\s*$`).
- Optional type annotation after ` | `:
  - Built-in: `@builtin:text`, `@builtin:number [min, max, step]`, `@builtin:numberScroll [min, max, step]`, `@builtin:select [opt1, opt2, ...]`, `@builtin:date`. (Legacy bare form `@number`, `@select`, etc. without the `builtin:` prefix also parses.)
  - Custom: `@TagName` where `TagName` matches a name declared in the `# Data types` block.
  - Optional trailing ` allowCustom=true` / ` allowCustom=false` (defaults to `true` for `select` and custom types when omitted).
- A bare `Key: value` line found directly under a section (no `attributes` keyword present) is tolerated and folded into an implicit attributes block — the parser is forgiving here.

**Image:**
```
image "Caption or label"
```
- Must be inside a section; label may be empty (`image ""`).

### Compact mode

When the **Compact** checkbox is on, each section collapses to one line:

```
h1 "Section Title" | Note text goes here | Age: 34, Element: Fire | [image: Caption]
```
- Segments after the label are joined with ` | `: note content (newlines flattened to spaces), then attribute pairs as a single comma-joined string, then `[image: Label]` or `[image]` if no label.
- Compact is a **display-only** rendering for the generator; it is not required for the parser (the parser only understands the expanded/multi-line form above).

---

## 2. Family Tree DSL (`@declarations` / `@familyTree` / `@branches`)

Fully round-trippable: edit in the Code pane (Script layout) or per-family Text Editor documents; changes auto-commit after a short debounce via `applyFamilyDocumentEdits`, backed by `parseFamilyTreeScript`. Legacy bracket/`@unionId:` documents are migrated once on load.

### Top-level structure

```
# Connection Styles
@style1 "Dashed Blue" { stroke: #3b82f6, width: 2, dash: [4, 4], description: "Adoption" }

@declarations

Person _abc123 {
  first: "John"
  middle: ""
  last: "Doe"
  nicknames: "Bud, Buddy"
  notes: ""
  gen: 0
  x: 1424
  y: 512
}

Person _newperson {
  first: "New"
  middle: ""
  last: "Person"
  nicknames: ""
  notes: ""
  x: ?
  y: ?
}

@familyTree

Union _union1 {
  x: 800
  y: 384
  style: "Dashed Blue"
  arrange: parents=40, children=60, vertical=120, align=center
  Person _p3 type: father
  Person _p4 type: mother
  Person _p5 type: child { dx: -112, dy: 70 }
  notes: ""
}

@branches

Branch _b1 "John Doe's Branch" root: _abc123 mode: tab {
  unions: [_union1, _union2]
}
```

### Connection Styles (optional, only if any are defined)

```
# Connection Styles
@<styleId> "<Style Name>" { stroke: <cssColor>, width: <number>, dash: [<n>, <n>, ...], description: "<optional escaped text>" }
```
- One line per style; blank line terminates the block.

### `@declarations` — person blocks

```
Person <nodeId> {
  first: "<escaped>"
  middle: "<escaped>"
  last: "<escaped>"
  nicknames: "<comma-separated, escaped>"
  notes: "<escaped>"
  gen: <N>              # optional; 0-based index into generation-anchor list
  x: <number | ?>       # `?` = unset / click-to-place pending
  y: <number | ?>
  cx: <number>           # optional node-info overlay when enabled
  cy: <number>
  w: <number>
  h: <number>
}
```

- One `Person <id> { ... }` block per person declaration. At top-level section depth, this is a declaration; inside a `Union { }` block the same keyword denotes a member reference (see below).
- `x: ?` / `y: ?` mark an unplaced person (hidden from canvas until placed via sidebar + canvas click).
- **Compact mode** (`compactDeclarations` on): each person collapses to a single line: `Person <id> { first: "..." middle: "..." ... x: 1424 y: 512 }`.

### `@familyTree` — union blocks

```
Union <unionId> {
  x: <number | ?>
  y: <number | ?>
  style: "<connection style name>"     # optional
  arrange: parents=N, children=N, vertical=N, align=<left|center|right>  # optional overrides only
  Person <id> type: father
  Person <id> type: mother
  Person <id> type: parent             # partner slot with role not yet known
  Person <id> type: child { dx: <n>, dy: <n> }
  notes: "<escaped>"
}
```

- Partner slots come from the first `father` / `mother` / `parent` members in order; remaining `parent` members beyond two and all `child` members become child edges.
- `type:` is one of `father | mother | parent | child`.
- Union `x`/`y` are absolute canvas coordinates. Member `dx`/`dy` are relative to the union origin (union position = `0,0`). Parser also accepts `x'`/`y'` as aliases for `dx`/`dy`.
- Member `dx`/`dy` are only emitted when a person's absolute position differs from the default layout slot for that role.
- A union with `x: ?` forces every member person to unset coordinates too.
- `Person ? type: father` (and similar) are placeholder members tolerated by the parser — skipped on apply so a freshly inserted union can commit without partners yet.
- **Compact mode:** `Union <id> { x: 800 y: 384 notes: "" style: "..." }` on one line.

### `@branches` — branch blocks (optional)

```
Branch <branchId> "<display name>" root: <rootPersonId> mode: <tab|...> {
  unions: [<unionId>, ...]
  description: "<escaped>"    # optional
}
```

- `unions:` is derived from `rootPersonId` traversal on generation and is **ignored on parse**; the first entry is always the union where the root is a parent. `name`, `root`, and `mode` round-trip.

### Legacy format (migrated on load)

Older documents used bracket declarations and arrow unions:

```
["First", "Middle", "Last"] # id: _abc123
@_union1: John (father) <=> Jane (mother) { children: -> Kid }
```

These are detected on load and regenerated into the block format above from the graph model (one-time, idempotent).

---

## 3. Timeline Outliner DSL (`@declarations` / `@timeline`)

Fully round-trippable: edit in the Code pane; blur or explicit apply calls `applyScriptText`, backed by `parseTimelineScript`. This is a **different, simpler format** than the module-local Text Editor's beat-document/`laneFileFormat.ts` syntax used in Text Editor mode — see the note at the end.

### Top-level structure

```
@declarations

Lane <laneId> "<Lane Label>" type: <laneType> sort: <sortOrder>[ color: "<color>"] {
  beats: [
    Beat <beatId> slot: <slot>[ kind: anchor] {
      title: "<escaped title>"
      synopsis: "<escaped synopsis>"
      detail: "<escaped detail>"
      dateMode: <none|label|resolved|absolute|relative>
      dateLabel: "<text>"          # when dateMode: label
      dateResolved: "<text>"       # when dateMode: resolved
      dateAbsolute: <isoDateToken> # when dateMode: absolute (unquoted token)
      dateRelative: <±N>y <±N>m <±N>d origin: <beatId>  # when dateMode: relative
    },
    Beat <beatId2> slot: <slot2> {
      ...
    }
  ]
}

Crossing <connectionId> beats: <beatId1>,<beatId2>[,...][ title: "..."][ description: "..."][ date: "..."]

@timeline
```

### Lanes

```
Lane <id> "<Label>" type: <laneType> sort: <sortOrder>[ color: "<color>"] {
```
- Required fields, in this exact order: id (bare token), quoted label, `type: <laneType>` (bare token, e.g. `character`), `sort: <n>`.
- Optional trailing `color: "<hex or css color>"` only when a lane color is set.
- Lanes are sorted by `sortOrder` on generation. The parser also accepts a flat (non-nested) `Lane ... {`-less header for legacy/manual input, but the generator always emits the nested-block form with a `beats: [ ... ]` array inside.

### Beats

```
Beat <id> slot: <n> {
  title: "..."
  synopsis: "..."      # omitted if empty
  detail: "..."        # omitted if empty
  dateMode: ...         # omitted entirely if dateMode is "none"
  ...date fields...
}
```
- Header: `Beat <id> slot: <n>`, plus ` kind: anchor` when the beat is an anchor beat (story beats omit `kind`).
- Inside a lane's `beats: [ ]` array, each beat block is comma-separated except the last (`}` vs `},`).
- `title` is always emitted (defaults to `"Beat"` on parse if missing); `synopsis`/`detail` lines are only emitted when non-empty.
- Date sub-fields (only one mode's fields are emitted, matching `beat.dateSpec.mode`):
  - `none` — no date lines at all.
  - `label` — `dateMode: label` + `dateLabel: "<text>"` (only if non-empty).
  - `resolved` — `dateMode: resolved` + `dateResolved: "<text>"` (only if non-empty).
  - `absolute` — `dateMode: absolute` + `dateAbsolute: <token>` (bare, unquoted).
  - `relative` — `dateMode: relative` + `dateRelative: <years>y <months>d ... origin: <beatId>` on one line, e.g. `dateRelative: 2y 0m -3d origin: _b123`.
- Also accepted for backward-compatibility on parse: `order:` as an alias for `slot:`, `empty: true` / `kind: empty` to mean "no beat here" (silently dropped), and `description:` as an alias for `detail:`.
- Legacy flat `Beat <id> lane: <laneId> slot: <n> { ... }` (beat declared outside any `Lane { }` block, with an explicit `lane:` field) is also accepted by the parser for backward compatibility, even though the generator no longer emits this form.

### Crossings (connections)

```
Crossing <id> beats: <id1>,<id2>[,<id3>...][ title: "..."][ description: "..."][ date: "..."]
```
- `beats:` value is a bare comma-separated list (no spaces) of beat ids, minimum 2.
- Optional quoted `title`, `description`, `date` fields, only emitted when non-empty. Crossings are emitted in `id`-sorted order, one per line (not blocks).

### Compact display mode

The **Compact** checkbox does not change what's stored/parsed — it only affects the *read-only View pane and the Code pane while not focused*, via `compactTimelineScriptDisplay`: any quoted `Lane "..."` label and any `key: "..."` quoted value is replaced with `"..."` to collapse long text. Focusing the Code textarea always reveals the full, real text for editing.

### Relationship to the Text Editor mode format

Timeline Outliner's separate **Text Editor** workspace mode (per-lane pane documents) uses its own, richer plain-text beat format defined in `src/components/timeline/beatEditor/laneFileFormat.ts` (Markdown-ish `# Beat Title` headers with field lines), which is intentionally distinct from this Script-pane DSL. They are reconciled through the store, not through shared syntax — do not confuse the two when editing either.

---

## 4. Ideas Playground

Not yet implemented. `IdeasScriptPane` renders a static, read-only, non-functional placeholder to reserve the UI slot:

```
@ideas
  bubble b1 :: "Idea…"
```

No generator or parser exists yet; this string is hard-coded in `src/components/ideas/IdeasScriptPane.tsx` and carries a visible `stub` badge in the UI.
