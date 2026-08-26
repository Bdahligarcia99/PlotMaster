import { useEffect, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TextAlign from "@tiptap/extension-text-align";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { FontSize } from "./extensions/FontSize";
import { LineHeight } from "./extensions/LineHeight";
import NeuronRichTextToolbar from "../NeuronRichTextToolbar";
import NeuronRuler from "./NeuronRuler";

const MAX_IMAGE_BYTES = 800_000;

interface NeuronRichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  leftMargin?: number;
  rightMargin?: number;
  onMarginChange?: (left: number, right: number) => void;
  showRuler?: boolean;
  onToggleRuler?: () => void;
  placeholder?: string;
  hideToolbar?: boolean;
  onEditorReady?: (editor: import("@tiptap/react").Editor | null) => void;
  toolbarTrailing?: React.ReactNode;
}

function parseContent(raw: string): object {
  if (!raw.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  try {
    return JSON.parse(raw) as object;
  } catch {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }],
    };
  }
}

export default function NeuronRichTextEditor({
  content,
  onChange,
  leftMargin = 48,
  rightMargin = 48,
  onMarginChange,
  showRuler = true,
  onToggleRuler,
  placeholder = "Start writing…",
  hideToolbar = false,
  onEditorReady,
  toolbarTrailing,
}: NeuronRichTextEditorProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipUpdateRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      LineHeight,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: true, allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: parseContent(content),
    editorProps: {
      attributes: {
        class:
          "prose prose-invert max-w-none min-h-[300px] px-4 py-3 focus:outline-none text-dark-text",
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (!file || file.size > MAX_IMAGE_BYTES) return true;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              editor?.chain().focus().setImage({ src }).run();
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file || !file.type.startsWith("image/") || file.size > MAX_IMAGE_BYTES) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = () => {
          const src = reader.result as string;
          editor?.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (skipUpdateRef.current) return;
      const json = JSON.stringify(ed.getJSON());
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(json), 800);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const parsed = parseContent(content);
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(parsed);
    if (current !== incoming) {
      skipUpdateRef.current = true;
      editor.commands.setContent(parsed, { emitUpdate: false });
      skipUpdateRef.current = false;
    }
  }, [content, editor]);

  const flush = useCallback(() => {
    if (!editor) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onChange(JSON.stringify(editor.getJSON()));
  }, [editor, onChange]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  useEffect(() => {
    (window as unknown as { __neuronFlushEditor?: () => void }).__neuronFlushEditor = flush;
    return () => {
      delete (window as unknown as { __neuronFlushEditor?: () => void }).__neuronFlushEditor;
    };
  }, [flush]);

  useEffect(() => {
    onEditorReady?.(editor ?? null);
  }, [editor, onEditorReady]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {!hideToolbar && (
        <NeuronRichTextToolbar
          editor={editor}
          showRuler={showRuler}
          onToggleRuler={onToggleRuler ?? (() => {})}
          trailing={toolbarTrailing}
        />
      )}
      {showRuler && onMarginChange && (
        <NeuronRuler
          leftMargin={leftMargin}
          rightMargin={rightMargin}
          width={800}
          onMarginChange={onMarginChange}
        />
      )}
      <div
        className="flex-1 overflow-auto bg-dark-bg"
        style={{ paddingLeft: leftMargin, paddingRight: rightMargin }}
      >
        <EditorContent editor={editor} className="neuron-rich-text" />
      </div>
    </div>
  );
}
