import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../ui/Button";
import Modal from "../../ui/Modal";
import BeatDocumentEditorView, { type BeatDocumentEditorHandle } from "./BeatDocumentEditorView";
import BeatEditorFieldToolbar, { type BeatEditorTool } from "./BeatEditorFieldToolbar";
import BeatEditorLanePicker from "./BeatEditorLanePicker";
import {
  applyAutoLabelsToDocument,
  assignFieldInSegment,
  extractSegments,
  findSegmentForOffset,
  insertAutoSeparatorsInText,
  insertSeparatorAtCursor,
  scanCommittedSeparators,
  segmentFieldsToBeatPayload,
  type FieldDisableFlags,
} from "./beatDocumentModel";
import {
  resolveLaneIdFromSelection,
  useTimelineStore,
} from "../../../store/timelineStore";

interface BeatTextEditorPanelProps {
  initialLaneId: string | null;
  onClose: () => void;
  onDocumentChange?: (state: BeatEditorDocumentState) => void;
  onRegisterLoadHandler?: (handler: (content: string, id: string, name: string) => void) => void;
  initialContent?: string;
  initialDocumentId?: string | null;
  initialDocumentName?: string;
}

export interface BeatEditorDocumentState {
  content: string;
  laneId: string | null;
  separatorsCommitted: boolean;
  segments: ReturnType<typeof extractSegments>;
  documentId: string | null;
  documentName: string;
  isDirty: boolean;
}

export default function BeatTextEditorPanel({
  initialLaneId,
  onClose,
  onDocumentChange,
  onRegisterLoadHandler,
  initialContent = "",
  initialDocumentId = null,
  initialDocumentName = "Untitled",
}: BeatTextEditorPanelProps) {
  const lanes = useTimelineStore((s) => s.lanes);
  const beats = useTimelineStore((s) => s.beats);
  const selection = useTimelineStore((s) => s.selection);
  const importLabelPrefixes = useTimelineStore((s) => s.importLabelPrefixes);
  const addImportLabelPrefix = useTimelineStore((s) => s.addImportLabelPrefix);
  const removeImportLabelPrefix = useTimelineStore((s) => s.removeImportLabelPrefix);
  const createBeatsFromSegments = useTimelineStore((s) => s.createBeatsFromSegments);
  const saveDocument = useTimelineStore((s) => s.saveDocument);

  const editorRef = useRef<BeatDocumentEditorHandle>(null);
  const savedContentRef = useRef(initialContent);

  const [content, setContent] = useState(initialContent);
  const [laneId, setLaneId] = useState<string | null>(
    initialLaneId ?? resolveLaneIdFromSelection(lanes, beats, selection)
  );
  const [separatorsCommitted, setSeparatorsCommitted] = useState(
    () => scanCommittedSeparators(initialContent) || initialContent.trim().length === 0
  );
  const [activeTool, setActiveTool] = useState<BeatEditorTool>(null);
  const [disabledFields, setDisabledFields] = useState<FieldDisableFlags>({
    synopsis: false,
    detail: false,
    date: false,
  });
  const [activePrefixes, setActivePrefixes] = useState<Set<string>>(
    () => new Set(importLabelPrefixes)
  );
  const [prefixPanelOpen, setPrefixPanelOpen] = useState(false);
  const [newPrefix, setNewPrefix] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(initialDocumentId);
  const [documentName, setDocumentName] = useState(initialDocumentName);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState(documentName);
  const [unsavedPrompt, setUnsavedPrompt] = useState<{
    action: "new" | "load" | "close";
    loadContent?: string;
    loadId?: string | null;
    loadName?: string;
  } | null>(null);

  const isDirty = content !== savedContentRef.current;
  const segments = separatorsCommitted ? extractSegments(content) : [];
  const activePrefixList = importLabelPrefixes.filter((p) => activePrefixes.has(p));

  useEffect(() => {
    onDocumentChange?.({
      content,
      laneId,
      separatorsCommitted,
      segments,
      documentId,
      documentName,
      isDirty,
    });
  }, [
    content,
    laneId,
    separatorsCommitted,
    segments,
    documentId,
    documentName,
    isDirty,
    onDocumentChange,
  ]);

  const handleCommitAndLabel = useCallback(() => {
    setSeparatorsCommitted(true);
    const next = applyAutoLabelsToDocument(content, disabledFields, activePrefixList);
    setContent(next);
  }, [content, disabledFields, activePrefixList]);

  const handleApplySelection = useCallback(() => {
    const sel = editorRef.current?.getSelection();
    if (!sel || !activeTool) return;

    const segment = findSegmentForOffset(content, sel.from);
    if (!segment) return;

    const updatedSegment = assignFieldInSegment(segment.rawText, activeTool, sel.text);
    const before = content.slice(0, segment.start);
    const after = content.slice(segment.end);
    setContent(`${before}${updatedSegment}${after}`);
  }, [content, activeTool]);

  useEffect(() => {
    const onMouseUp = () => {
      if (!activeTool) return;
      const sel = editorRef.current?.getSelection();
      if (sel && sel.text.trim()) {
        handleApplySelection();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [activeTool, handleApplySelection]);

  const handleInsertSeparator = useCallback(() => {
    const pos = editorRef.current?.getCursorPos() ?? content.length;
    setContent(insertSeparatorAtCursor(content, pos));
    setSeparatorsCommitted(false);
  }, [content]);

  const requestLoadDocument = useCallback(
    (loadContent: string, loadId: string, loadName: string) => {
      if (isDirty) {
        setUnsavedPrompt({ action: "load", loadContent, loadId, loadName });
      } else {
        setContent(loadContent);
        setDocumentId(loadId);
        setDocumentName(loadName);
        savedContentRef.current = loadContent;
        setSeparatorsCommitted(scanCommittedSeparators(loadContent));
      }
    },
    [isDirty]
  );

  useEffect(() => {
    onRegisterLoadHandler?.(requestLoadDocument);
  }, [onRegisterLoadHandler, requestLoadDocument]);

  const executePendingAction = (prompt: NonNullable<typeof unsavedPrompt>) => {
    if (prompt.action === "new") {
      setContent("");
      setDocumentId(null);
      setDocumentName("Untitled");
      savedContentRef.current = "";
      setSeparatorsCommitted(false);
    } else if (prompt.action === "load") {
      setContent(prompt.loadContent ?? "");
      setDocumentId(prompt.loadId ?? null);
      setDocumentName(prompt.loadName ?? "Untitled");
      savedContentRef.current = prompt.loadContent ?? "";
      setSeparatorsCommitted(scanCommittedSeparators(prompt.loadContent ?? ""));
    } else if (prompt.action === "close") {
      onClose();
    }
  };

  const requestNewDocument = () => {
    if (isDirty) {
      setUnsavedPrompt({ action: "new" });
    } else {
      executePendingAction({ action: "new" });
    }
  };

  const requestClose = () => {
    if (isDirty) {
      setUnsavedPrompt({ action: "close" });
    } else {
      onClose();
    }
  };

  const handleCreateBeats = () => {
    if (!laneId) return;
    const segs = extractSegments(content);
    if (segs.length === 0) return;
    const items = segs.map((s) => segmentFieldsToBeatPayload(s.fields));
    createBeatsFromSegments(laneId, items);
    onClose();
  };

  const handleSave = () => {
    setSaveAsName(documentName);
    setSaveModalOpen(true);
  };

  const confirmSave = () => {
    const id = saveDocument(documentId, saveAsName, content);
    setDocumentId(id);
    setDocumentName(saveAsName.trim() || "Untitled");
    savedContentRef.current = content;
    setSaveModalOpen(false);
    if (unsavedPrompt) {
      executePendingAction(unsavedPrompt);
      setUnsavedPrompt(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-surface">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-accent/50 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={requestClose}
          title="Return to the Timeline Outliner"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Outliner
        </Button>
        <div className="h-4 w-px bg-dark-accent/60" />
        <span className="text-sm font-medium text-dark-text">Beat Text Editor</span>
        <BeatEditorLanePicker laneId={laneId} onLaneChange={setLaneId} />
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={requestNewDocument}>
          New document
        </Button>
        <Button variant="secondary" size="sm" onClick={handleSave}>
          Save
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreateBeats}
          disabled={!laneId || segments.length === 0}
          title={!laneId ? "Select a target lane first" : undefined}
        >
          Create beats ({segments.length})
        </Button>
      </div>

      <div className="px-3 pt-2">
        <BeatEditorFieldToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          disabledFields={disabledFields}
          onToggleField={(field) =>
            setDisabledFields((d) => ({ ...d, [field]: !d[field] }))
          }
          onAutoDetectFields={handleCommitAndLabel}
          onInsertSeparator={handleInsertSeparator}
          autoDetectDisabled={false}
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

      <div className="flex-1 min-h-0 flex flex-col px-3 pb-3 pt-2">
        <BeatDocumentEditorView
          ref={editorRef}
          content={content}
          onChange={setContent}
          separatorsCommitted={separatorsCommitted}
          onPaste={insertAutoSeparatorsInText}
        />
      </div>

      <Modal
        isOpen={saveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        title="Save document"
        contentClassName="max-w-md"
      >
        <label className="block space-y-1 mb-4">
          <span className="text-xs text-dark-muted">Document name</span>
          <input
            type="text"
            value={saveAsName}
            onChange={(e) => setSaveAsName(e.target.value)}
            className="w-full px-2 py-1.5 rounded bg-dark-bg border border-dark-accent text-sm"
            autoFocus
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSaveModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirmSave}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={unsavedPrompt !== null}
        onClose={() => setUnsavedPrompt(null)}
        title="Unsaved changes"
        contentClassName="max-w-md"
      >
        <p className="text-sm text-dark-muted mb-4">
          {unsavedPrompt?.action === "close"
            ? "This document has unsaved changes. Save before returning to the Outliner?"
            : "This document has unsaved changes. Save before continuing?"}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setUnsavedPrompt(null)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (unsavedPrompt) {
                executePendingAction(unsavedPrompt);
                setUnsavedPrompt(null);
              }
            }}
          >
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSaveModalOpen(true);
            }}
          >
            Save…
          </Button>
        </div>
      </Modal>
    </div>
  );
}
