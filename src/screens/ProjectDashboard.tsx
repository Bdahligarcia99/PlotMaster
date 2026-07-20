import { useParams, useNavigate } from "react-router-dom";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import TopBar from "../components/ui/TopBar";
import { useAppStore } from "../store/appStore";
import { isTauri, openOrFocusIntroWindow } from "../tauri/openProjectInNewWindow";
import { useWindowTitle } from "../hooks/useWindowTitle";

const MODULE_STATS: Record<string, { stat1: string; stat2: string; stat3?: string }> = {
  Timeline: { stat1: "0 lanes", stat2: "0 anchors", stat3: "0 nodes" },
  "Family Tree": { stat1: "0 unions", stat2: "0 people" },
  Profiles: { stat1: "0 profiles", stat2: "0 states" },
  Ideas: { stat1: "0 bubbles", stat2: "0 merges" },
};

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const modularProjects = useAppStore((s) => s.modularProjects);
  const setIntroDialogOpen = useAppStore((s) => s.setIntroDialogOpen);

  const project = modularProjects.find((p) => p.id === id);
  const createStandaloneProject = useAppStore((s) => s.createStandaloneProject);

  useWindowTitle(project ? `${project.name} - Synapse IWE` : "Synapse IWE");

  const handleOpenModule = (moduleName: string) => {
    const pid = createStandaloneProject(`${project!.name} - ${moduleName}`, moduleName);
    navigate(`/project/${pid}`);
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-muted mb-4">Modular project not found</p>
          <Button onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      <TopBar
        left={
          <button
            onClick={() => {
              if (isTauri()) {
                openOrFocusIntroWindow();
              } else {
                setIntroDialogOpen(true);
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-dark-muted hover:text-dark-text transition-colors"
            title="Open projects"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Projects
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-dark-text">Modular Project: {project.name}</h1>
            <p className="text-dark-muted text-sm mt-1">Linked Projects</p>
          </div>

          {/* Script strip */}
          <div className="flex items-center gap-4 p-3 bg-dark-surface rounded-xl border border-dark-accent/50">
            <Button variant="secondary" size="sm">
              Open Project Script
            </Button>
            <span className="text-dark-muted text-sm">Declared Entities: 0</span>
            <span className="text-dark-muted text-sm">|</span>
            <span className="text-dark-muted text-sm">Errors: 0</span>
          </div>

          {/* Module cards */}
          {project.enabledModules.length === 0 ? (
            <Card padding="lg">
              <p className="text-dark-muted text-sm text-center py-8">
                No modules enabled. Edit modular project to add modules.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {project.enabledModules.map((moduleName) => {
                const stats = MODULE_STATS[moduleName] || {
                  stat1: "0 items",
                  stat2: "0 items",
                };
                return (
                  <Card key={moduleName} padding="lg">
                    <div className="flex flex-col h-full">
                      <h3 className="text-dark-text font-medium mb-2">{moduleName}</h3>
                      <div className="text-dark-muted text-xs space-y-1 mb-4">
                        <p>{stats.stat1}</p>
                        <p>{stats.stat2}</p>
                        {stats.stat3 && <p>{stats.stat3}</p>}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-auto w-fit"
                        onClick={() => handleOpenModule(moduleName)}
                      >
                        Open
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
