import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useChartsStore } from "../../store/chartsStore";

export type TemplateModalMode = "save" | "load" | "manage" | null;

interface ChartTemplatesModalProps {
  projectId: string | null;
  selectedCharacterId: string | null;
  mode: TemplateModalMode;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export default function ChartTemplatesModal({
  projectId,
  selectedCharacterId,
  mode,
  onClose,
  anchorRef,
}: ChartTemplatesModalProps) {
  const characters = useChartsStore((s) => s.characters);
  const listTemplates = useChartsStore((s) => s.listTemplates);
  const saveTemplateFromCharacter = useChartsStore((s) => s.saveTemplateFromCharacter);
  const applyTemplateToCharacter = useChartsStore((s) => s.applyTemplateToCharacter);
  const loadTemplateForEditing = useChartsStore((s) => s.loadTemplateForEditing);
  const renameTemplate = useChartsStore((s) => s.renameTemplate);
  const deleteTemplate = useChartsStore((s) => s.deleteTemplate);

  const [saveName, setSaveName] = useState("");
  const [loadTemplateId, setLoadTemplateId] = useState<string | null>(null);
  const [loadCharacterId, setLoadCharacterId] = useState<string | null>(null);
  const [loadMode, setLoadMode] = useState<"replace" | "link">("replace");
  const [manageTemplateId, setManageTemplateId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const templates = projectId ? listTemplates(projectId) : [];
  const selectedCharacter = characters.find((c) => c.id === selectedCharacterId);
  const hasSections = (selectedCharacter?.sections?.length ?? 0) > 0;

  useEffect(() => {
    if (!mode) return;
    setSaveName("");
    setSaveError(null);
    setLoadError(null);
    setLoadTemplateId(null);
    setLoadCharacterId(selectedCharacterId);
    setLoadMode("replace");
    setManageTemplateId(null);
    setRenameValue("");
  }, [mode, selectedCharacterId]);

  useEffect(() => {
    if (!mode) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mode, onClose, anchorRef]);

  const handleSave = () => {
    if (!projectId || !selectedCharacterId) return;
    setSaveError(null);
    if (!hasSections) {
      setSaveError("Add at least one section before saving.");
      return;
    }
    const name = saveName.trim() || "Untitled";
    const id = saveTemplateFromCharacter(projectId, selectedCharacterId, name);
    if (id) {
      onClose();
    } else {
      setSaveError("Could not save template.");
    }
  };

  const handleLoad = () => {
    if (!projectId || !loadTemplateId || !loadCharacterId) return;
    setLoadError(null);
    const targetChar = characters.find((c) => c.id === loadCharacterId);
    const hasExisting = (targetChar?.sections?.length ?? 0) > 0;
    if (loadMode === "replace" && hasExisting) {
      if (!window.confirm(`Copy layout to "${targetChar?.name}"? This will remove all existing sections and content.`)) {
        return;
      }
    }
    if (loadMode === "link" && (targetChar?.linkedTemplateId ?? null)) {
      if (!window.confirm(`"${targetChar?.name}" is already linked to a template. Link to the new template instead?`)) {
        return;
      }
    }
    applyTemplateToCharacter(projectId, loadCharacterId, loadTemplateId, loadMode);
    onClose();
  };

  const handleRename = () => {
    if (!projectId || !manageTemplateId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      renameTemplate(projectId, manageTemplateId, trimmed);
      setManageTemplateId(null);
      setRenameValue("");
    }
  };

  const handleDelete = (templateId: string) => {
    if (!projectId) return;
    if (window.confirm("Delete this template?")) {
      deleteTemplate(projectId, templateId);
      setManageTemplateId(null);
    }
  };

  const handleEdit = (templateId: string) => {
    if (!projectId) return;
    loadTemplateForEditing(projectId, templateId);
    onClose();
  };

  if (!mode) return null;

  const rect = anchorRef.current?.getBoundingClientRect();

  return createPortal(
    <div
      ref={containerRef}
      className="fixed z-[9999] rounded-lg border border-dark-accent bg-dark-surface shadow-xl min-w-[320px] max-w-[420px]"
      style={{
        top: rect ? rect.bottom + 8 : "50%",
        left: rect ? rect.left : "50%",
        transform: rect ? undefined : "translate(-50%, -50%)",
      }}
    >
      <div className="p-3 border-b border-dark-accent/50 flex items-center justify-between">
        <span className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          {mode === "save" && "Save layout as template"}
          {mode === "load" && "Load template"}
          {mode === "manage" && "Manage templates"}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-dark-muted hover:text-dark-text rounded"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4">
        {mode === "save" && (
          <>
            <p className="text-xs text-dark-muted">
              Save the selected character&apos;s layout (sections, attribute keys, label and image blocks) as a reusable template. Values are not stored.
            </p>
            {!hasSections && (
              <p className="text-xs text-amber-500">
                This character has no sections. Add sections first.
              </p>
            )}
            <div>
              <label className="block text-xs text-dark-muted mb-1">Template name</label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Standard Chart"
                className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded text-dark-text text-sm placeholder:text-dark-muted focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            {saveError && <p className="text-xs text-red-400">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded border border-dark-accent/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasSections}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </>
        )}

        {mode === "load" && (
          <>
            <p className="text-xs text-dark-muted">
              Apply a template to a character. Copy applies once; Link applies and keeps the character synced when the template changes.
            </p>
            <div>
              <label className="block text-xs text-dark-muted mb-1">Template</label>
              <select
                value={loadTemplateId ?? ""}
                onChange={(e) => setLoadTemplateId(e.target.value || null)}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded text-dark-text text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a template</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.createdAt ? ` (${new Date(t.createdAt).toLocaleDateString()})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-dark-muted mb-1">Apply to character</label>
              <select
                value={loadCharacterId ?? ""}
                onChange={(e) => setLoadCharacterId(e.target.value || null)}
                className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded text-dark-text text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select character</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-dark-muted mb-2">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="loadMode"
                    checked={loadMode === "replace"}
                    onChange={() => setLoadMode("replace")}
                    className="rounded-full border-dark-accent bg-dark-bg text-blue-500"
                  />
                  <span className="text-sm text-dark-text">Copy</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="loadMode"
                    checked={loadMode === "link"}
                    onChange={() => setLoadMode("link")}
                    className="rounded-full border-dark-accent bg-dark-bg text-blue-500"
                  />
                  <span className="text-sm text-dark-text">Link</span>
                </label>
              </div>
            </div>
            {loadError && <p className="text-xs text-red-400">{loadError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm text-dark-muted hover:text-dark-text rounded border border-dark-accent/50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLoad}
                disabled={!loadTemplateId || !loadCharacterId}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50"
              >
                Load
              </button>
            </div>
          </>
        )}

        {mode === "manage" && (
          <>
            {templates.length === 0 ? (
              <p className="text-sm text-dark-muted py-4">No templates yet. Save a layout as a template first.</p>
            ) : (
              <ul className="space-y-2 max-h-64 overflow-y-auto">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded border border-dark-accent/30 bg-dark-bg/50"
                  >
                    {manageTemplateId === t.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename()}
                          autoFocus
                          className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleRename}
                          className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setManageTemplateId(null)}
                          className="px-2 py-1 text-xs text-dark-muted hover:text-dark-text"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setManageTemplateId(t.id);
                            setRenameValue(t.name);
                          }}
                          className="text-sm text-dark-text truncate flex-1 text-left hover:text-blue-400 transition-colors"
                          title="Click to rename"
                        >
                          {t.name}
                          {t.createdAt && (
                            <span className="text-xs text-dark-muted ml-1">
                              ({new Date(t.createdAt).toLocaleDateString()})
                            </span>
                          )}
                        </button>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEdit(t.id)}
                            className="p-1.5 text-dark-muted hover:text-green-400 rounded"
                            title="Edit layout"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(t.id)}
                            className="p-1.5 text-dark-muted hover:text-red-400 rounded"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
