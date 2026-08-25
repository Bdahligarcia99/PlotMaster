import { useNavigate } from "react-router-dom";
import { useAppStore } from "../../store/appStore";
import { MODULE_REGISTRY, MODULE_TYPE_NAME_TO_REGISTRY_ID } from "../../home/moduleRegistry";
import { getModuleRoute } from "../../home/moduleRoutes";

interface ModuleSwitcherNavbarProps {
  /** Current sub-project id (the route param for the active module). */
  currentProjectId: string;
  /** Module type display name for standalone (non-modular) projects. */
  currentModuleType: string;
}

function ModuleTabButton({
  moduleType,
  subId,
  currentProjectId,
  onNavigate,
}: {
  moduleType: string;
  subId: string;
  currentProjectId: string;
  onNavigate: (path: string) => void;
}) {
  const registryId = MODULE_TYPE_NAME_TO_REGISTRY_ID[moduleType];
  const moduleMeta = MODULE_REGISTRY.find((m) => m.id === registryId);
  const isActive = subId === currentProjectId;
  const label = moduleMeta?.label ?? moduleType;

  return (
    <button
      type="button"
      onClick={() => {
        if (!isActive) onNavigate(getModuleRoute(moduleType, subId));
      }}
      disabled={isActive}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={`w-9 h-9 flex items-center justify-center rounded-lg border text-lg transition-colors ${
        isActive
          ? "bg-dark-accent border-dark-accent cursor-default"
          : "border-dark-accent/50 text-dark-muted hover:text-dark-text hover:bg-dark-accent/40 hover:border-dark-accent"
      }`}
    >
      {moduleMeta?.icon ?? "•"}
    </button>
  );
}

export default function ModuleSwitcherNavbar({
  currentProjectId,
  currentModuleType,
}: ModuleSwitcherNavbarProps) {
  const navigate = useNavigate();
  const modularProjects = useAppStore((s) => s.modularProjects);

  const modularProject = modularProjects.find(
    (p) =>
      Object.values(p.subProjects ?? {}).includes(currentProjectId) ||
      p.neuronId === currentProjectId
  );

  const entries: [string, string][] = modularProject
    ? Object.entries(modularProject.subProjects ?? {})
    : [[currentModuleType, currentProjectId]];

  return (
    <nav
      className="flex items-center justify-center gap-1"
      aria-label="Switch module"
    >
      {entries.map(([moduleType, subId]) => (
        <ModuleTabButton
          key={moduleType}
          moduleType={moduleType}
          subId={subId}
          currentProjectId={currentProjectId}
          onNavigate={navigate}
        />
      ))}
    </nav>
  );
}
