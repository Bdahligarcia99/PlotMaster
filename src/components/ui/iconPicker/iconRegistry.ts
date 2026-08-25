/** Shared icon reference type (emoji or react-icons registry key). */
export interface IconRef {
  kind: "emoji" | "icon";
  value: string;
}

export {
  EMOJI_CATEGORIES,
  ICON_REGISTRY_KEYS,
  getConnectionIcon,
  renderConnectionIcon,
} from "../../family-tree/connectionIconRegistry";
