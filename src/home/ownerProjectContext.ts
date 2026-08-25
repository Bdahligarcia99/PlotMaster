import { useAppStore } from "../store/appStore";

export interface OwnerProjectContext {
  ownerId: string;
  ownerType: "modular" | "standalone";
  neuronId?: string;
  projectName: string;
  /** Sub-project ids for engram modules (module type name -> id). */
  subProjects: Record<string, string>;
}

/** Resolve the parent project context from any sub-project route param. */
export function resolveOwnerProjectContext(currentProjectId: string): OwnerProjectContext | null {
  const { modularProjects, standaloneProjects } = useAppStore.getState();

  for (const p of modularProjects) {
    const subEntries = Object.entries(p.subProjects ?? {});
    if (subEntries.some(([, subId]) => subId === currentProjectId)) {
      return {
        ownerId: p.id,
        ownerType: "modular",
        neuronId: p.neuronId,
        projectName: p.name,
        subProjects: p.subProjects ?? {},
      };
    }
    if (p.neuronId === currentProjectId) {
      return {
        ownerId: p.id,
        ownerType: "modular",
        neuronId: p.neuronId,
        projectName: p.name,
        subProjects: p.subProjects ?? {},
      };
    }
  }

  for (const p of standaloneProjects) {
    if (p.id === currentProjectId) {
      return {
        ownerId: p.id,
        ownerType: "standalone",
        neuronId: p.neuronId ?? (p.moduleType === "Neuron" ? p.id : undefined),
        projectName: p.name,
        subProjects: p.moduleType !== "Neuron" ? { [p.moduleType]: p.id } : {},
      };
    }
    if (p.neuronId === currentProjectId) {
      return {
        ownerId: p.id,
        ownerType: "standalone",
        neuronId: p.neuronId,
        projectName: p.name,
        subProjects: { [p.moduleType]: p.id },
      };
    }
  }

  return null;
}

/** Get sibling sub-project ids for mirror loading. */
export function getSiblingSubProjectIds(ctx: OwnerProjectContext): Record<string, string> {
  return ctx.subProjects;
}
