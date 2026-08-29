import { useState } from "react";
import {
  BUILT_IN_PARENT_ROLES,
  BUILT_IN_GENDERS,
  BUILT_IN_CHILD_ROLES,
} from "../../store/familyTreeStore";

export const CUSTOM_SENTINEL = "__custom__";

export const PARENT_ROLE_LABELS: Record<string, string> = {
  father: "Biological Father",
  mother: "Biological Mother",
  unknown: "Unknown",
  guardian: "Guardian",
  stepmother: "Stepmother",
  stepfather: "Stepfather",
  stepparent: "Stepparent",
  adoptive_mother: "Adoptive Mother",
  adoptive_father: "Adoptive Father",
  parent: "Parent",
  nanny: "Nanny",
};

export const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const CHILD_ROLE_LABELS: Record<string, string> = {
  son: "Son",
  daughter: "Daughter",
  child: "Child",
  adoptive_son: "Adoptive Son",
  adoptive_daughter: "Adoptive Daughter",
  adoptive_child: "Adoptive Child",
};

export const selectClassName =
  "w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500";

export function ChildRoleSelect({
  value,
  onChange,
  customChildRoles,
  addCustomChildRole,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customChildRoles: string[];
  addCustomChildRole: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomChildRole(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_CHILD_ROLES.map((r) => (
          <option key={r} value={r}>
            {CHILD_ROLE_LABELS[r] ?? r}
          </option>
        ))}
        {customChildRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom role label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function ParentRoleSelect({
  value,
  onChange,
  customParentRoles,
  addCustomParentRole,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customParentRoles: string[];
  addCustomParentRole: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomParentRole(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_PARENT_ROLES.map((r) => (
          <option key={r} value={r}>
            {PARENT_ROLE_LABELS[r] ?? r}
          </option>
        ))}
        {customParentRoles.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom role label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}

export function GenderSelect({
  value,
  onChange,
  customGenders,
  addCustomGender,
}: {
  value: string;
  onChange: (v: string | null) => void;
  customGenders: string[];
  addCustomGender: (label: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customLabel, setCustomLabel] = useState("");

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === CUSTOM_SENTINEL) {
      setShowCustom(true);
      return;
    }
    onChange(v || null);
  };

  const handleAddCustom = () => {
    const label = customLabel.trim();
    if (!label) return;
    addCustomGender(label);
    onChange(label);
    setCustomLabel("");
    setShowCustom(false);
  };

  return (
    <div>
      <select value={value} onChange={handleSelect} className={selectClassName}>
        <option value="">Unassigned</option>
        {BUILT_IN_GENDERS.map((g) => (
          <option key={g} value={g}>
            {GENDER_LABELS[g] ?? g}
          </option>
        ))}
        {customGenders.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {showCustom && (
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            placeholder="Custom gender label"
            className="flex-1 px-2 py-1 text-sm bg-dark-bg border border-dark-accent rounded-lg text-dark-text"
          />
          <button
            type="button"
            onClick={handleAddCustom}
            className="px-2 py-1 text-sm rounded border border-dark-accent/50 hover:bg-dark-accent/30 text-dark-text"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
