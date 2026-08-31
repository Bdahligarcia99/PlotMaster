import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useFamilyTreeStore,
  DEFAULT_CONNECTION_STYLE,
  resolveUnionConnectionStyle,
  getEdgeConnectionStyleName,
  getEdgeConnectionStyleNameWithoutRole,
  getEdgeForPersonAtUnion,
  getUnionPartners,
  getPersonDisplayName,
  isChildEdge,
  listRoleStyles,
  scanRoleLinkCulprits,
  isRoleStyleLinkable,
  roleStyleKey,
  type ConnectionVisualStyle,
  type ConnectionStyleDef,
  type UnionNodeData,
  type PersonNodeData,
  type FamilyTreeEdgeData,
  type RoleLinkCulprit,
  type RoleStyleEntry,
} from "../../store/familyTreeStore";
import Input from "../ui/Input";
import ColorInput from "../ui/ColorInput";
import NumberSlider from "../ui/NumberSlider";
import Button from "../ui/Button";
import ConnectionIconPicker from "./ConnectionIconPicker";
import { renderConnectionIcon } from "./connectionIconRegistry";
import type { ConnectionIconRef } from "../../store/familyTreeStore";
import {
  PARENT_ROLE_LABELS,
  CHILD_ROLE_LABELS,
  GENDER_LABELS,
} from "./roleSelects";
import RoleStyleLinkWarningModal from "./RoleStyleLinkWarningModal";

interface UnionConnectionStyleEditorProps {
  unionId: string;
  onClose: () => void;
}

type StyleDraft = {
  id?: string;
  roleKey?: string;
  name: string;
  description?: string;
  stroke: string;
  strokeWidth: number;
  dashPattern: number[];
  icon?: ConnectionIconRef;
};

type ConnectionEntry = {
  personId: string;
  name: string;
  gender?: string;
  role?: string;
  roleKey?: string;
  roleLabel: string;
  edgeId?: string;
  styleName: string;
  underlyingStyleName: string;
  hasOwnStyle: boolean;
};

function formatParentRoleLabel(role: string): string {
  return PARENT_ROLE_LABELS[role] ?? role;
}

function formatChildRoleLabel(role: string): string {
  return CHILD_ROLE_LABELS[role] ?? role;
}

function formatGenderLabel(gender?: string): string {
  if (!gender?.trim()) return "—";
  return GENDER_LABELS[gender] ?? gender;
}

export function StylePreviewLine({
  style,
  width = 48,
  height = 16,
}: {
  style: ConnectionVisualStyle;
  width?: number;
  height?: number;
}) {
  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <line
        x1={2}
        y1={height / 2}
        x2={width - 2}
        y2={height / 2}
        stroke={style.stroke}
        strokeWidth={style.strokeWidth}
        strokeDasharray={style.dashPattern.length ? style.dashPattern.join(" ") : undefined}
      />
    </svg>
  );
}

function dashPairs(pattern: number[]): { dash: number; gap?: number }[] {
  const pairs: { dash: number; gap?: number }[] = [];
  for (let i = 0; i < pattern.length; i += 2) {
    pairs.push({ dash: pattern[i] ?? 0, gap: pattern[i + 1] });
  }
  return pairs;
}

function pairsToPattern(pairs: { dash: number; gap?: number }[]): number[] {
  const out: number[] = [];
  for (const p of pairs) {
    out.push(p.dash);
    if (p.gap != null) out.push(p.gap);
  }
  return out;
}

export default function UnionConnectionStyleEditor({ unionId, onClose }: UnionConnectionStyleEditorProps) {
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const addConnectionStyle = useFamilyTreeStore((s) => s.addConnectionStyle);
  const updateConnectionStyle = useFamilyTreeStore((s) => s.updateConnectionStyle);
  const deleteConnectionStyle = useFamilyTreeStore((s) => s.deleteConnectionStyle);
  const duplicateConnectionStyle = useFamilyTreeStore((s) => s.duplicateConnectionStyle);
  const setUnionConnectionStyleId = useFamilyTreeStore((s) => s.setUnionConnectionStyleId);
  const setUnionConnectionStyleOverride = useFamilyTreeStore((s) => s.setUnionConnectionStyleOverride);
  const setEdgeConnectionStyleId = useFamilyTreeStore((s) => s.setEdgeConnectionStyleId);
  const setEdgeConnectionStyleOverride = useFamilyTreeStore((s) => s.setEdgeConnectionStyleOverride);
  const clearEdgeConnectionStyle = useFamilyTreeStore((s) => s.clearEdgeConnectionStyle);
  const connectionStyleEditorOffset = useFamilyTreeStore((s) => s.connectionStyleEditorOffset);
  const setConnectionStyleEditorOffset = useFamilyTreeStore((s) => s.setConnectionStyleEditorOffset);
  const customParentRoles = useFamilyTreeStore((s) => s.customParentRoles);
  const customChildRoles = useFamilyTreeStore((s) => s.customChildRoles);
  const roleStyleOverrides = useFamilyTreeStore((s) => s.roleStyleOverrides);
  const roleStyleLinks = useFamilyTreeStore((s) => s.roleStyleLinks);
  const setRoleStyleOverride = useFamilyTreeStore((s) => s.setRoleStyleOverride);
  const resetRoleStyle = useFamilyTreeStore((s) => s.resetRoleStyle);
  const resetAllBuiltInRoleStyles = useFamilyTreeStore((s) => s.resetAllBuiltInRoleStyles);
  const setRoleStyleLink = useFamilyTreeStore((s) => s.setRoleStyleLink);
  const setUnionUseRoleStyles = useFamilyTreeStore((s) => s.setUnionUseRoleStyles);

  const unionNode = nodes.find((n) => n.id === unionId && (n.data as UnionNodeData).kind === "union");
  const unionData = unionNode?.data as UnionNodeData | undefined;

  const effectiveStyle = useMemo(
    () => (unionData ? resolveUnionConnectionStyle(unionData, connectionStyles) : DEFAULT_CONNECTION_STYLE),
    [unionData, connectionStyles]
  );

  const [draft, setDraft] = useState<StyleDraft | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<"builtIn" | "userMade">("builtIn");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [activePersonIds, setActivePersonIds] = useState<Set<string>>(new Set());
  const [activeStyleId, setActiveStyleId] = useState<string | null>(null);
  const [pendingRoleLink, setPendingRoleLink] = useState<{ key: string; label: string } | null>(null);
  const [warningCulprits, setWarningCulprits] = useState<RoleLinkCulprit[]>([]);

  const rootRef = useRef<HTMLDivElement>(null);
  const iconPickerBoxRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    baseLeft: number;
    baseTop: number;
    width: number;
    height: number;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>(
    () => connectionStyleEditorOffset ?? { x: 0, y: 0 }
  );

  const previewStyle = draft ?? effectiveStyle;

  const handleDragPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const margin = 8;
    const minX = margin - drag.baseLeft;
    const maxX = Math.max(minX, window.innerWidth - margin - drag.width - drag.baseLeft);
    const minY = margin - drag.baseTop;
    const maxY = Math.max(minY, window.innerHeight - margin - drag.height - drag.baseTop);
    const rawX = drag.baseX + (e.clientX - drag.startX);
    const rawY = drag.baseY + (e.clientY - drag.startY);
    setDragOffset({
      x: Math.min(Math.max(rawX, minX), maxX),
      y: Math.min(Math.max(rawY, minY), maxY),
    });
  }, []);

  const handleDragPointerUp = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", handleDragPointerMove);
    window.removeEventListener("pointerup", handleDragPointerUp);
    setDragOffset((current) => {
      setConnectionStyleEditorOffset(current);
      return current;
    });
  }, [handleDragPointerMove, setConnectionStyleEditorOffset]);

  const handleDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: dragOffset.x,
        baseY: dragOffset.y,
        baseLeft: rect.left - dragOffset.x,
        baseTop: rect.top - dragOffset.y,
        width: rect.width,
        height: rect.height,
      };
      window.addEventListener("pointermove", handleDragPointerMove);
      window.addEventListener("pointerup", handleDragPointerUp);
    },
    [dragOffset, handleDragPointerMove, handleDragPointerUp]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handleDragPointerMove);
      window.removeEventListener("pointerup", handleDragPointerUp);
    };
  }, [handleDragPointerMove, handleDragPointerUp]);

  const handleRootClick = useCallback((e: React.MouseEvent) => {
    if (!iconPickerOpen) return;
    const target = e.target as HTMLElement;
    if (iconPickerBoxRef.current?.contains(target)) return;
    if (target.closest("[data-keep-icon-picker]")) return;
    setIconPickerOpen(false);
  }, [iconPickerOpen]);

  const roleStyleCtx = useMemo(
    () => ({ roleStyleLinks, roleStyleOverrides }),
    [roleStyleLinks, roleStyleOverrides]
  );

  const roleStyleLists = useMemo(
    () => listRoleStyles(customParentRoles, customChildRoles, roleStyleOverrides),
    [customParentRoles, customChildRoles, roleStyleOverrides]
  );

  const buildConnectionEntry = useCallback(
    (
      personId: string,
      role: string | undefined,
      kind: "parent" | "child",
      edge: ReturnType<typeof getEdgeForPersonAtUnion>
    ): ConnectionEntry => {
      const personNode = nodes.find((n) => n.id === personId);
      const personData = personNode?.data as PersonNodeData | undefined;
      const name = personNode
        ? getPersonDisplayName(personData!, personId, nodes)
        : personId;
      const roleKey = role ? roleStyleKey(kind, role) : undefined;
      const roleLabel = role
        ? kind === "parent"
          ? formatParentRoleLabel(role)
          : formatChildRoleLabel(role)
        : "Unassigned";
      const styleName =
        edge && unionData
          ? getEdgeConnectionStyleName(edge, unionData, connectionStyles, roleStyleCtx)
          : "Default";
      const underlyingStyleName =
        edge && unionData
          ? getEdgeConnectionStyleNameWithoutRole(edge, unionData, connectionStyles)
          : "Default";
      const edgeData = edge?.data as FamilyTreeEdgeData | undefined;
      const hasOwnStyle = !!(edgeData?.connectionStyleOverride || edgeData?.connectionStyleId);
      return {
        personId,
        name,
        gender: personData?.gender,
        role,
        roleKey,
        roleLabel,
        edgeId: edge?.id,
        styleName,
        underlyingStyleName,
        hasOwnStyle,
      };
    },
    [nodes, unionData, connectionStyles, roleStyleCtx]
  );

  const parentConnections = useMemo(() => {
    if (!unionData) return [];
    return getUnionPartners(unionData).map(({ personId, role }) => {
      const edge = getEdgeForPersonAtUnion(unionId, personId, edges);
      return buildConnectionEntry(personId, role, "parent", edge);
    });
  }, [unionData, unionId, edges, buildConnectionEntry]);

  const childConnections = useMemo(() => {
    if (!unionData) return [];
    return edges
      .filter((e) => e.source === unionId && isChildEdge(e))
      .map((edge) => {
        const personId = edge.target;
        const childRole = (edge.data as FamilyTreeEdgeData | undefined)?.childRole;
        return buildConnectionEntry(personId, childRole, "child", edge);
      });
  }, [unionData, unionId, edges, buildConnectionEntry]);

  const attemptSetRoleLink = useCallback(
    (key: string, label: string, on: boolean) => {
      if (!on) {
        setRoleStyleLink(key, false);
        return;
      }
      const culprits = scanRoleLinkCulprits(key, nodes, edges, connectionStyles);
      if (culprits.length === 0) {
        setRoleStyleLink(key, true);
        return;
      }
      setPendingRoleLink({ key, label });
      setWarningCulprits(culprits);
    },
    [nodes, edges, connectionStyles, setRoleStyleLink]
  );

  const confirmRoleLink = useCallback(() => {
    if (pendingRoleLink) setRoleStyleLink(pendingRoleLink.key, true);
    setPendingRoleLink(null);
    setWarningCulprits([]);
  }, [pendingRoleLink, setRoleStyleLink]);

  const cancelRoleLink = useCallback(() => {
    setPendingRoleLink(null);
    setWarningCulprits([]);
  }, []);

  const applyStyleToPersons = useCallback(
    (styleId: string | undefined, personIds: string[]) => {
      for (const personId of personIds) {
        const edge = getEdgeForPersonAtUnion(unionId, personId, edges);
        if (!edge) continue;
        if (styleId === undefined) {
          clearEdgeConnectionStyle(edge.id);
        } else {
          setEdgeConnectionStyleId(edge.id, styleId);
        }
      }
    },
    [unionId, edges, clearEdgeConnectionStyle, setEdgeConnectionStyleId]
  );

  useEffect(() => {
    if (!advancedOpen || activeStyleId === null || activePersonIds.size === 0) return;
    applyStyleToPersons(activeStyleId, [...activePersonIds]);
    setActivePersonIds(new Set());
    setActiveStyleId(null);
  }, [advancedOpen, activeStyleId, activePersonIds, applyStyleToPersons]);

  const togglePerson = useCallback((personId: string) => {
    setIconPickerOpen(false);
    setActivePersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  }, []);

  const toggleStyle = useCallback((styleId: string) => {
    setActiveStyleId((prev) => (prev === styleId ? null : styleId));
  }, []);

  const startNewDraft = useCallback(() => {
    setIconPickerOpen(false);
    setDraft({
      name: "",
      description: "",
      ...DEFAULT_CONNECTION_STYLE,
    });
  }, []);

  const startEditRoleDraft = useCallback(
    (entry: RoleStyleEntry) => {
      setIconPickerOpen(false);
      setDraft({
        roleKey: entry.key,
        name: entry.name,
        description: entry.style.description ?? "",
        stroke: entry.style.stroke,
        strokeWidth: entry.style.strokeWidth,
        dashPattern: [...entry.style.dashPattern],
        icon: entry.style.icon,
      });
    },
    []
  );

  const startEditDraft = useCallback((style: ConnectionStyleDef) => {
    setIconPickerOpen(false);
    setDraft({
      id: style.id,
      name: style.name,
      description: style.description ?? "",
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      dashPattern: [...style.dashPattern],
      icon: style.icon,
    });
  }, []);

  const updateDraft = useCallback((patch: Partial<StyleDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleSaveToLibrary = useCallback(() => {
    if (!draft) return;
    const payload = {
      name: draft.name.trim() || "Untitled",
      description: draft.description?.trim() || undefined,
      stroke: draft.stroke,
      strokeWidth: draft.strokeWidth,
      dashPattern: [...draft.dashPattern],
      icon: draft.icon,
    };
    if (draft.roleKey) {
      setRoleStyleOverride(draft.roleKey, payload);
      setIconPickerOpen(false);
      setDraft(null);
      return;
    }
    if (draft.id) {
      updateConnectionStyle(draft.id, payload);
    } else {
      const newId = addConnectionStyle(payload);
      if (advancedOpen) {
        applyStyleToPersons(newId, [...activePersonIds]);
        setActivePersonIds(new Set());
        setActiveStyleId(null);
      } else {
        setUnionConnectionStyleId(unionId, newId);
      }
    }
    setIconPickerOpen(false);
    setDraft(null);
  }, [
    draft,
    addConnectionStyle,
    updateConnectionStyle,
    setUnionConnectionStyleId,
    unionId,
    advancedOpen,
    activePersonIds,
    applyStyleToPersons,
    setRoleStyleOverride,
  ]);

  const handleUseWithoutSaving = useCallback(() => {
    if (!draft) return;
    const override = {
      stroke: draft.stroke,
      strokeWidth: draft.strokeWidth,
      dashPattern: [...draft.dashPattern],
      description: draft.description?.trim() || undefined,
      icon: draft.icon,
    };
    if (advancedOpen && activePersonIds.size > 0) {
      for (const personId of activePersonIds) {
        const edge = getEdgeForPersonAtUnion(unionId, personId, edges);
        if (edge) setEdgeConnectionStyleOverride(edge.id, override);
      }
      setActivePersonIds(new Set());
      setActiveStyleId(null);
    } else {
      setUnionConnectionStyleOverride(unionId, override);
    }
    setIconPickerOpen(false);
    setDraft(null);
  }, [draft, setUnionConnectionStyleOverride, setEdgeConnectionStyleOverride, unionId, advancedOpen, activePersonIds, edges]);

  if (!unionData) return null;

  const hasOverride = !!unionData.connectionStyleOverride;
  const activeStyleIdForUnion = hasOverride ? undefined : unionData.connectionStyleId;

  const presetBtnClass =
    "px-2 py-1 text-xs rounded border border-dark-accent bg-dark-bg text-dark-muted hover:text-dark-text hover:border-dark-muted";

  const handleLibraryStyleClick = (styleId: string) => {
    setIconPickerOpen(false);
    if (advancedOpen) {
      toggleStyle(styleId);
    } else {
      const isCurrent = !hasOverride && unionData?.connectionStyleId === styleId;
      setUnionConnectionStyleId(unionId, isCurrent ? undefined : styleId);
    }
  };

  const useRoleStyles = !!unionData.useRoleStyles;

  const renderRoleStyleRow = (entry: RoleStyleEntry, showReset: boolean) => (
    <div
      key={entry.key}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border min-w-0 ${
        entry.isLinkable ? "border-transparent hover:border-dark-accent hover:bg-dark-accent/30" : "opacity-50 border-transparent"
      }`}
    >
      <StylePreviewLine style={entry.style} />
      <span className="flex-1 text-xs truncate">{entry.name}</span>
      {showReset && entry.isEdited && (
        <button
          type="button"
          title="Reset to built-in"
          onClick={() => resetRoleStyle(entry.key)}
          className="text-[10px] text-dark-muted hover:text-dark-text px-1"
        >
          Reset
        </button>
      )}
      <button
        type="button"
        title="Edit"
        onClick={() => startEditRoleDraft(entry)}
        className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
    </div>
  );

  const renderConnectionRow = (entry: ConnectionEntry) => (
    <div
      key={entry.personId}
      className={`flex items-center gap-2 px-2 py-1.5 rounded border min-w-0 ${
        activePersonIds.has(entry.personId)
          ? "border-blue-500 bg-blue-500/10"
          : "border-transparent hover:border-dark-accent hover:bg-dark-accent/20"
      }`}
    >
      {useRoleStyles && entry.roleKey && (
        <input
          type="checkbox"
          checked={!!roleStyleLinks[entry.roleKey]}
          disabled={!isRoleStyleLinkable(entry.roleKey, roleStyleOverrides)}
          title={
            isRoleStyleLinkable(entry.roleKey, roleStyleOverrides)
              ? "Link role style to all connections with this role"
              : "Edit this role's style in the library before linking"
          }
          onChange={(e) =>
            attemptSetRoleLink(entry.roleKey!, entry.roleLabel, e.target.checked)
          }
          onClick={(e) => e.stopPropagation()}
          className="themed-checkbox flex-shrink-0"
        />
      )}
      <button
        type="button"
        onClick={() => togglePerson(entry.personId)}
        className="flex-1 min-w-0 text-left text-xs text-dark-text"
        title="Click to select, then click a library style to apply"
      >
        <span className="block truncate font-medium">{entry.name}</span>
        {useRoleStyles && entry.role && (
          <span className="block truncate text-[10px] text-dark-muted">
            {entry.roleLabel} · {formatGenderLabel(entry.gender)}
          </span>
        )}
        {!useRoleStyles && (
          <span className="block truncate text-[10px] text-dark-muted">
            {formatGenderLabel(entry.gender)}
            {entry.role ? ` · ${entry.roleLabel}` : ""}
          </span>
        )}
      </button>
      <span
        className="text-[10px] text-dark-muted flex-shrink-0 max-w-[88px] truncate text-right"
        title={
          entry.styleName !== entry.underlyingStyleName
            ? `Showing ${entry.styleName} (assigned: ${entry.underlyingStyleName})`
            : entry.styleName
        }
      >
        {entry.styleName}
        {entry.styleName !== entry.underlyingStyleName && (
          <span className="block text-[9px] opacity-70">({entry.underlyingStyleName})</span>
        )}
      </span>
      {entry.edgeId && (
        <select
          value={
            (() => {
              const edge = edges.find((e) => e.id === entry.edgeId);
              const edgeData = edge?.data as { connectionStyleId?: string } | undefined;
              return edgeData?.connectionStyleId ?? "";
            })()
          }
          onChange={(e) => {
            const val = e.target.value;
            if (!val) clearEdgeConnectionStyle(entry.edgeId!);
            else setEdgeConnectionStyleId(entry.edgeId!, val);
          }}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] px-1 py-0.5 rounded bg-dark-bg border border-dark-accent text-dark-text max-w-[72px]"
        >
          <option value="">Default</option>
          {connectionStyles.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const leftColumn = (
    <>
      <div className="mb-3 flex items-center gap-2">
        <StylePreviewLine style={previewStyle} width={120} height={24} />
        <span className="text-xs text-dark-muted">Preview</span>
      </div>

      {hasOverride && !advancedOpen && (
        <div className="mb-3 flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/30">
          <span className="text-xs text-amber-200">Using custom override for this connection</span>
          <button
            type="button"
            onClick={() => setUnionConnectionStyleOverride(unionId, undefined)}
            className="text-xs text-amber-200 hover:text-amber-100 underline flex-shrink-0"
          >
            Clear override
          </button>
        </div>
      )}

      <div className="mb-2">
        <div className="flex gap-1 mb-2">
          <button
            type="button"
            onClick={() => setLibraryTab("builtIn")}
            className={`flex-1 py-1 text-[10px] rounded border ${
              libraryTab === "builtIn"
                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                : "border-dark-accent text-dark-muted hover:text-dark-text"
            }`}
          >
            Built-In
          </button>
          <button
            type="button"
            onClick={() => setLibraryTab("userMade")}
            className={`flex-1 py-1 text-[10px] rounded border ${
              libraryTab === "userMade"
                ? "border-blue-500 bg-blue-500/10 text-blue-400"
                : "border-dark-accent text-dark-muted hover:text-dark-text"
            }`}
          >
            User Made
          </button>
        </div>
        <div className="max-h-36 overflow-y-auto nowheel space-y-1">
          {libraryTab === "builtIn" ? (
            <>
              <div className="text-[10px] text-dark-muted px-1 pt-1">Parents</div>
              {roleStyleLists.parents
                .filter((e) => e.isBuiltIn)
                .map((entry) => renderRoleStyleRow(entry, true))}
              <div className="text-[10px] text-dark-muted px-1 pt-2">Children</div>
              {roleStyleLists.children
                .filter((e) => e.isBuiltIn)
                .map((entry) => renderRoleStyleRow(entry, true))}
            </>
          ) : (
            <>
              {connectionStyles.length === 0 &&
                roleStyleLists.parents.filter((e) => !e.isBuiltIn).length === 0 &&
                roleStyleLists.children.filter((e) => !e.isBuiltIn).length === 0 && (
                  <div className="text-xs text-dark-muted px-1 py-2">No user styles yet</div>
                )}
              {connectionStyles.map((style) => {
                const isActive = advancedOpen
                  ? activeStyleId === style.id
                  : !hasOverride && activeStyleIdForUnion === style.id;
                return (
                  <div
                    key={style.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleLibraryStyleClick(style.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleLibraryStyleClick(style.id);
                      }
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border ${
                      isActive
                        ? "border-blue-500 bg-blue-500/10"
                        : "border-transparent hover:border-dark-accent hover:bg-dark-accent/30"
                    }`}
                  >
                    <StylePreviewLine style={style} />
                    <span className="flex-1 text-xs truncate">{style.name}</span>
                    <button
                      type="button"
                      title="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditDraft(style);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Duplicate"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateConnectionStyle(style.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConnectionStyle(style.id);
                      }}
                      className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                );
              })}
              {roleStyleLists.parents
                .filter((e) => !e.isBuiltIn)
                .map((entry) => renderRoleStyleRow(entry, false))}
              {roleStyleLists.children
                .filter((e) => !e.isBuiltIn)
                .map((entry) => renderRoleStyleRow(entry, false))}
            </>
          )}
        </div>
        {libraryTab === "builtIn" ? (
          <button
            type="button"
            onClick={() => resetAllBuiltInRoleStyles()}
            className="mt-2 w-full px-2 py-1.5 text-xs rounded border border-dark-accent text-dark-muted hover:text-dark-text hover:border-dark-muted"
          >
            Reset all built-in styles
          </button>
        ) : (
          <button
            type="button"
            onClick={startNewDraft}
            className="mt-2 w-full px-2 py-1.5 text-xs rounded border border-dashed border-dark-accent text-dark-muted hover:text-dark-text hover:border-dark-muted"
          >
            + New Style
          </button>
        )}
      </div>

      {draft && (
        <div className="mt-3 pt-3 border-t border-dark-accent">
          <div className="text-xs text-dark-muted mb-2">
            {draft.roleKey ? "Edit role style" : draft.id ? "Edit style" : "New style"}
          </div>
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className="!mb-2 !py-2 !px-3 text-sm"
          />
          <div className="mb-2">
            <label className="block text-dark-muted text-sm mb-2">Description</label>
            <textarea
              value={draft.description ?? ""}
              onChange={(e) => updateDraft({ description: e.target.value })}
              className="w-full px-3 py-2 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm resize-y min-h-[60px] focus:outline-none focus:border-blue-500"
              placeholder="Optional description shown as a tooltip..."
            />
          </div>
          <ColorInput
            label="Color"
            value={draft.stroke}
            onChange={(stroke) => updateDraft({ stroke })}
            className="!mb-2"
          />
          <div className="mb-2 flex items-center gap-2">
            <span className="text-dark-muted text-sm">Icon</span>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {draft.icon ? renderConnectionIcon(draft.icon, 18) : (
                <span className="text-xs text-dark-muted">None</span>
              )}
              <button
                type="button"
                data-keep-icon-picker
                onClick={() => setIconPickerOpen(true)}
                className="ml-auto px-2 py-1 text-xs rounded border border-dark-accent text-dark-muted hover:text-dark-text hover:border-dark-muted"
              >
                Assign icon
              </button>
            </div>
          </div>
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <NumberSlider
              label="Line weight"
              value={draft.strokeWidth}
              min={0.5}
              max={12}
              step={0.5}
              onChange={(strokeWidth) => updateDraft({ strokeWidth })}
              className="!mb-2"
            />
          </div>
          <div className="mb-2">
            <div className="text-dark-muted text-sm mb-2">Dash pattern</div>
            <div className="flex flex-wrap gap-1 mb-2">
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [] })}>
                Solid
              </button>
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [8, 4] })}>
                Dashed
              </button>
              <button type="button" className={presetBtnClass} onClick={() => updateDraft({ dashPattern: [1, 4] })}>
                Dotted
              </button>
              <button
                type="button"
                className={presetBtnClass}
                onClick={() => updateDraft({ dashPattern: [8, 4, 1, 4] })}
              >
                Dash-dot
              </button>
            </div>
            <div className="space-y-2">
              {dashPairs(draft.dashPattern).map((pair, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-dark-muted text-xs mb-1">Dash</label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={pair.dash}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        if (Number.isNaN(n)) return;
                        const pairs = dashPairs(draft.dashPattern);
                        pairs[idx] = { ...pairs[idx]!, dash: n };
                        updateDraft({ dashPattern: pairsToPattern(pairs) });
                      }}
                      className="w-full px-2 py-1.5 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {pair.gap != null && (
                    <div className="flex-1">
                      <label className="block text-dark-muted text-xs mb-1">Gap</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={pair.gap}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value);
                          if (Number.isNaN(n)) return;
                          const pairs = dashPairs(draft.dashPattern);
                          pairs[idx] = { ...pairs[idx]!, gap: n };
                          updateDraft({ dashPattern: pairsToPattern(pairs) });
                        }}
                        className="w-full px-2 py-1.5 bg-dark-bg border border-dark-accent rounded-lg text-dark-text text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    title="Remove segment"
                    onClick={() => {
                      const pairs = dashPairs(draft.dashPattern);
                      pairs.splice(idx, 1);
                      updateDraft({ dashPattern: pairsToPattern(pairs) });
                    }}
                    className="w-7 h-7 flex items-center justify-center rounded text-dark-muted hover:text-red-400 hover:bg-dark-accent/50 mb-0.5"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => updateDraft({ dashPattern: [...draft.dashPattern, 4, 4] })}
              className="mt-2 text-xs text-dark-muted hover:text-dark-text"
            >
              + Add segment
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button type="button" onClick={handleSaveToLibrary} className="!py-1.5 !px-3 text-xs">
              {draft.roleKey ? "Save role style" : "Save to Library"}
            </Button>
            {!draft.roleKey && (
              <Button type="button" onClick={handleUseWithoutSaving} className="!py-1.5 !px-3 text-xs">
                Use without saving
              </Button>
            )}
            <button
              type="button"
              onClick={() => {
                setIconPickerOpen(false);
                setDraft(null);
              }}
              className="px-3 py-1.5 text-xs text-dark-muted hover:text-dark-text"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );

  const rightColumn = (
    <div className="border-l border-dark-accent pl-3 min-w-0 flex flex-col">
      {advancedOpen && (
        <>
          <div className="text-xs text-dark-muted mb-1.5">Union Connections</div>
          {parentConnections.length === 0 && childConnections.length === 0 ? (
            <div className="text-xs text-dark-muted px-1 py-2">No connected people</div>
          ) : (
            <div
              className={`overflow-y-auto nowheel space-y-2 ${iconPickerOpen ? "max-h-40" : "max-h-64"}`}
            >
              {parentConnections.length > 0 && (
                <div>
                  <div className="text-[10px] text-dark-muted mb-1 px-1">Parents</div>
                  <div className="space-y-1">{parentConnections.map(renderConnectionRow)}</div>
                </div>
              )}
              {childConnections.length > 0 && (
                <div>
                  <div className="text-[10px] text-dark-muted mb-1 px-1">Children</div>
                  <div className="space-y-1">{childConnections.map(renderConnectionRow)}</div>
                </div>
              )}
            </div>
          )}
          {activePersonIds.size > 0 && (
            <p className="text-[10px] text-dark-muted mt-2">
              {activePersonIds.size} selected — click a library style to apply
            </p>
          )}
          {activeStyleId && activePersonIds.size === 0 && (
            <p className="text-[10px] text-dark-muted mt-2">
              Style selected — click connection names to apply
            </p>
          )}
        </>
      )}
      {iconPickerOpen && (
        <div
          ref={iconPickerBoxRef}
          className={advancedOpen ? "mt-3 pt-3 border-t border-dark-accent" : undefined}
        >
          <ConnectionIconPicker
            value={draft?.icon}
            onSelect={(icon) => {
              if (draft) updateDraft({ icon });
              else setDraft({ name: "", description: "", ...DEFAULT_CONNECTION_STYLE, icon });
            }}
            onClear={() => updateDraft({ icon: undefined })}
          />
        </div>
      )}
    </div>
  );

  const showSecondColumn = advancedOpen || iconPickerOpen;

  return (
    <div
      ref={rootRef}
      className={`nowheel ${showSecondColumn ? "w-[640px]" : "w-[320px]"} max-h-[90vh] overflow-y-auto bg-dark-surface border border-dark-accent rounded-lg shadow-lg p-3 text-dark-text`}
      style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={handleRootClick}
    >
      <div
        className="flex items-center justify-between mb-3 cursor-move select-none"
        onPointerDown={handleDragHandlePointerDown}
        title="Drag to move"
      >
        <h3 className="text-sm font-medium">Connection Style</h3>
        <button
          type="button"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          className="w-6 h-6 flex items-center justify-center rounded text-dark-muted hover:text-dark-text hover:bg-dark-accent/50 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <label className="flex items-center gap-2 text-xs text-dark-muted cursor-pointer">
          <input
            type="checkbox"
            checked={advancedOpen}
            onChange={(e) => {
              setAdvancedOpen(e.target.checked);
              setActivePersonIds(new Set());
              setActiveStyleId(null);
            }}
            className="themed-checkbox"
          />
          Advanced options
        </label>
        {advancedOpen && (
          <label className="flex items-center gap-2 text-xs text-dark-muted cursor-pointer">
            <input
              type="checkbox"
              checked={useRoleStyles}
              onChange={(e) => setUnionUseRoleStyles(unionId, e.target.checked)}
              className="themed-checkbox"
            />
            Use Parent/Child role style
          </label>
        )}
      </div>

      {showSecondColumn ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">{leftColumn}</div>
          {rightColumn}
        </div>
      ) : (
        leftColumn
      )}
      <RoleStyleLinkWarningModal
        isOpen={!!pendingRoleLink}
        roleLabel={pendingRoleLink?.label ?? ""}
        culprits={warningCulprits}
        onCancel={cancelRoleLink}
        onProceed={confirmRoleLink}
      />
    </div>
  );
}
