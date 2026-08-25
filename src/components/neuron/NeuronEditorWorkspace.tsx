import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import NeuronRichTextEditor from "./editor/NeuronRichTextEditor";
import BeatDocumentEditorView, {
  type BeatDocumentEditorHandle,
} from "../timeline/beatEditor/BeatDocumentEditorView";
import BeatEditorFieldToolbar, {
  type BeatEditorTool,
} from "../timeline/beatEditor/BeatEditorFieldToolbar";
import {
  applyAutoLabelsToDocument,
  assignFieldInSegment,
  findSegmentForOffset,
  insertAutoSeparatorsInText,
  insertSeparatorAtCursor,
  type FieldDisableFlags,
} from "../timeline/beatEditor/beatDocumentModel";
import { useNeuronStore } from "../../store/neuronStore";
import { getStorageDriver } from "../../storage/StorageDriver";
import { writeMirrorFileContent } from "../../neuron/mirror";
import { useTimelineStore } from "../../store/timelineStore";

export type NeuronPaneRef =
  | { kind: "user"; docId: string }
  | {
      kind: "mirror";
      subId: string;
      registryId: string;
      entityId: string;
      name: string;
    };

export interface NeuronEditorPane {
  id: string;
  ref: NeuronPaneRef;
}

export type NeuronDrafts = Record<string, { content: string; dirty: boolean }>;

interface NeuronEditorWorkspaceProps {
  panes: NeuronEditorPane[];
  activePaneId: string | null;
  drafts: NeuronDrafts;
  onDraftChange: (paneId: string, content: string, dirty?: boolean) => void;
  onActivePaneChange: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
}

export function paneIdFromRef(ref: NeuronPaneRef): string {
  if (ref.kind === "user") return `user:${ref.docId}`;
  return `mirror:${ref.subId}:${ref.entityId}`;
}

function getPaneLabel(
  ref: NeuronPaneRef,
  documents: { id: string; name: string }[]
): string {
  if (ref.kind === "user") {
    return documents.find((d) => d.id === ref.docId)?.name ?? "Document";
  }
  return ref.name;
}

export default function NeuronEditorWorkspace({
  panes,
  activePaneId,
  drafts,
  onDraftChange,
  onActivePaneChange,
  onClosePane,
}: NeuronEditorWorkspaceProps) {
  const documents = useNeuronStore((s) => s.documents);
  const mirrors = useNeuronStore((s) => s.mirrors);
  const applyDocumentEdits = useNeuronStore((s) => s.applyDocumentEdits);
  const updateMirror = useNeuronStore((s) => s.updateMirror);

  const addImportLabelPrefix = useTimelineStore((s) => s.addImportLabelPrefix);
  const removeImportLabelPrefix = useTimelineStore((s) => s.removeImportLabelPrefix);

  const [showRuler, setShowRuler] = useState(true);
  const [leftMargin, setLeftMargin] = useState(48);
  const [rightMargin, setRightMargin] = useState(48);
  const [activeTool, setActiveTool] = useState<BeatEditorTool>(null);
  const [disabledFields, setDisabledFields] = useState<FieldDisableFlags>({
    synopsis: false,
    detail: false,
    date: false,
  });
  const [prefixPanelOpen, setPrefixPanelOpen] = useState(false);
  const [newPrefix, setNewPrefix] = useState("");
  const [activePrefixes, setActivePrefixes] = useState<Set<string>>(new Set());

  const editorRef = useRef<BeatDocumentEditorHandle>(null);
  const mirrorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;

  const activeUserDoc = (() => {
    if (!activePane || activePane.ref.kind !== "user") return null;
    const docId = activePane.ref.docId;
    return documents.find((d) => d.id === docId) ?? null;
  })();

  const activeMirrorRef =
    activePane?.ref.kind === "mirror" ? activePane.ref : null;

  const activeMirrorContent = useMemo(() => {
    if (!activeMirrorRef) return "";
    const draft = drafts[activePane!.id];
    if (draft) return draft.content;
    const payload = mirrors[activeMirrorRef.subId];
    if (!payload) return "";
    if (payload.moduleType === "timeline" || payload.moduleType === "familyTree") {
      return payload.documents?.find((d) => d.id === activeMirrorRef.entityId)?.content ?? "";
    }
    return "";
  }, [activePane, activeMirrorRef, drafts, mirrors]);

  const commitMirrorDraft = useCallback(
    async (pane: NeuronEditorPane, content: string) => {
      if (pane.ref.kind !== "mirror") return;
      const { subId, registryId, entityId } = pane.ref;
      const payload = mirrors[subId];
      if (!payload) return;
      const patched = writeMirrorFileContent(registryId, payload, entityId, content);
      updateMirror(subId, patched);
      try {
        await getStorageDriver().saveProjectData(subId, patched);
      } catch (e) {
        console.error("[Neuron] mirror save failed:", e);
      }
    },
    [mirrors, updateMirror]
  );

  const handleUserContentChange = useCallback(
    (content: string) => {
      if (!activePane || activePane.ref.kind !== "user") return;
      onDraftChange(activePane.id, content, false);
      applyDocumentEdits(activePane.ref.docId, content);
    },
    [activePane, onDraftChange, applyDocumentEdits]
  );

  const handleMirrorContentChange = useCallback(
    (content: string) => {
      if (!activePane || activePane.ref.kind !== "mirror") return;
      onDraftChange(activePane.id, content, true);
      if (mirrorSaveTimers.current[activePane.id]) {
        clearTimeout(mirrorSaveTimers.current[activePane.id]);
      }
      mirrorSaveTimers.current[activePane.id] = setTimeout(() => {
        void commitMirrorDraft(activePane, content);
        onDraftChange(activePane.id, content, false);
      }, 800);
    },
    [activePane, onDraftChange, commitMirrorDraft]
  );

  useEffect(
    () => () => {
      Object.values(mirrorSaveTimers.current).forEach(clearTimeout);
    },
    []
  );

  const getMirrorContent = () => {
    if (!activePane) return "";
    return drafts[activePane.id]?.content ?? activeMirrorContent;
  };

  const handleAutoDetectFields = () => {
    const content = getMirrorContent();
    const next = applyAutoLabelsToDocument(content, disabledFields, Array.from(activePrefixes));
    handleMirrorContentChange(next);
    editorRef.current?.setContentWithCursor(next, editorRef.current.getCursorPos());
  };

  const handleInsertSeparator = () => {
    const view = editorRef.current?.getView();
    if (!view) return;
    const pos = view.state.selection.main.head;
    const next = insertSeparatorAtCursor(view.state.doc.toString(), pos);
    handleMirrorContentChange(next);
    editorRef.current?.setContentWithCursor(next, pos);
  };

  useEffect(() => {
    if (!activeTool || activePane?.ref.kind !== "mirror") return;
    const onMouseUp = () => {
      const sel = editorRef.current?.getSelection();
      const view = editorRef.current?.getView();
      if (!sel || !view) return;
      const segment = findSegmentForOffset(view.state.doc.toString(), sel.from);
      if (!segment) return;
      const nextContent = view.state.doc.toString();
      const segmentText = nextContent.slice(segment.start, segment.end);
      const updatedSegment = assignFieldInSegment(segmentText, activeTool, sel.text.trim());
      const next =
        nextContent.slice(0, segment.start) +
        updatedSegment +
        nextContent.slice(segment.end);
      handleMirrorContentChange(next);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [activeTool, activePane, handleMirrorContentChange]);

  const userContent =
    activeUserDoc && activePane
      ? (drafts[activePane.id]?.content ?? activeUserDoc.content)
      : "";

  if (panes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-dark-muted text-sm">
        Select or create a file in the binder to start editing.
      </div>
    );
  }

  const isTimelineMirror =
    activePane?.ref.kind === "mirror" && activePane.ref.registryId === "timeline";

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-dark-accent bg-dark-surface overflow-x-auto">
        {panes.map((pane) => {
          const label = getPaneLabel(pane.ref, documents);
          const dirty = drafts[pane.id]?.dirty;
          return (
            <button
              key={pane.id}
              type="button"
              onClick={() => onActivePaneChange(pane.id)}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded border shrink-0 ${
                activePaneId === pane.id
                  ? "bg-dark-accent border-dark-accent text-dark-text"
                  : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
              }`}
            >
              {label}
              {dirty ? " •" : ""}
              <span
                role="button"
                tabIndex={0}
                className="ml-1 text-dark-muted hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePane(pane.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onClosePane(pane.id);
                  }
                }}
              >
                ×
              </span>
            </button>
          );
        })}
      </div>

      {activePane?.ref.kind === "user" && activeUserDoc && (
        <NeuronRichTextEditor
          key={activePane.id}
          content={userContent}
          onChange={handleUserContentChange}
          leftMargin={leftMargin}
          rightMargin={rightMargin}
          onMarginChange={(l, r) => {
            setLeftMargin(l);
            setRightMargin(r);
          }}
          showRuler={showRuler}
          onToggleRuler={() => setShowRuler((v) => !v)}
        />
      )}

      {activePane?.ref.kind === "mirror" && (
        <>
          {isTimelineMirror && (
            <div className="px-3 py-2 border-b border-dark-accent bg-dark-surface">
              <BeatEditorFieldToolbar
                activeTool={activeTool}
                onToolChange={setActiveTool}
                disabledFields={disabledFields}
                onToggleField={(field) =>
                  setDisabledFields((d) => ({ ...d, [field]: !d[field] }))
                }
                onAutoDetectFields={handleAutoDetectFields}
                onInsertSeparator={handleInsertSeparator}
                prefixPanelOpen={prefixPanelOpen}
                onTogglePrefixPanel={() => setPrefixPanelOpen((v) => !v)}
                newPrefix={newPrefix}
                onNewPrefixChange={setNewPrefix}
                onAddPrefix={() => {
                  if (newPrefix.trim()) {
                    addImportLabelPrefix(newPrefix.trim());
                    setActivePrefixes((s) => new Set([...s, newPrefix.trim()]));
                    setNewPrefix("");
                  }
                }}
                onRemovePrefix={removeImportLabelPrefix}
                activePrefixes={activePrefixes}
                onToggleActivePrefix={(prefix) => {
                  setActivePrefixes((s) => {
                    const next = new Set(s);
                    if (next.has(prefix)) next.delete(prefix);
                    else next.add(prefix);
                    return next;
                  });
                }}
              />
            </div>
          )}
          {!isTimelineMirror && (
            <div className="px-3 py-2 border-b border-dark-accent bg-dark-surface text-xs text-dark-muted">
              Script editor — Family Tree file
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden">
            <BeatDocumentEditorView
              ref={editorRef}
              key={activePane.id}
              content={drafts[activePane.id]?.content ?? activeMirrorContent}
              onChange={handleMirrorContentChange}
              separatorsCommitted={false}
              onPaste={insertAutoSeparatorsInText}
            />
          </div>
        </>
      )}
    </div>
  );
}
