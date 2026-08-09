import { useState, useEffect, useRef } from "react";
import Button from "../ui/Button";
import { useChartsStore } from "../../store/chartsStore";
import { useParams } from "react-router-dom";
import ChartTemplatesModal, { type TemplateModalMode } from "./ChartTemplatesModal";

export default function ChartsToolbar() {
  const { id } = useParams<{ id: string }>();
  const {
    activeProjectId,
    selectedCharacterId,
    comparisonCharacterId,
    setActiveProject,
    chartLayoutMode,
    setChartLayoutMode,
    addCharacter,
    chartSectionLayoutMode,
    setChartSectionLayoutMode,
  } = useChartsStore();

  const canEditStructure = chartLayoutMode === "edit";
  const isComparisonMode = Boolean(comparisonCharacterId);

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
            ? "Add a new chart to the entity panel"
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
        Chart
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

      <div className="ml-auto flex rounded-lg overflow-hidden border border-dark-accent/50">
        <button
          type="button"
          onClick={() => setChartSectionLayoutMode("list")}
          disabled={!activeProjectId}
          title="List layout – H2 sections stacked vertically"
          className={`px-2 py-1.5 text-sm transition-colors ${
            chartSectionLayoutMode === "list"
              ? "bg-dark-accent text-dark-text"
              : "bg-dark-accent/50 text-dark-muted hover:text-dark-text"
          } ${!activeProjectId ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => !isComparisonMode && setChartSectionLayoutMode("grid")}
          disabled={!activeProjectId || isComparisonMode}
          title={isComparisonMode ? "Grid view unavailable when comparing two characters" : "Grid layout – H2 sections in columns"}
          className={`px-2 py-1.5 text-sm border-l border-dark-accent/50 transition-colors ${
            chartSectionLayoutMode === "grid"
              ? "bg-dark-accent text-dark-text"
              : "bg-dark-accent/50 text-dark-muted hover:text-dark-text"
          } ${!activeProjectId || isComparisonMode ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </button>
      </div>

      <ChartTemplatesModal
        projectId={id ?? null}
        selectedCharacterId={selectedCharacterId}
        mode={templateModalMode}
        onClose={() => setTemplateModalMode(null)}
        anchorRef={templateButtonRef}
      />
    </div>
  );
}
