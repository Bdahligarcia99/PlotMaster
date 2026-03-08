import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";
import { useCharacterProfilesStore } from "../../store/characterProfilesStore";
import { useParams } from "react-router-dom";
import ProfileTemplatesModal, { type TemplateModalMode } from "./ProfileTemplatesModal";

export default function ProfilesToolbar() {
  const { id } = useParams<{ id: string }>();
  const {
    activeProjectId,
    selectedCharacterId,
    setActiveProject,
    chartLayoutMode,
    setChartLayoutMode,
    addCharacter,
  } = useCharacterProfilesStore();

  const canEditStructure = chartLayoutMode === "edit";

  const [templateModalMode, setTemplateModalMode] = useState<TemplateModalMode>(null);
  const templateButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      setActiveProject(id);
    } else {
      setActiveProject(null);
    }
    return () => setActiveProject(null);
  }, [id, setActiveProject]);

  const handleAddCharacter = () => {
    if (id) addCharacter(id);
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-dark-surface border-b border-dark-accent/50">
      <Button
        variant="secondary"
        size="sm"
        disabled={!activeProjectId}
        onClick={() => setChartLayoutMode("createLayout")}
        title={activeProjectId ? "Create a new layout template" : "No project loaded"}
      >
        New layout
      </Button>
      <Button
        variant="primary"
        size="sm"
        onClick={handleAddCharacter}
        disabled={!activeProjectId}
        title={
          activeProjectId
            ? "Add a new character to the entity panel"
            : "No project loaded"
        }
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
        Character
      </Button>

      <div ref={templateButtonRef} className="relative flex rounded-lg overflow-hidden border border-dark-accent/50">
        {canEditStructure && selectedCharacterId && (
          <Button
            variant="secondary"
            size="sm"
            disabled={!activeProjectId}
            onClick={() => setTemplateModalMode((m) => (m ? null : "save"))}
            title="Save layout as template"
            className="rounded-none border-0 rounded-l-lg"
          >
            Save layout
          </Button>
        )}
        <button
          type="button"
          onClick={() => setTemplateModalMode((m) => (m === "load" ? null : "load"))}
          disabled={!activeProjectId}
          className={`px-2 py-1.5 text-sm border-dark-accent/50 bg-dark-accent hover:bg-dark-accent/80 text-dark-text disabled:opacity-50 transition-colors ${
            canEditStructure && selectedCharacterId ? "border-l" : "rounded-l-lg"
          }`}
          title="Load template"
        >
          Load
        </button>
        <button
          type="button"
          onClick={() => setTemplateModalMode((m) => (m === "manage" ? null : "manage"))}
          disabled={!activeProjectId}
          className="rounded-r-lg px-2 py-1.5 text-sm border-l border-dark-accent/50 bg-dark-accent hover:bg-dark-accent/80 text-dark-text disabled:opacity-50 transition-colors"
          title="Manage templates"
        >
          Templates
        </button>
      </div>

      <ProfileTemplatesModal
        projectId={id ?? null}
        selectedCharacterId={selectedCharacterId}
        mode={templateModalMode}
        onClose={() => setTemplateModalMode(null)}
        anchorRef={templateButtonRef}
      />
    </div>
  );
}
