import Modal from "../ui/Modal";
import Button from "../ui/Button";
import {
  useFamilyTreeStore,
  genderForParentRole,
  type FullUnionChildSpec,
  type FullUnionParentSpec,
} from "../../store/familyTreeStore";
import {
  ChildRoleSelect,
  GenderSelect,
  ParentRoleSelect,
} from "./roleSelects";

interface FullUnionAdvancedDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FullUnionAdvancedDialog({
  isOpen,
  onClose,
}: FullUnionAdvancedDialogProps) {
  const fullUnionSettings = useFamilyTreeStore((s) => s.fullUnionSettings);
  const setFullUnionSettings = useFamilyTreeStore((s) => s.setFullUnionSettings);
  const resetFullUnionSettings = useFamilyTreeStore((s) => s.resetFullUnionSettings);
  const customParentRoles = useFamilyTreeStore((s) => s.customParentRoles);
  const customChildRoles = useFamilyTreeStore((s) => s.customChildRoles);
  const customGenders = useFamilyTreeStore((s) => s.customGenders);
  const addCustomParentRole = useFamilyTreeStore((s) => s.addCustomParentRole);
  const addCustomChildRole = useFamilyTreeStore((s) => s.addCustomChildRole);
  const addCustomGender = useFamilyTreeStore((s) => s.addCustomGender);

  const parents =
    fullUnionSettings.parents.length > 0
      ? fullUnionSettings.parents
      : [{ role: undefined, gender: undefined }];
  const children = fullUnionSettings.children;

  const updateParent = (index: number, patch: Partial<FullUnionParentSpec>) => {
    const next = parents.map((p, i) => (i === index ? { ...p, ...patch } : p));
    if (patch.role !== undefined) {
      const autoGender = genderForParentRole(patch.role);
      if (autoGender) {
        next[index] = { ...next[index], gender: autoGender };
      }
    }
    setFullUnionSettings({ parents: next, advancedEnabled: true });
  };

  const updateChild = (index: number, patch: Partial<FullUnionChildSpec>) => {
    const next = children.map((c, i) => (i === index ? { ...c, ...patch } : c));
    setFullUnionSettings({ children: next, advancedEnabled: true });
  };

  const addParent = () => {
    setFullUnionSettings({
      parents: [...parents, {}],
      advancedEnabled: true,
    });
  };

  const removeParent = (index: number) => {
    if (parents.length <= 1) return;
    setFullUnionSettings({
      parents: parents.filter((_, i) => i !== index),
      advancedEnabled: true,
    });
  };

  const addChild = () => {
    setFullUnionSettings({
      children: [...children, {}],
      includeChildren: true,
      childCount: children.length + 1,
      advancedEnabled: true,
    });
  };

  const removeChild = (index: number) => {
    const next = children.filter((_, i) => i !== index);
    setFullUnionSettings({
      children: next,
      includeChildren: next.length > 0,
      childCount: next.length,
      advancedEnabled: true,
    });
  };

  const handleReset = () => {
    resetFullUnionSettings();
  };

  const handleDone = () => {
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Full Union — Advanced Options"
      contentClassName="max-w-lg max-h-[85vh] overflow-y-auto"
    >
      <div className="space-y-5">
        <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer">
          <input
            type="checkbox"
            checked={fullUnionSettings.advancedEnabled}
            onChange={(e) => setFullUnionSettings({ advancedEnabled: e.target.checked })}
            className="themed-checkbox"
          />
          <span>Use advanced options</span>
        </label>

        <section>
          <h3 className="text-sm font-medium text-dark-text mb-2">Parents</h3>
          <div className="space-y-3">
            {parents.map((parent, index) => (
              <div
                key={`parent-${index}`}
                className="rounded-lg border border-dark-accent/50 p-3 space-y-2 bg-dark-bg/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-dark-muted uppercase">
                    Parent {index + 1}
                  </span>
                  {parents.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeParent(index)}
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50 text-sm"
                      title="Remove parent"
                    >
                      −
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-dark-muted mb-1">Role</label>
                  <ParentRoleSelect
                    value={parent.role ?? ""}
                    onChange={(role) => updateParent(index, { role: role ?? undefined })}
                    customParentRoles={customParentRoles}
                    addCustomParentRole={addCustomParentRole}
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-muted mb-1">Gender</label>
                  <GenderSelect
                    value={parent.gender ?? ""}
                    onChange={(gender) => updateParent(index, { gender: gender ?? undefined })}
                    customGenders={customGenders}
                    addCustomGender={addCustomGender}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addParent}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300"
          >
            + Add New Parent
          </button>
        </section>

        <label className="flex items-center gap-2 text-sm text-dark-text cursor-pointer">
          <input
            type="checkbox"
            checked={fullUnionSettings.autoAssignMissingPartner}
            onChange={(e) =>
              setFullUnionSettings({ autoAssignMissingPartner: e.target.checked })
            }
            className="themed-checkbox"
          />
          <span>Auto Assign Missing Partner</span>
        </label>
        <p className="text-xs text-dark-muted -mt-2">
          When one seed person is selected, auto-fill the opposite biological role for a new partner.
        </p>

        <section>
          <h3 className="text-sm font-medium text-dark-text mb-2">Children</h3>
          <div className="space-y-3">
            {children.map((child, index) => (
              <div
                key={`child-${index}`}
                className="rounded-lg border border-dark-accent/50 p-3 space-y-2 bg-dark-bg/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-dark-muted uppercase">
                    Child {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeChild(index)}
                    className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50 text-sm"
                    title="Remove child"
                  >
                    −
                  </button>
                </div>
                <div>
                  <label className="block text-xs text-dark-muted mb-1">Child Role</label>
                  <ChildRoleSelect
                    value={child.childRole ?? ""}
                    onChange={(childRole) =>
                      updateChild(index, { childRole: childRole ?? undefined })
                    }
                    customChildRoles={customChildRoles}
                    addCustomChildRole={addCustomChildRole}
                  />
                </div>
                <div>
                  <label className="block text-xs text-dark-muted mb-1">Gender</label>
                  <GenderSelect
                    value={child.gender ?? ""}
                    onChange={(gender) => updateChild(index, { gender: gender ?? undefined })}
                    customGenders={customGenders}
                    addCustomGender={addCustomGender}
                  />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addChild}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300"
          >
            + Add New Child
          </button>
        </section>

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dark-accent/50">
          <Button variant="secondary" size="sm" onClick={handleReset}>
            Reset
          </Button>
          <Button variant="primary" size="sm" onClick={handleDone}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
