import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { isFieldLabelLine, isSeparatorLine, findSeparatorLineIndices } from "./beatDocumentModel";

const autoSeparatorDeco = Decoration.line({ class: "cm-beat-separator-auto" });
const committedSeparatorDeco = Decoration.line({ class: "cm-beat-separator-committed" });
const fieldLabelDeco = Decoration.line({ class: "cm-beat-field-label" });

export const setAutoSeparatorLines = StateEffect.define<number[]>();
export const setCommittedSeparators = StateEffect.define<boolean>();

export const separatorMarkField = StateField.define<{
  autoLines: Set<number>;
  committed: boolean;
}>({
  create() {
    return { autoLines: new Set(), committed: false };
  },
  update(value, tr) {
    let autoLines = new Set(value.autoLines);
    let committed = value.committed;

    for (const effect of tr.effects) {
      if (effect.is(setAutoSeparatorLines)) {
        for (const line of effect.value) autoLines.add(line);
      }
      if (effect.is(setCommittedSeparators)) {
        committed = effect.value;
        autoLines = new Set();
      }
    }

    if (tr.docChanged) {
      const newAuto = new Set<number>();
      const doc = tr.newDoc;
      for (let i = 0; i < doc.lines; i++) {
        const line = doc.line(i + 1);
        if (isSeparatorLine(line.text)) {
          const wasAuto = [...autoLines].some((oldLine) => {
            const mapped = tr.changes.mapPos(
              tr.startState.doc.line(oldLine + 1).from,
              1
            );
            try {
              return tr.newDoc.lineAt(mapped).number - 1 === i;
            } catch {
              return false;
            }
          });
          if (wasAuto && !committed) newAuto.add(i);
        }
      }
      if (!committed && newAuto.size > 0) autoLines = newAuto;
    }

    return { autoLines, committed };
  },
  provide: (f) =>
    EditorView.decorations.compute([f], (state) => {
      const { autoLines, committed } = state.field(f);
      const builder = new RangeSetBuilder<Decoration>();
      for (let i = 1; i <= state.doc.lines; i++) {
        const line = state.doc.line(i);
        if (isSeparatorLine(line.text)) {
          const isAuto = !committed && autoLines.has(i - 1);
          builder.add(
            line.from,
            line.from,
            isAuto ? autoSeparatorDeco : committedSeparatorDeco
          );
        } else if (isFieldLabelLine(line.text)) {
          builder.add(line.from, line.from, fieldLabelDeco);
        }
      }
      return builder.finish();
    }),
});

export const beatEditorTheme = EditorView.theme({
  ".cm-beat-separator-auto": {
    opacity: "0.45",
    fontStyle: "italic",
  },
  ".cm-beat-separator-committed": {
    color: "#94a3b8",
    fontWeight: "500",
  },
  ".cm-beat-field-label": {
    color: "#93c5fd",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: "13px",
    lineHeight: "1.6",
    padding: "12px 0",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    color: "#64748b",
  },
});

export function scanCommittedSeparators(text: string): boolean {
  return text.split("\n").some((line) => isSeparatorLine(line));
}

export function findAutoSeparatorLines(text: string, committed: boolean): number[] {
  if (committed) return [];
  return findSeparatorLineIndices(text);
}
