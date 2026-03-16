import { useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { useCharacterProfilesStore } from "../../store/characterProfilesStore";
import Button from "../ui/Button";

export default function ProfilesEntitiesPanel() {
  const { id: projectId } = useParams<{ id: string }>();
  const characters = useCharacterProfilesStore((s) => s.characters);
  const selectedCharacterId = useCharacterProfilesStore((s) => s.selectedCharacterId);
  const comparisonCharacterId = useCharacterProfilesStore((s) => s.comparisonCharacterId);
  const setSelectedCharacter = useCharacterProfilesStore((s) => s.setSelectedCharacter);
  const removeCharacter = useCharacterProfilesStore((s) => s.removeCharacter);
  const updateCharacterName = useCharacterProfilesStore((s) => s.updateCharacterName);
  const chartLayoutMode = useCharacterProfilesStore((s) => s.chartLayoutMode);
  const editLayoutDirty = useCharacterProfilesStore((s) => s.editLayoutDirty);
  const getTemplateById = useCharacterProfilesStore((s) => s.getTemplateById);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [pendingCharacterId, setPendingCharacterId] = useState<string | null>(null);

  const isCreatingLayout = chartLayoutMode === "createLayout";

  const needsDirtyConfirm =
    chartLayoutMode === "edit" &&
    editLayoutDirty &&
    pendingCharacterId != null &&
    pendingCharacterId !== selectedCharacterId;

  const startEditing = (e: React.MouseEvent, characterId: string, currentName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingCharacterId(characterId);
    setDraftName(currentName || "New Character");
  };

  const saveEdit = (characterId: string) => {
    if (!projectId) return;
    const trimmed = draftName.trim() || "New Character";
    updateCharacterName(projectId, characterId, trimmed);
    setEditingCharacterId(null);
  };

  const cancelEdit = () => {
    setEditingCharacterId(null);
  };

  const selectedIds = [
    selectedCharacterId,
    comparisonCharacterId,
  ].filter((id): id is string => id != null);
  const hasSelection = selectedIds.length > 0;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const selectedChars = selectedIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => c != null);
  const anySelectedHasLayout = selectedChars.some((c) => (c.sections?.length ?? 0) > 0);

  const handleDeleteClick = () => {
    if (!hasSelection || !projectId) return;
    if (anySelectedHasLayout) {
      setDeleteConfirmOpen(true);
    } else {
      for (const id of selectedIds) {
        removeCharacter(projectId, id);
      }
    }
  };

  const handleConfirmDelete = () => {
    if (!projectId) return;
    for (const id of selectedIds) {
      removeCharacter(projectId, id);
    }
    setDeleteConfirmOpen(false);
  };

  const panelRef = useRef<HTMLDivElement>(null);

  const handlePanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      onKeyDown={handlePanelKeyDown}
      className="w-[260px] flex-shrink-0 border-r border-dark-accent/50 bg-dark-surface flex flex-col overflow-hidden outline-none focus:ring-1 focus:ring-inset focus:ring-dark-accent/50"
    >
      <div className="p-4 border-b border-dark-accent/50">
        <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
          Entities
        </h2>
        <p className="text-dark-muted text-xs mt-1">Character profiles</p>
      </div>
      <div className="p-3 border-b border-dark-accent/50">
        <input
          type="text"
          placeholder="Search..."
          className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm placeholder-dark-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          readOnly
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {characters.length === 0 ? (
          <p className="text-dark-muted text-sm py-4 text-center">No entities yet.</p>
        ) : (
          <div className="space-y-1">
            {characters.map((char) =>
              editingCharacterId === char.id ? (
                <div
                  key={char.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl border border-dark-accent/30 bg-dark-accent/30"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => saveEdit(char.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(char.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                    className="flex-1 min-w-0 px-2 py-1 text-sm bg-dark-bg border border-blue-500 rounded text-dark-text focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <svg
                    className="w-4 h-4 text-dark-muted flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              ) : (
                <div
                  key={char.id}
                  role="button"
                  tabIndex={isCreatingLayout ? -1 : 0}
                  onKeyDown={(e) => {
                    if (e.key === "Delete" || e.key === "Backspace") {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  onClick={(e) => {
                    if (isCreatingLayout) return;
                    if (char.id === selectedCharacterId && !e.shiftKey) return;
                    if (chartLayoutMode === "edit" && editLayoutDirty && !e.shiftKey) {
                      if (char.id !== selectedCharacterId) setPendingCharacterId(char.id);
                      return;
                    }
                    setSelectedCharacter(char.id, e.shiftKey);
                  }}
                  onDoubleClick={(e) => {
                    if (isCreatingLayout) return;
                    startEditing(e, char.id, char.name);
                  }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors ${
                    isCreatingLayout
                      ? "cursor-not-allowed opacity-60 pointer-events-none"
                      : "cursor-pointer hover:bg-dark-accent/30"
                  } ${
                    selectedCharacterId === char.id || comparisonCharacterId === char.id
                      ? "border-blue-500 bg-blue-500/20 ring-1 ring-blue-500/50"
                      : "border-dark-accent/30"
                  }`}
                >
                  <div className="w-6 h-6 rounded-full bg-dark-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-dark-text text-sm truncate block">{char.name}</span>
                    {projectId && char.linkedTemplateId && (
                      <span className="text-[10px] text-dark-muted truncate block" title={`Linked to ${getTemplateById(projectId, char.linkedTemplateId)?.name ?? "template"}`}>
                        Linked to {getTemplateById(projectId, char.linkedTemplateId)?.name ?? "template"}
                      </span>
                    )}
                  </div>
                  <svg
                    className="w-4 h-4 text-dark-muted flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <div className="p-3 border-t border-dark-accent/50">
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={!hasSelection}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent border-dark-accent/50 text-dark-muted hover:text-red-400 hover:border-red-500/50 hover:bg-red-500/10"
          title={hasSelection ? "Delete selected character(s)" : "Select a character to delete"}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>

      {deleteConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                {selectedIds.length === 1
                  ? `Delete "${characters.find((c) => c.id === selectedIds[0])?.name ?? "this character"}"? This action cannot be undone.`
                  : `Delete ${selectedIds.length} characters? This action cannot be undone.`}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDeleteConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleConfirmDelete}>
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {needsDirtyConfirm &&
        createPortal(
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50">
            <div className="bg-dark-surface rounded-lg border border-dark-accent p-4 max-w-sm mx-4 shadow-lg">
              <p className="text-sm text-dark-text mb-3">
                You have unsaved layout changes. Discard and switch character?
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPendingCharacterId(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (pendingCharacterId != null) {
                      setSelectedCharacter(pendingCharacterId);
                      setPendingCharacterId(null);
                    }
                  }}
                >
                  Discard & switch
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
