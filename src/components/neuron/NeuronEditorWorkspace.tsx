import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { Editor } from "@tiptap/react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import NeuronRichTextEditor from "./editor/NeuronRichTextEditor";
import NeuronRichTextToolbar from "./NeuronRichTextToolbar";
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
import {
  buildMirrorTrees,
  writeMirrorFileContent,
  renameMirrorEntity,
  createMirrorDocument,
  deleteMirrorDocument,
  getMirrorDocumentParentId,
  getMirrorAdapter,
} from "../../neuron/mirror";
import { useTimelineStore } from "../../store/timelineStore";
import {
  BEAT_TEXT_SCALE_PERCENT_MAX,
  BEAT_TEXT_SCALE_PERCENT_MIN,
} from "../../store/timelineTypes";
import { insertBeatAtCursor, insertLaneAtCursor } from "../../store/timelineTextBlocks";
import { previewDocumentDeleteCounts } from "../../store/timelineStore";
import {
  insertPersonDeclarationAtCursor,
  insertUnionBlockAtCursor,
  previewFamilyDocumentDeleteCounts,
} from "../../store/familyTreeDocumentHelpers";
import {
  resolvePaneRef,
  getMirrorEntityDisplayName,
  orderedUnifiedPaneIds,
} from "../../neuron/paneUtils";
import type { NeuronPaneRef, NeuronEditorPane, NeuronDrafts } from "../../neuron/paneTypes";
import { paneIdFromRef } from "../../neuron/paneTypes";

interface NeuronEditorWorkspaceProps {
  subProjects: Record<string, string>;
  panes: NeuronEditorPane[];
  activePaneId: string | null;
  unifiedScroll: boolean;
  onUnifiedScrollChange: (v: boolean) => void;
  unifiedSelectionIds: string[];
  drafts: NeuronDrafts;
  onDraftChange: (paneId: string, content: string, dirty?: boolean) => void;
  onActivePaneChange: (paneId: string) => void;
  onClosePane: (paneId: string) => void;
  onPanesChange: (panes: NeuronEditorPane[]) => void;
  paneFractions: number[];
  onPaneFractionsChange: (fractions: number[]) => void;
  uniformPaneWidth: boolean;
  onUniformPaneWidthChange: (v: boolean) => void;
  uniformPaneWidthPx: number;
  onUniformPaneWidthPxChange: (px: number) => void;
  textScalePercent: number;
  onTextScalePercentChange: (pct: number) => void;
}

export type { NeuronPaneRef, NeuronEditorPane, NeuronDrafts } from "../../neuron/paneTypes";
export { paneIdFromRef } from "../../neuron/paneTypes";

const UNIFORM_PANE_WIDTH_MIN = 240;
const UNIFORM_PANE_WIDTH_MAX = 1200;

function ViewModeToggle({
  unifiedScroll,
  onUnifiedScrollChange,
}: {
  unifiedScroll: boolean;
  onUnifiedScrollChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onUnifiedScrollChange(!unifiedScroll)}
      className={`px-2 py-1 text-xs rounded border ${
        unifiedScroll
          ? "bg-dark-accent border-dark-accent text-dark-text"
          : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
      }`}
      title="Toggle unified scroll vs side-by-side panes"
    >
      {unifiedScroll ? "Unified" : "Side-by-side"}
    </button>
  );
}

export default function NeuronEditorWorkspace({
  subProjects,
  panes,
  activePaneId,
  unifiedScroll,
  onUnifiedScrollChange,
  unifiedSelectionIds,
  drafts,
  onDraftChange,
  onActivePaneChange,
  onClosePane,
  onPanesChange,
  paneFractions,
  onPaneFractionsChange,
  uniformPaneWidth,
  onUniformPaneWidthChange,
  uniformPaneWidthPx,
  onUniformPaneWidthPxChange,
  textScalePercent,
  onTextScalePercentChange,
}: NeuronEditorWorkspaceProps) {
  const documents = useNeuronStore((s) => s.documents);
  const mirrors = useNeuronStore((s) => s.mirrors);
  const applyDocumentEdits = useNeuronStore((s) => s.applyDocumentEdits);
  const renameDocument = useNeuronStore((s) => s.renameDocument);
  const createDocument = useNeuronStore((s) => s.createDocument);
  const deleteDocument = useNeuronStore((s) => s.deleteDocument);
  const updateMirror = useNeuronStore((s) => s.updateMirror);

  const addImportLabelPrefix = useTimelineStore((s) => s.addImportLabelPrefix);
  const removeImportLabelPrefix = useTimelineStore((s) => s.removeImportLabelPrefix);
  const importLabelPrefixes = useTimelineStore((s) => s.importLabelPrefixes);

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
  const [renamingPaneId, setRenamingPaneId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileDeleteConfirm, setFileDeleteConfirm] = useState<{
    paneId: string;
    ref: NeuronPaneRef;
    fileName: string;
    counts: Record<string, number>;
  } | null>(null);
  const [richTextEditor, setRichTextEditor] = useState<Editor | null>(null);

  const editorRefs = useRef<Map<string, BeatDocumentEditorHandle | null>>(new Map());
  const mirrorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const paneRowRef = useRef<HTMLDivElement>(null);

  const activePane = panes.find((p) => p.id === activePaneId) ?? panes[0] ?? null;

  const mirrorTrees = useMemo(
    () => buildMirrorTrees(subProjects, mirrors),
    [subProjects, mirrors]
  );

  const binderDocOrder = useMemo(
    () => documents.map((d) => `user:${d.id}`),
    [documents]
  );

  const unifiedPaneIds = useMemo(
    () => orderedUnifiedPaneIds(unifiedSelectionIds, binderDocOrder, mirrorTrees),
    [unifiedSelectionIds, binderDocOrder, mirrorTrees]
  );

  const viewToggle = (
    <ViewModeToggle unifiedScroll={unifiedScroll} onUnifiedScrollChange={onUnifiedScrollChange} />
  );

  const commitMirrorDraft = useCallback(
    async (ref: Extract<NeuronPaneRef, { kind: "mirror" }>, content: string) => {
      const { subId, registryId, entityId } = ref;
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

  const handleMirrorContentChange = useCallback(
    (paneId: string, ref: Extract<NeuronPaneRef, { kind: "mirror" }>, content: string) => {
      onDraftChange(paneId, content, true);
      if (mirrorSaveTimers.current[paneId]) {
        clearTimeout(mirrorSaveTimers.current[paneId]);
      }
      mirrorSaveTimers.current[paneId] = setTimeout(() => {
        void commitMirrorDraft(ref, content);
        onDraftChange(paneId, content, false);
      }, 800);
    },
    [onDraftChange, commitMirrorDraft]
  );

  const getMirrorContent = useCallback(
    (paneId: string, ref: Extract<NeuronPaneRef, { kind: "mirror" }>) => {
      const draft = drafts[paneId];
      if (draft) return draft.content;
      const payload = mirrors[ref.subId];
      if (!payload) return "";
      if (payload.moduleType === "timeline" || payload.moduleType === "familyTree") {
        return payload.documents?.find((d) => d.id === ref.entityId)?.content ?? "";
      }
      return "";
    },
    [drafts, mirrors]
  );

  const getUserContent = useCallback(
    (paneId: string, docId: string) => {
      const draft = drafts[paneId];
      if (draft) return draft.content;
      return documents.find((d) => d.id === docId)?.content ?? "";
    },
    [drafts, documents]
  );

  const getPaneLabel = useCallback(
    (ref: NeuronPaneRef): string => {
      if (ref.kind === "user") {
        return documents.find((d) => d.id === ref.docId)?.name ?? "Document";
      }
      const payload = mirrors[ref.subId];
      return getMirrorEntityDisplayName(ref.registryId, payload, ref.entityId, "file");
    },
    [documents, mirrors]
  );

  const commitRename = useCallback(
    (_paneId: string, ref: NeuronPaneRef) => {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        setRenamingPaneId(null);
        return;
      }
      if (ref.kind === "user") {
        renameDocument(ref.docId, trimmed);
      } else {
        const payload = mirrors[ref.subId];
        if (!payload) return;
        const patched = renameMirrorEntity(
          ref.registryId,
          payload,
          ref.entityId,
          "file",
          trimmed
        );
        updateMirror(ref.subId, patched);
        void getStorageDriver().saveProjectData(ref.subId, patched);
      }
      setRenamingPaneId(null);
    },
    [renameValue, renameDocument, mirrors, updateMirror]
  );

  const renderPaneNameHeader = (
    paneId: string,
    ref: NeuronPaneRef,
    isActive: boolean,
    dirtySuffix: React.ReactNode
  ) => {
    const name = getPaneLabel(ref);
    if (renamingPaneId === paneId) {
      return (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => commitRename(paneId, ref)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(paneId, ref);
            if (e.key === "Escape") setRenamingPaneId(null);
          }}
          className="flex-1 min-w-0 px-1 py-0.5 text-xs bg-dark-bg border border-blue-500/50 rounded text-dark-text"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      );
    }
    return (
      <>
        <span
          className="flex-1 truncate"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (!isActive) return;
            setRenamingPaneId(paneId);
            setRenameValue(name);
          }}
        >
          {name}
        </span>
        {dirtySuffix}
      </>
    );
  };

  const handleExpandAllPanes = () => {
    if (panes.length === 0) return;
    onUniformPaneWidthChange(false);
    onPaneFractionsChange(panes.map(() => 1 / panes.length));
  };

  const clampUniformWidth = (px: number) =>
    Math.min(UNIFORM_PANE_WIDTH_MAX, Math.max(UNIFORM_PANE_WIDTH_MIN, px));

  const handleDividerPointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    if (uniformPaneWidth) {
      const startX = e.clientX;
      const startWidth = uniformPaneWidthPx;
      const onMove = (ev: PointerEvent) => {
        onUniformPaneWidthPxChange(clampUniformWidth(startWidth + (ev.clientX - startX)));
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      return;
    }
    const startX = e.clientX;
    const startFractions = [...paneFractions];
    const container = e.currentTarget.parentElement?.parentElement as HTMLElement | null;
    if (!container) return;
    const width = container.getBoundingClientRect().width;
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / width;
      const next = [...startFractions];
      const left = Math.max(0.15, Math.min(0.85, startFractions[index]! + delta));
      const rightOrig = startFractions[index]! + startFractions[index + 1]!;
      next[index] = left;
      next[index + 1] = Math.max(0.15, rightOrig - left);
      const sum = next.reduce((a, b) => a + b, 0);
      onPaneFractionsChange(next.map((f) => f / sum));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handlePaneRowWheel = (e: React.WheelEvent) => {
    if (!uniformPaneWidth || !paneRowRef.current) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    paneRowRef.current.scrollLeft += e.deltaY;
    e.preventDefault();
  };

  const activeMirrorRef =
    activePane?.ref.kind === "mirror" ? activePane.ref : null;

  const handleAutoDetectFields = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const content = drafts[activePane.id]?.content ?? getMirrorContent(activePane.id, activePane.ref);
    const activePrefixList = importLabelPrefixes.filter((p) => activePrefixes.has(p));
    const next = applyAutoLabelsToDocument(content, disabledFields, activePrefixList);
    handleMirrorContentChange(activePane.id, activePane.ref, next);
    editorRefs.current.get(activePane.id)?.setContentWithCursor(next, editorRefs.current.get(activePane.id)?.getCursorPos() ?? 0);
  };

  const handleInsertSeparator = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const handle = editorRefs.current.get(activePane.id);
    const content = drafts[activePane.id]?.content ?? getMirrorContent(activePane.id, activePane.ref);
    const pos = handle?.getCursorPos() ?? content.length;
    const next = insertSeparatorAtCursor(content, pos);
    handleMirrorContentChange(activePane.id, activePane.ref, next);
  };

  useEffect(() => {
    if (!activeTool || !activePane || activePane.ref.kind !== "mirror") return;
    const mirrorRef = activePane.ref;
    const paneId = activePane.id;
    const onMouseUp = () => {
      const handle = editorRefs.current.get(paneId);
      const sel = handle?.getSelection();
      if (!sel || !handle) return;
      const content = handle.getView()?.state.doc.toString() ?? "";
      const segment = findSegmentForOffset(content, sel.from);
      if (!segment) return;
      const segmentText = content.slice(segment.start, segment.end);
      const updatedSegment = assignFieldInSegment(segmentText, activeTool, sel.text.trim());
      const next =
        content.slice(0, segment.start) + updatedSegment + content.slice(segment.end);
      handleMirrorContentChange(paneId, mirrorRef, next);
    };
    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [activeTool, activePane, handleMirrorContentChange]);

  const handleMirrorNewFile = () => {
    if (!activeMirrorRef) return;
    const payload = mirrors[activeMirrorRef.subId];
    if (!payload) return;
    const parentId = getMirrorDocumentParentId(
      activeMirrorRef.registryId,
      payload,
      activeMirrorRef.entityId
    );
    const result = createMirrorDocument(activeMirrorRef.registryId, payload, {
      parentEntityId: parentId ?? undefined,
    });
    if (!result) return;
    updateMirror(activeMirrorRef.subId, result.payload);
    void getStorageDriver().saveProjectData(activeMirrorRef.subId, result.payload);
    const ref: NeuronPaneRef = {
      kind: "mirror",
      subId: activeMirrorRef.subId,
      registryId: activeMirrorRef.registryId,
      entityId: result.docId,
      name: "Untitled",
    };
    const id = paneIdFromRef(ref);
    if (activePaneId) {
      onPanesChange(panes.map((p) => (p.id === activePaneId ? { id, ref } : p)));
      onActivePaneChange(id);
    } else {
      onPanesChange([...panes, { id, ref }]);
      onActivePaneChange(id);
    }
  };

  const handleMirrorDeleteFile = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const ref = activePane.ref;
    const payload = mirrors[ref.subId];
    if (!payload) return;
    const content = getMirrorContent(activePane.id, ref);
    let counts: Record<string, number> = {};
    if (ref.registryId === "timeline") {
      const c = previewDocumentDeleteCounts(content);
      counts = { laneCount: c.laneCount, beatCount: c.beatCount, crossingCount: c.crossingCount };
    } else {
      const c = previewFamilyDocumentDeleteCounts(content);
      counts = { personCount: c.personCount, unionCount: c.unionCount };
    }
    setFileDeleteConfirm({
      paneId: activePane.id,
      ref,
      fileName: getPaneLabel(ref),
      counts,
    });
  };

  const confirmMirrorDelete = () => {
    if (!fileDeleteConfirm || fileDeleteConfirm.ref.kind !== "mirror") return;
    const { ref, paneId } = fileDeleteConfirm;
    const payload = mirrors[ref.subId];
    if (!payload) return;
    const content = getMirrorContent(paneId, ref);
    const result = deleteMirrorDocument(ref.registryId, payload, ref.entityId, content);
    if (!result) return;
    updateMirror(ref.subId, result.payload);
    void getStorageDriver().saveProjectData(ref.subId, result.payload);
    onClosePane(paneId);
    setFileDeleteConfirm(null);
  };

  const handleUserNewFile = () => {
    const docId = createDocument();
    const ref: NeuronPaneRef = { kind: "user", docId };
    const id = paneIdFromRef(ref);
    if (activePaneId) {
      onPanesChange(panes.map((p) => (p.id === activePaneId ? { id, ref } : p)));
      onActivePaneChange(id);
    } else {
      onPanesChange([...panes, { id, ref }]);
      onActivePaneChange(id);
    }
  };

  const handleUserDeleteFile = () => {
    if (!activePane || activePane.ref.kind !== "user") return;
    deleteDocument(activePane.ref.docId);
    onClosePane(activePane.id);
  };

  const handleTimelineInsertBeat = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const content = getMirrorContent(activePane.id, activePane.ref);
    const handle = editorRefs.current.get(activePane.id);
    const pos = handle?.getCursorPos() ?? content.length;
    const result = insertBeatAtCursor(content, pos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    setParseErrors([]);
    handleMirrorContentChange(activePane.id, activePane.ref, result.content);
    handle?.setContentWithCursor(result.content, result.cursorPos);
  };

  const handleTimelineInsertLane = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const payload = mirrors[activePane.ref.subId];
    const laneCount =
      payload?.moduleType === "timeline" ? (payload.lanes?.length ?? 0) : 0;
    const content = getMirrorContent(activePane.id, activePane.ref);
    const result = insertLaneAtCursor(content, laneCount, `Lane ${laneCount + 1}`);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    setParseErrors([]);
    handleMirrorContentChange(activePane.id, activePane.ref, result.content);
    editorRefs.current.get(activePane.id)?.setContentWithCursor(result.content, result.cursorPos);
  };

  const handleFamilyInsertPerson = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const content = getMirrorContent(activePane.id, activePane.ref);
    const handle = editorRefs.current.get(activePane.id);
    const pos = handle?.getCursorPos() ?? content.length;
    const result = insertPersonDeclarationAtCursor(content, pos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    setParseErrors([]);
    handleMirrorContentChange(activePane.id, activePane.ref, result.content);
    handle?.setContentWithCursor(result.content, result.cursorPos);
  };

  const handleFamilyInsertUnion = () => {
    if (!activePane || activePane.ref.kind !== "mirror") return;
    const content = getMirrorContent(activePane.id, activePane.ref);
    const handle = editorRefs.current.get(activePane.id);
    const pos = handle?.getCursorPos() ?? content.length;
    const result = insertUnionBlockAtCursor(content, pos);
    if (!result.ok) {
      setParseErrors([result.error]);
      return;
    }
    setParseErrors([]);
    handleMirrorContentChange(activePane.id, activePane.ref, result.content);
    handle?.setContentWithCursor(result.content, result.cursorPos);
  };

  const renderScriptToolbar = (registryId: string) => {
    const moduleLabel = getMirrorAdapter(registryId)?.moduleLabel ?? "Module";
    const activeDirty = activePane ? drafts[activePane.id]?.dirty : false;
    const activeName = activePane ? getPaneLabel(activePane.ref) : null;
    const toolbarPaneId = activePane?.id ?? null;
    const toolbarRef = activePane?.ref ?? null;

    const renderToolbarName = () => {
      if (!activeName || !toolbarPaneId || !toolbarRef) return null;
      if (renamingPaneId === toolbarPaneId) {
        return (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRename(toolbarPaneId, toolbarRef)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(toolbarPaneId, toolbarRef);
              if (e.key === "Escape") setRenamingPaneId(null);
            }}
            className="text-xs px-1 py-0.5 bg-dark-bg border border-blue-500/50 rounded text-dark-text max-w-[200px]"
            autoFocus
          />
        );
      }
      return (
        <span
          className="text-xs text-dark-muted truncate max-w-[200px] cursor-text"
          onDoubleClick={() => {
            setRenamingPaneId(toolbarPaneId);
            setRenameValue(activeName);
          }}
        >
          {activeName}
          {activeDirty ? " •" : ""}
        </span>
      );
    };

    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-accent/50 flex-wrap bg-dark-surface">
        <span className="text-sm font-medium text-dark-text">Script editor — {moduleLabel}</span>
        {renderToolbarName()}
        <div className="h-4 w-px bg-dark-accent/60" />
        <Button variant="secondary" size="sm" onClick={handleMirrorNewFile}>
          New file
        </Button>
        {registryId === "timeline" && (
          <>
            <Button variant="secondary" size="sm" onClick={handleTimelineInsertBeat} disabled={!activePane}>
              Insert beat
            </Button>
            <Button variant="secondary" size="sm" onClick={handleTimelineInsertLane} disabled={!activePane}>
              Insert lane
            </Button>
          </>
        )}
        {registryId === "familyTree" && (
          <>
            <Button variant="secondary" size="sm" onClick={handleFamilyInsertPerson} disabled={!activePane}>
              Insert person
            </Button>
            <Button variant="secondary" size="sm" onClick={handleFamilyInsertUnion} disabled={!activePane}>
              Insert union
            </Button>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={handleMirrorDeleteFile} disabled={!activePane}>
          Delete file
        </Button>
        <div className="h-4 w-px bg-dark-accent/60" />
        <button
          type="button"
          onClick={() => onUniformPaneWidthChange(!uniformPaneWidth)}
          disabled={unifiedScroll}
          className={`px-2 py-1 text-xs rounded border disabled:opacity-50 disabled:cursor-not-allowed ${
            uniformPaneWidth
              ? "bg-dark-accent border-dark-accent text-dark-text"
              : "border-dark-accent/50 text-dark-muted hover:text-dark-text"
          }`}
        >
          Uniform width
        </button>
        <button
          type="button"
          onClick={handleExpandAllPanes}
          disabled={panes.length === 0 || unifiedScroll}
          className="px-2 py-1 text-xs rounded border border-dark-accent/50 text-dark-muted hover:text-dark-text disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Expand all panes
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dark-muted whitespace-nowrap">
            Text size: {textScalePercent}%
          </span>
          <input
            type="range"
            min={BEAT_TEXT_SCALE_PERCENT_MIN}
            max={BEAT_TEXT_SCALE_PERCENT_MAX}
            step={5}
            value={textScalePercent}
            onChange={(e) => onTextScalePercentChange(Number(e.target.value))}
            className="w-20 h-1 accent-blue-500 cursor-pointer"
          />
        </div>
        <div className="flex-1" />
        {viewToggle}
      </div>
    );
  };

  const renderRichTextToolbarRow = () => {
    const userRef = activePane?.ref.kind === "user" ? activePane.ref : null;
    const activeName = userRef
      ? documents.find((d) => d.id === userRef.docId)?.name
      : null;
    const activeDirty = activePane ? drafts[activePane.id]?.dirty : false;
    const toolbarPaneId = activePane?.id ?? null;
    const toolbarRef = activePane?.ref ?? null;

    const renderToolbarName = () => {
      if (!activeName || !toolbarPaneId || !toolbarRef) return null;
      if (renamingPaneId === toolbarPaneId) {
        return (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => commitRename(toolbarPaneId, toolbarRef)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename(toolbarPaneId, toolbarRef);
              if (e.key === "Escape") setRenamingPaneId(null);
            }}
            className="text-xs px-1 py-0.5 bg-dark-bg border border-blue-500/50 rounded text-dark-text max-w-[200px]"
            autoFocus
          />
        );
      }
      return (
        <span
          className="text-xs text-dark-muted truncate max-w-[200px] cursor-text"
          onDoubleClick={() => {
            setRenamingPaneId(toolbarPaneId);
            setRenameValue(activeName);
          }}
        >
          {activeName}
          {activeDirty ? " •" : ""}
        </span>
      );
    };

    return (
      <div className="flex items-center gap-2 px-3 py-2 border-b border-dark-accent/50 flex-wrap bg-dark-surface">
        <span className="text-sm font-medium text-dark-text">Rich text</span>
        {renderToolbarName()}
        <div className="h-4 w-px bg-dark-accent/60" />
        <Button variant="secondary" size="sm" onClick={handleUserNewFile}>
          New file
        </Button>
        <Button variant="secondary" size="sm" onClick={handleUserDeleteFile} disabled={!activePane}>
          Delete file
        </Button>
        <div className="h-4 w-px bg-dark-accent/60" />
        <NeuronRichTextToolbar
          editor={richTextEditor}
          showRuler={showRuler}
          onToggleRuler={() => setShowRuler((v) => !v)}
          embedded
        />
        <div className="flex-1" />
        {viewToggle}
      </div>
    );
  };

  const renderMirrorEditor = (paneId: string, ref: Extract<NeuronPaneRef, { kind: "mirror" }>) => {
    const content = getMirrorContent(paneId, ref);
    return (
      <BeatDocumentEditorView
        ref={(h) => {
          editorRefs.current.set(paneId, h);
        }}
        content={content}
        onChange={(c) => handleMirrorContentChange(paneId, ref, c)}
        separatorsCommitted={false}
        onPaste={insertAutoSeparatorsInText}
        fontSizePercent={textScalePercent}
      />
    );
  };

  const renderUserEditor = (paneId: string, docId: string) => {
    const content = getUserContent(paneId, docId);
    return (
      <NeuronRichTextEditor
        content={content}
        onChange={(c) => {
          onDraftChange(paneId, c, false);
          applyDocumentEdits(docId, c);
        }}
        leftMargin={leftMargin}
        rightMargin={rightMargin}
        onMarginChange={(l, r) => {
          setLeftMargin(l);
          setRightMargin(r);
        }}
        showRuler={showRuler}
        onToggleRuler={() => setShowRuler((v) => !v)}
        hideToolbar
        onEditorReady={setRichTextEditor}
      />
    );
  };

  const resolveUnifiedPane = (paneId: string): NeuronEditorPane | null => {
    const existing = panes.find((p) => p.id === paneId);
    if (existing) return existing;
    const ref = resolvePaneRef(paneId, subProjects, mirrors);
    if (!ref) return null;
    return { id: paneId, ref };
  };

  const renderSideBySidePane = (pane: NeuronEditorPane, index: number) => {
    const isActive = pane.id === activePaneId;
    const frac = paneFractions[index] ?? 1 / panes.length;
    const paneStyle = uniformPaneWidth
      ? { width: uniformPaneWidthPx, flexShrink: 0 as const }
      : { flex: frac };

    return (
      <div key={pane.id} className="flex min-h-0 min-w-0" style={paneStyle}>
        <div
          className={`flex-1 min-w-0 min-h-0 flex flex-col ${
            isActive ? "ring-1 ring-inset ring-blue-500/50" : ""
          }`}
          onFocusCapture={() => onActivePaneChange(pane.id)}
          onPointerDown={() => onActivePaneChange(pane.id)}
        >
          <div className="px-2 py-1 text-xs text-dark-muted border-b border-dark-accent/30 flex items-center gap-1 min-w-0">
            {renderPaneNameHeader(
              pane.id,
              pane.ref,
              isActive,
              drafts[pane.id]?.dirty ? " •" : null
            )}
            <button
              type="button"
              className="text-dark-muted hover:text-red-400 shrink-0"
              onClick={() => onClosePane(pane.id)}
            >
              ×
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {pane.ref.kind === "user"
              ? renderUserEditor(pane.id, pane.ref.docId)
              : renderMirrorEditor(pane.id, pane.ref)}
          </div>
        </div>
        {index < panes.length - 1 && (
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => handleDividerPointerDown(index, e)}
            className="w-1.5 flex-shrink-0 cursor-col-resize bg-dark-accent/20 hover:bg-dark-accent/50"
          />
        )}
      </div>
    );
  };

  const renderUnifiedSection = (paneId: string) => {
    const pane = resolveUnifiedPane(paneId);
    if (!pane) return null;
    const isActive = pane.id === activePaneId;

    return (
      <div
        key={paneId}
        className={`border-b border-dark-accent/40 ${isActive ? "bg-blue-500/5" : ""}`}
        onFocusCapture={() => onActivePaneChange(pane.id)}
        onPointerDown={() => {
          onActivePaneChange(pane.id);
          if (!panes.some((p) => p.id === pane.id)) {
            onPanesChange([...panes, pane]);
          }
        }}
      >
        <div className="px-3 py-1.5 text-xs font-medium text-dark-muted uppercase tracking-wide border-b border-dark-accent/30 sticky top-0 bg-dark-surface z-10 flex items-center gap-2 min-w-0">
          {renderPaneNameHeader(
            pane.id,
            pane.ref,
            isActive,
            drafts[pane.id]?.dirty ? " · Unsaved" : null
          )}
        </div>
        <div className="min-h-[280px] h-[40vh] px-3 pb-3 pt-2 overflow-hidden flex flex-col">
          {pane.ref.kind === "user"
            ? renderUserEditor(pane.id, pane.ref.docId)
            : renderMirrorEditor(pane.id, pane.ref)}
        </div>
      </div>
    );
  };

  const hasContent = unifiedScroll ? unifiedPaneIds.length > 0 : panes.length > 0;
  const showRichTextToolbar =
    activePane?.ref.kind === "user" || (!activePane && panes.some((p) => p.ref.kind === "user"));

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-dark-bg">
      {activePane?.ref.kind === "mirror" && renderScriptToolbar(activePane.ref.registryId)}
      {showRichTextToolbar && activePane?.ref.kind !== "mirror" && renderRichTextToolbarRow()}

      {activeMirrorRef?.registryId === "timeline" && (
        <div className="px-3 pt-2 border-b border-dark-accent/50 bg-dark-surface">
          <BeatEditorFieldToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            disabledFields={disabledFields}
            onToggleField={(field) =>
              setDisabledFields((d) => ({ ...d, [field]: !d[field] }))
            }
            onAutoDetectFields={handleAutoDetectFields}
            onInsertSeparator={handleInsertSeparator}
            autoDetectDisabled={!activePane}
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

      {parseErrors.length > 0 && (
        <div className="px-3 py-2 border-b border-red-500/40 bg-red-500/10 text-xs text-red-300 space-y-0.5">
          {parseErrors.map((err) => (
            <p key={err}>{err}</p>
          ))}
        </div>
      )}

      {!hasContent ? (
        <div className="flex-1 flex items-center justify-center text-dark-muted text-sm px-4 text-center">
          Select or create a file in the binder to start editing.
        </div>
      ) : unifiedScroll ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {unifiedPaneIds.map((paneId) => renderUnifiedSection(paneId))}
        </div>
      ) : (
        <div
          ref={paneRowRef}
          onWheel={handlePaneRowWheel}
          className={`flex-1 min-h-0 flex overflow-y-hidden ${
            uniformPaneWidth ? "overflow-x-auto" : ""
          }`}
        >
          {uniformPaneWidth && (
            <div
              className="flex min-h-0 flex-shrink-0"
              style={{ minWidth: uniformPaneWidthPx * panes.length }}
            >
              {panes.map((pane, i) => renderSideBySidePane(pane, i))}
            </div>
          )}
          {!uniformPaneWidth && panes.map((pane, i) => renderSideBySidePane(pane, i))}
        </div>
      )}

      <Modal
        isOpen={fileDeleteConfirm != null}
        onClose={() => setFileDeleteConfirm(null)}
        title="Delete file?"
        contentClassName="max-w-md"
      >
        {fileDeleteConfirm && (
          <>
            <p className="text-sm text-dark-muted mb-4">
              Deleting{" "}
              <span className="text-dark-text font-medium">{fileDeleteConfirm.fileName}</span> will
              remove associated entities from the module. This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFileDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={confirmMirrorDelete}>
                Delete file
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
