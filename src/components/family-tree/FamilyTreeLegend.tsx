import { useMemo } from "react";
import {
  useFamilyTreeStore,
  collectWinningRoleStyleKeys,
  resolveRoleStyle,
} from "../../store/familyTreeStore";
import { StylePreviewLine } from "./UnionConnectionStyleEditor";
import { renderConnectionIcon } from "./connectionIconRegistry";

export default function FamilyTreeLegend() {
  const connectionStyles = useFamilyTreeStore((s) => s.connectionStyles);
  const nodes = useFamilyTreeStore((s) => s.nodes);
  const edges = useFamilyTreeStore((s) => s.edges);
  const roleStyleLinks = useFamilyTreeStore((s) => s.roleStyleLinks);
  const roleStyleOverrides = useFamilyTreeStore((s) => s.roleStyleOverrides);

  const roleStyleCtx = useMemo(
    () => ({ roleStyleLinks, roleStyleOverrides }),
    [roleStyleLinks, roleStyleOverrides]
  );

  const winningRoleStyles = useMemo(() => {
    const keys = collectWinningRoleStyleKeys(nodes, edges, roleStyleCtx);
    return keys.map((key) => ({
      key,
      ...resolveRoleStyle(key, roleStyleOverrides),
    }));
  }, [nodes, edges, roleStyleCtx, roleStyleOverrides]);

  if (connectionStyles.length === 0 && winningRoleStyles.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-16 z-30 w-[220px] bg-dark-surface border border-dark-accent rounded-lg shadow-lg p-3 pointer-events-auto">
      <div className="text-xs font-medium text-dark-text mb-2">Legend</div>
      <div className="space-y-1.5">
        {connectionStyles.map((style) => (
          <div key={style.id} className="flex items-center gap-2">
            <StylePreviewLine style={style} width={32} height={14} />
            {style.icon && (
              <span className="flex-shrink-0">{renderConnectionIcon(style.icon, 14)}</span>
            )}
            <span
              className="text-xs text-dark-muted truncate cursor-default"
              title={style.description || undefined}
            >
              {style.name}
            </span>
          </div>
        ))}
        {winningRoleStyles.map((style) => (
          <div key={style.key} className="flex items-center gap-2">
            <StylePreviewLine style={style} width={32} height={14} />
            {style.icon && (
              <span className="flex-shrink-0">{renderConnectionIcon(style.icon, 14)}</span>
            )}
            <span
              className="text-xs text-dark-muted truncate cursor-default"
              title={style.description || undefined}
            >
              {style.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
