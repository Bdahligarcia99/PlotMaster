import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  beatEditorTheme,
  findAutoSeparatorLines,
  separatorMarkField,
  setAutoSeparatorLines,
  setCommittedSeparators,
} from "./beatDocumentExtensions";
import { insertAutoSeparatorsInText } from "./beatDocumentModel";

export interface BeatDocumentEditorHandle {
  getView: () => EditorView | null;
  getSelection: () => { from: number; to: number; text: string } | null;
  insertAtCursor: (text: string) => void;
  replaceSelection: (text: string) => void;
  getCursorPos: () => number;
}

interface BeatDocumentEditorViewProps {
  content: string;
  onChange: (text: string) => void;
  separatorsCommitted: boolean;
  onPaste?: (text: string) => string;
}

const BeatDocumentEditorView = forwardRef<BeatDocumentEditorHandle, BeatDocumentEditorViewProps>(
  function BeatDocumentEditorView({ content, onChange, separatorsCommitted, onPaste }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useImperativeHandle(ref, () => ({
      getView: () => viewRef.current,
      getSelection: () => {
        const view = viewRef.current;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        if (from === to) return null;
        return { from, to, text: view.state.sliceDoc(from, to) };
      },
      insertAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: text },
          selection: { anchor: pos + text.length },
        });
      },
      replaceSelection: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
      },
      getCursorPos: () => viewRef.current?.state.selection.main.head ?? 0,
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const view = new EditorView({
        state: EditorState.create({
          doc: content,
          extensions: [
            history(),
            keymap.of([...defaultKeymap, ...historyKeymap]),
            separatorMarkField,
            beatEditorTheme,
            EditorView.lineWrapping,
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            }),
            EditorView.domEventHandlers({
              paste(event, view) {
                const clip = event.clipboardData?.getData("text/plain");
                if (!clip) return false;
                event.preventDefault();
                const processed = onPaste ? onPaste(clip) : insertAutoSeparatorsInText(clip);
                const { from, to } = view.state.selection.main;
                view.dispatch({
                  changes: { from, to, insert: processed },
                  effects: setAutoSeparatorLines.of(
                    findAutoSeparatorLines(
                      view.state.doc.toString().slice(0, from) +
                        processed +
                        view.state.doc.toString().slice(to),
                      false
                    )
                  ),
                });
                return true;
              },
            }),
          ],
        }),
        parent: containerRef.current,
      });

      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== content) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: content },
        });
      }
    }, [content]);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        effects: [
          setCommittedSeparators.of(separatorsCommitted),
          setAutoSeparatorLines.of(findAutoSeparatorLines(content, separatorsCommitted)),
        ],
      });
    }, [separatorsCommitted, content]);

    return (
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden rounded-lg border border-dark-accent bg-dark-bg"
      />
    );
  }
);

export default BeatDocumentEditorView;
