import { getStorageDriver } from "../storage/StorageDriver";

const generateId = () => `_${Math.random().toString(36).slice(2, 11)}`;

/**
 * Creates a new project with the given name and enabled modules.
 * For Family Tree (the only available module), uses StorageDriver.
 * Returns the project ID for navigation.
 */
export async function createProject(
  name: string,
  enabledModules: string[]
): Promise<string> {
  const id = generateId();
  const driver = getStorageDriver();
  const now = Date.now();

  // For now, Family Tree is the only supported module
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
