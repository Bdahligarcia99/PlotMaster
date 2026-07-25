import { useState, useRef, useEffect } from "react";
import Card from "../ui/Card";
import Button from "../ui/Button";
import { MODULE_REGISTRY, AVAILABLE_MODULES, CREATEABLE_MODULES } from "../../home/moduleRegistry";
import ModuleTile from "./ModuleTile";
import { useReducedMotion } from "../../hooks/useReducedMotion";

const ACCORDION_DURATION_MS = 250;
const ACCORDION_EASING = "cubic-bezier(0.2, 0, 0, 1)";

type ProjectScopeBoxVariant = "multi" | "quick";

interface ProjectScopeBoxProps {
  variant: ProjectScopeBoxVariant;
  label: string;
  onCreate?: (projectName: string, enabledModules: string[]) => void;
  /** Optional ref for the Project Name input (e.g. for initial focus in modal) */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** When true, this box is expanded (content visible); when false, minimized */
  isExpanded?: boolean;
  /** Called when user clicks header to expand (only applies when minimized; expanded click does nothing) */
  onExpand?: () => void;
}

export default function ProjectScopeBox({
  variant,
  label,
  onCreate,
  inputRef,
  isExpanded = true,
  onExpand,
}: ProjectScopeBoxProps) {
  const prefersReducedMotion = useReducedMotion();
  const [projectName, setProjectName] = useState("");
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputElRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const setRefs = (el: HTMLInputElement | null) => {
    (inputElRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    if (inputRef && "current" in inputRef) {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el;
    }
  };

  const hasSelection = Array.from(selectedModules).some((id) =>
    CREATEABLE_MODULES.includes(id as (typeof CREATEABLE_MODULES)[number])
  );
  const selectedCount = selectedModules.size;
  const canCreate =
    variant === "multi"
      ? projectName.trim().length > 0 && hasSelection
      : false;

  const handleToggleModule = (moduleId: string) => {
    if (variant !== "multi") return;
    if (!CREATEABLE_MODULES.includes(moduleId as (typeof CREATEABLE_MODULES)[number])) return;
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
    setValidationError(null);
  };

  const handleCreate = () => {
    if (variant === "multi" && canCreate) {
      setValidationError(null);
      const modules = Array.from(selectedModules).filter((id) =>
        CREATEABLE_MODULES.includes(id as (typeof CREATEABLE_MODULES)[number])
      );
      onCreate?.(projectName.trim(), modules);
    }
  };

  const handleQuickOpen = (moduleId: string) => {
    if (variant !== "quick") return;
    setValidationError(null);
    const trimmed = projectName.trim();
    if (!trimmed) {
      setValidationError("Project name is required.");
      inputElRef.current?.focus();
      return;
    }
    if (!AVAILABLE_MODULES.includes(moduleId as "familyTree" | "characters" | "timeline" | "ideaPlayground")) return;
    onCreate?.(trimmed, [moduleId]);
  };

  const contentId = `project-scope-${variant}-content`;
  const isMinimized = !isExpanded;

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      (el as HTMLDivElement & { inert?: boolean }).inert = isMinimized;
    }
  }, [isMinimized]);

  const transitionStyle = prefersReducedMotion
    ? { transition: "none" }
    : {
        transition: `grid-template-rows ${ACCORDION_DURATION_MS}ms ${ACCORDION_EASING}`,
      };

  const innerTransitionStyle = prefersReducedMotion
    ? {}
    : {
        transition: `opacity ${ACCORDION_DURATION_MS}ms ${ACCORDION_EASING}, transform ${ACCORDION_DURATION_MS}ms ${ACCORDION_EASING}`,
      };

  return (
    <Card padding="lg" className="w-full">
      <div className="space-y-0">
        {/* Header row: clickable when minimized to expand */}
        <div className="flex items-center justify-between gap-3">
          {onExpand ? (
            <button
              type="button"
              onClick={isMinimized ? onExpand : undefined}
              aria-expanded={isExpanded}
              aria-controls={contentId}
              className={`flex flex-1 items-center justify-between gap-3 text-left rounded-lg py-1 -my-1 px-1 -mx-1
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-dark-surface
                ${prefersReducedMotion ? "" : "transition-colors duration-200"}
                ${isMinimized ? "cursor-pointer hover:bg-dark-accent/30" : "cursor-default bg-dark-accent/20"}`}
              aria-label={isMinimized ? `Expand ${label}` : `${label} (expanded)`}
              title={isMinimized ? "Expand" : undefined}
            >
              <h2 className="text-sm font-medium uppercase tracking-wide text-dark-muted">
                {label}
              </h2>
              <span
                className={`flex items-center justify-center w-7 h-7 rounded-lg shrink-0 text-dark-muted
                  ${prefersReducedMotion ? "" : "transition-transform duration-[250ms]"}
                  ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                aria-hidden
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </span>
            </button>
          ) : (
            <h2 className="text-sm font-medium text-dark-muted uppercase tracking-wide">
              {label}
            </h2>
          )}
        </div>
        {/* Collapsible content: grid-template-rows animation */}
        <div
          className={`grid ${isMinimized ? "overflow-hidden" : "overflow-visible"}`}
          style={{
            gridTemplateRows: isMinimized ? "0fr" : "1fr",
            ...transitionStyle,
          }}
        >
          <div
            ref={contentRef}
            id={contentId}
            className={`min-h-0 ${isMinimized ? "overflow-hidden" : "overflow-visible"}`}
          >
            <div
              className="space-y-4 pt-4 px-2 pb-2"
              style={{
                opacity: isMinimized ? 0.85 : 1,
                transform: isMinimized ? "translateY(4px)" : "translateY(0)",
                ...innerTransitionStyle,
              }}
            >
        {/* Project Name row + optional Create button */}
        <div className="flex flex-col gap-1 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={setRefs}
              type="text"
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
                setValidationError(null);
              }}
              placeholder="Project Name"
              className={`flex-1 min-w-[180px] px-4 py-2.5 bg-dark-bg rounded-lg
                text-dark-text placeholder-dark-muted
                focus:outline-none focus:ring-1
                disabled:opacity-50 disabled:cursor-not-allowed
                ${validationError ? "border border-red-500/70 focus:border-red-500 focus:ring-red-500" : "border border-dark-accent focus:border-blue-500 focus:ring-blue-500"}`}
              aria-label="Project name"
              aria-invalid={!!validationError}
              aria-describedby={validationError ? "project-name-error" : undefined}
            />
          {variant === "multi" && (
            <Button
              variant="primary"
              size="md"
              onClick={handleCreate}
              disabled={!canCreate}
              aria-label="Create project"
              className="flex items-center gap-1.5"
            >
              Create
              <span aria-hidden>▸</span>
            </Button>
          )}
          </div>
          {validationError && (
            <p id="project-name-error" className="text-red-400 text-xs" role="alert">
              {validationError}
            </p>
          )}
        </div>

        {/* Module tiles grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULE_REGISTRY.map((module) => {
            const isCreateable =
              variant === "multi"
                ? CREATEABLE_MODULES.includes(module.id as (typeof CREATEABLE_MODULES)[number])
                : AVAILABLE_MODULES.includes(module.id as "familyTree" | "characters" | "timeline" | "ideaPlayground");
            const isGreyedOut =
              variant === "multi"
                ? !isCreateable
                : selectedCount > 0 && !selectedModules.has(module.id);

            return (
            <ModuleTile
              key={module.id}
              module={module}
              variant={variant}
              selected={selectedModules.has(module.id)}
              showCheckbox={variant === "multi" && isCreateable}
              isGreyedOut={isGreyedOut}
              onSelect={() => handleToggleModule(module.id)}
              onOpen={(moduleId) => handleQuickOpen(moduleId)}
            />
            );
          })}
        </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
