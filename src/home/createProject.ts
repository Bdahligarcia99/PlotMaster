import { getStorageDriver } from "../storage/StorageDriver";
import { createDefaultTimelinePayload } from "../store/timelineStore";
import { createDefaultNeuronPayload } from "../store/neuronStore";

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Creates a new project with the given name and enabled modules.
 * Family Tree and Timeline use StorageDriver; other modules use appStore only.
 * Returns the project ID for navigation.
 */
export async function createProject(
  name: string,
  enabledModules: string[]
): Promise<string> {
  const id = generateId();
  const driver = getStorageDriver();
  const now = Date.now();

  if (enabledModules.includes("familyTree")) {
    let projectName = name.trim();
    if (!projectName) {
      const existing = await driver.listProjects();
      const num = existing.filter((p) => p.moduleType === "familyTree").length + 1;
      projectName = `Family Tree ${num}`;
    }
    await driver.createProject({
      id,
      name: projectName,
      moduleType: "familyTree",
      createdAt: now,
      updatedAt: now,
    });
  }

  return id;
}

/** Creates a driver-backed timeline outliner project with default payload. */
export async function createTimelineProject(name: string): Promise<string> {
  const id = generateId();
  const driver = getStorageDriver();
  const now = Date.now();
  let projectName = name.trim();
  if (!projectName) {
    const existing = await driver.listProjects();
    const num = existing.filter((p) => p.moduleType === "timeline").length + 1;
    projectName = `Timeline Outliner ${num}`;
  }
  await driver.createProject({
    id,
    name: projectName,
    moduleType: "timeline",
    createdAt: now,
    updatedAt: now,
  });
  await driver.saveProjectData(id, createDefaultTimelinePayload());
  return id;
}

/** Creates a driver-backed Neuron binder project with default payload. */
export async function createNeuronProject(
  name: string,
  ownerProjectId?: string
): Promise<string> {
  const id = generateId();
  const driver = getStorageDriver();
  const now = Date.now();
  let projectName = name.trim();
  if (!projectName) {
    const existing = await driver.listProjects();
    const num = existing.filter((p) => p.moduleType === "neuron").length + 1;
    projectName = `Neuron ${num}`;
  }
  await driver.createProject({
    id,
    name: projectName,
    moduleType: "neuron",
    createdAt: now,
    updatedAt: now,
  });
  await driver.saveProjectData(id, createDefaultNeuronPayload(ownerProjectId));
  return id;
}
