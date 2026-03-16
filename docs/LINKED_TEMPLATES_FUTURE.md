# Linked Templates: Future Consideration

## Option B – Editable Layouts for Linked Characters

**Status:** Deferred for later implementation.

**Idea:** Allow users to edit a linked character's layout directly, rather than requiring all changes to go through the template.

**Possible approaches:**
- **Fork:** Editing the layout automatically unlinks the character and keeps their current layout as independent.
- **Suggest / override:** Character can have local overrides; template changes merge with overrides (complex).
- **Propose to template:** Edits create a "suggested change" that can be applied to the template and propagated to other linked characters.

**When to revisit:** After Option A (read-only layout for linked characters) is shipped and validated.
