/**
 * Parser for the Charts DSL (script → store format).
 * Parses @charts (and legacy @profiles), [CharacterName] { ... }, h1-h4, note, attributes, image.
 */

import type {
  CharacterEntity,
  ProfileSection,
  NoteBlock,
  AttributeBlock,
  ImageBlock,
  SectionHeadingLevel,
  CustomDataType,
  AttributeMetaItem,
  AttributeType,
} from "./store/chartsStore";

function generateId() {
  return `_${Math.random().toString(36).slice(2, 11)}`;
}

export interface ParseError {
  message: string;
  line?: number;
}

export type ParseResult =
  | { ok: true; characters: CharacterEntity[]; customDataTypes?: CustomDataType[]; builtinDataTypes?: string[] }
  | { ok: false; error: ParseError };

/** Unescape a double-quoted string: \" → ", \\ → \, \n → newline */
function unescapeQuotedString(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const next = s[i + 1];
      if (next === "n") result += "\n";
      else if (next === "r") result += "\r";
      else if (next === "t") result += "\t";
      else if (next === '"') result += '"';
      else if (next === "\\") result += "\\";
      else result += next;
      i += 2;
    } else {
      result += s[i];
      i++;
    }
  }
  return result;
}

const TAB_SIZE = 2;

/** Get indent level: spaces count as 1 each, tabs count as TAB_SIZE. */
function getIndent(line: string): number {
  let i = 0;
  let indent = 0;
  while (i < line.length) {
    if (line[i] === " ") {
      indent++;
      i++;
    } else if (line[i] === "\t") {
      indent += TAB_SIZE;
      i++;
    } else {
      break;
    }
  }
  return indent;
}

/** Parse [CharacterName] - returns [name, hasBrace] or null */
function parseCharacterHeader(line: string): [string, boolean] | null {
  const match = line.match(/^\s*\[([^\]]*)\]\s*\{?\s*$/);
  if (!match) return null;
  const name = match[1].trim() || "Unnamed";
  const hasOpenBrace = line.includes("{");
  return [name, hasOpenBrace];
}


/** Parse data types block: # Data types, @builtin lines (stored), TagName: [opt1, opt2, ...] */
function parseDataTypesBlock(lines: string[], startIdx: number): {
  dataTypes: CustomDataType[];
  builtinLines: string[];
  nextIdx: number;
} {
  const dataTypes: CustomDataType[] = [];
  const builtinLines: string[] = [];
  let i = startIdx;
  if (i < lines.length && /^\s*#\s*Data types\s*$/i.test(lines[i].trim())) {
    i++;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (trimmed === "") {
        i++;
        break;
      }
      if (/^\s*@builtin\s+/i.test(trimmed)) {
        builtinLines.push(trimmed);
        i++;
        continue;
      }
      const match = trimmed.match(/^([^:]+):\s*\[([^\]]*)\]\s*$/);
      if (match) {
        const name = match[1].trim() || "New Type";
        const optsStr = match[2] ?? "";
        const options = optsStr.split(",").map((s) => s.trim()).filter(Boolean);
        dataTypes.push({
          id: generateId(),
          name,
          options: options.length > 0 ? options : [""],
        });
        i++;
      } else {
        break;
      }
    }
  }
  return { dataTypes, builtinLines, nextIdx: i };
}

export function parseChartsScript(input: string): ParseResult {
  const lines = input.split(/\r?\n/);
  const characters: CharacterEntity[] = [];
  let i = 0;
  let currentChar: CharacterEntity | null = null;
  let currentCharContent: string[] = [];
  let customDataTypes: CustomDataType[] = [];

  // Skip @charts / legacy @profiles and blank lines at start
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed === "@charts" || trimmed === "@profiles") {
      i++;
      continue;
    }
    break;
  }

  // Parse optional data types block
  const dt = parseDataTypesBlock(lines, i);
  customDataTypes = dt.dataTypes;
  const builtinDataTypes = dt.builtinLines;
  i = dt.nextIdx;

  // If we have content, check for [Name] {
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Closing brace for current character
    if (currentChar && /^\s*}\s*$/.test(line)) {
      const parsed = parseCharacterContent(currentCharContent, i + 1, customDataTypes);
      if (!parsed.ok) return parsed;
      currentChar.sections = parsed.sections;
      if (customDataTypes.length > 0) {
        currentChar.customDataTypes = customDataTypes;
      }
      characters.push(currentChar);
      currentChar = null;
      currentCharContent = [];
      i++;
      continue;
    }

    // New character block: [Name] {
    const charHeader = parseCharacterHeader(line);
    if (charHeader) {
      const [name, hasBrace] = charHeader;
      if (currentChar && currentCharContent.length === 0) {
        // Empty previous block - still push it
        currentChar.sections = [];
        characters.push(currentChar);
      }
      currentChar = {
        id: generateId(),
        name,
        sections: [],
      };
      currentCharContent = [];
      if (hasBrace) {
        i++;
        continue;
      }
      // No { on same line - next line might be {
      i++;
      if (i < lines.length && /^\s*\{\s*$/.test(lines[i])) {
        i++;
      }
      continue;
    }

    if (currentChar) {
      currentCharContent.push(line);
    } else if (trimmed && !trimmed.startsWith("(")) {
      // Content outside any block
      return {
        ok: false,
        error: {
          message: `Unexpected content outside character block: "${trimmed.slice(0, 40)}${trimmed.length > 40 ? "..." : ""}"`,
          line: i + 1,
        },
      };
    }
    i++;
  }

  if (currentChar) {
    if (currentCharContent.length > 0) {
      const parsed = parseCharacterContent(currentCharContent, i, customDataTypes);
      if (!parsed.ok) return parsed;
      currentChar.sections = parsed.sections;
    }
    if (customDataTypes.length > 0) {
      currentChar.customDataTypes = customDataTypes;
    }
    characters.push(currentChar);
  }

  return { ok: true, characters, customDataTypes, builtinDataTypes };
}

interface ParseContentResult {
  ok: true;
  sections: ProfileSection[];
}
interface ParseContentError {
  ok: false;
  error: ParseError;
}
type ParseContentOut = ParseContentResult | ParseContentError;

/** Parse " value | @builtin:type [config] allowCustom=..." or " value | @TagName allowCustom=..." into { value, meta } */
function parseAttributeLine(
  valuePart: string,
  customDataTypes: CustomDataType[]
): { value: string; meta?: AttributeMetaItem } {
  const sepMatch = valuePart.match(/\s*\|\s*@/);
  if (!sepMatch) return { value: valuePart.trim() };
  const sepStart = valuePart.indexOf(sepMatch[0]);
  const value = valuePart.slice(0, sepStart).trim();
  let rest = valuePart.slice(sepStart + sepMatch[0].length).trim();
  if (!rest.startsWith("@")) rest = "@" + rest;
  rest = rest.slice(1).trim();

  const allowMatch = rest.match(/\s+allowCustom=(true|false)/i);
  const allowCustom = allowMatch
    ? allowMatch[1].toLowerCase() === "true"
    : undefined;
  const beforeAllow = allowMatch ? rest.slice(0, rest.indexOf(allowMatch[0])).trim() : rest;
  if (!beforeAllow) return { value };

  let typePart = beforeAllow;
  let configArr: string[] | null = null;
  const arrMatch = beforeAllow.match(/^(.+?)\s+\[([^\]]*)\]$/);
  if (arrMatch) {
    typePart = arrMatch[1].trim();
    const optsStr = arrMatch[2] ?? "";
    configArr = optsStr.split(",").map((s) => s.trim());
  }

  // Built-in: @builtin:typeName or @builtin:typeName [config], or legacy @typeName
  const builtinTypes = ["text", "number", "numberScroll", "select", "date"] as const;
  const builtinPrefix = "builtin:";
  const isBuiltinPrefixed = typePart.toLowerCase().startsWith(builtinPrefix);
  const legacyBuiltin = !isBuiltinPrefixed && builtinTypes.includes(typePart.toLowerCase() as (typeof builtinTypes)[number]);

  if (isBuiltinPrefixed || legacyBuiltin) {
    const builtinType = isBuiltinPrefixed
      ? typePart.slice(builtinPrefix.length).trim().toLowerCase()
      : typePart.toLowerCase();
    if (builtinTypes.includes(builtinType as (typeof builtinTypes)[number])) {
      const meta: AttributeMetaItem = {
        type: builtinType as AttributeType,
        allowCustom: allowCustom ?? (builtinType === "select" ? true : undefined),
      };
      if (configArr && configArr.length > 0) {
        if (builtinType === "number" || builtinType === "numberScroll") {
          const [minS, maxS, stepS] = configArr;
          if (minS !== undefined && minS !== "") {
            const n = Number(minS);
            if (!Number.isNaN(n)) meta.min = n;
          }
          if (maxS !== undefined && maxS !== "") {
            const n = Number(maxS);
            if (!Number.isNaN(n)) meta.max = n;
          }
          if (stepS !== undefined && stepS !== "") {
            const n = Number(stepS);
            if (!Number.isNaN(n)) meta.step = n;
          }
        } else if (builtinType === "select") {
          meta.options = configArr.filter(Boolean);
        }
      }
      return { value, meta };
    }
  }

  // Custom: @TagName (resolve via customDataTypes)
  const customType = customDataTypes.find(
    (t) => t.name.toLowerCase() === typePart.toLowerCase()
  );
  if (customType) {
    return {
      value,
      meta: {
        type: "custom",
        customTypeId: customType.id,
        allowCustom: allowCustom ?? true,
      },
    };
  }
  return { value };
}

function parseCharacterContent(
  contentLines: string[],
  lineOffset: number,
  customDataTypes: CustomDataType[]
): ParseContentOut {
  const sections: ProfileSection[] = [];
  const sectionStack: { indent: number; section: ProfileSection }[] = [];
  let attributesBlock: AttributeBlock | null = null;
  let attributesBlockSectionId: string | null = null;
  let attributesIndent = -1;

  function popUntilParent(indent: number): ProfileSection | null {
    while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].indent >= indent) {
      sectionStack.pop();
    }
    if (sectionStack.length > 0) return sectionStack[sectionStack.length - 1].section;
    return null;
  }

  function flushAttributesBlock() {
    if (attributesBlock && attributesBlockSectionId) {
      const sec = sections.find((s) => s.id === attributesBlockSectionId);
      if (sec) {
        sec.contentBlocks = [...(sec.contentBlocks ?? []), attributesBlock!];
      }
      attributesBlock = null;
      attributesBlockSectionId = null;
      attributesIndent = -1;
    }
  }

  for (let idx = 0; idx < contentLines.length; idx++) {
    const line = contentLines[idx];
    const lineNum = lineOffset + idx;
    const indent = getIndent(line);
    const trimmed = line.trim();
    if (trimmed === "") continue;

    // Key-value pair (must follow attributes block, at greater indent)
    if (attributesBlock && attributesBlockSectionId && indent > attributesIndent) {
      const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const rawValue = kvMatch[2] ?? "";
        if (key) {
          const { value, meta } = parseAttributeLine(rawValue, customDataTypes);
          attributesBlock.keyValuePairs[key] = value;
          attributesBlock.attributeOrder = [...(attributesBlock.attributeOrder ?? []), key];
          if (meta) {
            attributesBlock.attributeMeta = attributesBlock.attributeMeta ?? {};
            attributesBlock.attributeMeta[key] = meta;
          }
        }
        continue;
      }
      flushAttributesBlock();
    }

    // Section: h1/h2/h3/h4 "label"
    const secMatch = trimmed.match(/^(h1|h2|h3|h4)\s+"((?:[^"\\]|\\.)*)"\s*$/);
    if (secMatch) {
      flushAttributesBlock();
      const level = secMatch[1] as SectionHeadingLevel;
      const label = unescapeQuotedString(secMatch[2]);
      const parent = popUntilParent(indent);
      const section: ProfileSection = {
        id: generateId(),
        label,
        headingLevel: level,
        parentId: parent?.id ?? null,
        contentBlocks: [],
        order: sections.filter((s) => (s.parentId ?? null) === (parent?.id ?? null)).length,
      };
      sections.push(section);
      sectionStack.push({ indent, section });
      continue;
    }

    // note "content"
    const noteMatch = trimmed.match(/^note\s+"((?:[^"\\]|\\.)*)"\s*$/);
    if (noteMatch) {
      flushAttributesBlock();
      const content = unescapeQuotedString(noteMatch[1]);
      const parentSection = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].section : null;
      if (!parentSection) {
        return {
          ok: false,
          error: {
            message: "note must be inside a section (h1, h2, etc.)",
            line: lineNum,
          },
        };
      }
      const block: NoteBlock = { type: "note", id: generateId(), content };
      parentSection.contentBlocks = [...(parentSection.contentBlocks ?? []), block];
      continue;
    }

    // attributes
    if (/^\s*attributes\s*$/.test(line)) {
      flushAttributesBlock();
      const parentSection = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].section : null;
      if (!parentSection) {
        return {
          ok: false,
          error: {
            message: "attributes must be inside a section (h1, h2, etc.)",
            line: lineNum,
          },
        };
      }
      attributesBlock = {
        type: "attributes",
        id: generateId(),
        keyValuePairs: {},
        attributeOrder: [],
      };
      attributesBlockSectionId = parentSection.id;
      attributesIndent = indent;
      continue;
    }

    // image "label"
    const imgMatch = trimmed.match(/^image\s+"((?:[^"\\]|\\.)*)"\s*$/);
    if (imgMatch) {
      flushAttributesBlock();
      const label = unescapeQuotedString(imgMatch[1]);
      const parentSection = sectionStack.length > 0 ? sectionStack[sectionStack.length - 1].section : null;
      if (!parentSection) {
        return {
          ok: false,
          error: {
            message: "image must be inside a section (h1, h2, etc.)",
            line: lineNum,
          },
        };
      }
      const block: ImageBlock = { type: "image", id: generateId(), label: label || undefined };
      parentSection.contentBlocks = [...(parentSection.contentBlocks ?? []), block];
      continue;
    }

    // Key-value at indent > attributes (already handled above)

    // Placeholder line (— or similar) - skip
    if (/^\s*[—\-]\s*$/.test(trimmed)) continue;

    // Unrecognized - try to be forgiving (e.g. key: value without attributes wrapper)
    const looseKv = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (looseKv && sectionStack.length > 0) {
      flushAttributesBlock();
      const parentSection = sectionStack[sectionStack.length - 1].section;
      let attrsBlock = parentSection.contentBlocks?.find((b): b is AttributeBlock => b.type === "attributes") as AttributeBlock | undefined;
      if (!attrsBlock) {
        attrsBlock = {
          type: "attributes",
          id: generateId(),
          keyValuePairs: {},
          attributeOrder: [],
        };
        parentSection.contentBlocks = [...(parentSection.contentBlocks ?? []), attrsBlock];
      }
      const key = looseKv[1].trim();
      const rawValue = looseKv[2] ?? "";
      const { value, meta } = parseAttributeLine(rawValue, customDataTypes);
      attrsBlock.keyValuePairs[key] = value;
      attrsBlock.attributeOrder = [...(attrsBlock.attributeOrder ?? []), key];
      if (meta) {
        attrsBlock.attributeMeta = attrsBlock.attributeMeta ?? {};
        attrsBlock.attributeMeta[key] = meta;
      }
      continue;
    }

    return {
      ok: false,
      error: {
        message: `Unexpected syntax: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "..." : ""}"`,
        line: lineNum,
      },
    };
  }

  flushAttributesBlock();

  // Fix order for sibling sections
  const byParent = new Map<string | null, ProfileSection[]>();
  for (const s of sections) {
    const p = s.parentId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(s);
  }
  for (const arr of byParent.values()) {
    arr.sort((a, b) => a.order - b.order);
  }

  return { ok: true, sections };
}
