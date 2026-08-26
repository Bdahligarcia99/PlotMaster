import type { Editor } from "@tiptap/react";

const FONT_SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px"];
const FONT_FAMILIES = [
  "inherit",
  "Georgia, serif",
  "Times New Roman, serif",
  "Arial, sans-serif",
  "Helvetica, sans-serif",
  "Courier New, monospace",
];
const LINE_HEIGHTS = ["1", "1.15", "1.5", "2", "2.5"];

interface NeuronRichTextToolbarProps {
  editor: Editor | null;
  showRuler: boolean;
  onToggleRuler: () => void;
  trailing?: React.ReactNode;
  embedded?: boolean;
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded border transition-colors ${
        active
          ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
          : "border-dark-accent text-dark-muted hover:text-dark-text hover:bg-dark-accent/40"
      }`}
    >
      {children}
    </button>
  );
}

export default function NeuronRichTextToolbar({
  editor,
  showRuler,
  onToggleRuler,
  trailing,
  embedded,
}: NeuronRichTextToolbarProps) {
  if (!editor) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1 ${embedded ? "" : "px-3 py-2 border-b border-dark-accent bg-dark-surface"}`}
    >
      <ToolbarButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        B
      </ToolbarButton>
      <ToolbarButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        S
      </ToolbarButton>
      <div className="w-px h-5 bg-dark-accent mx-1" />
      <ToolbarButton
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <div className="w-px h-5 bg-dark-accent mx-1" />
      <ToolbarButton
        title="Align left"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        ⬅
      </ToolbarButton>
      <ToolbarButton
        title="Align center"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        ↔
      </ToolbarButton>
      <ToolbarButton
        title="Align right"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        ➡
      </ToolbarButton>
      <div className="w-px h-5 bg-dark-accent mx-1" />
      <select
        title="Font size"
        className="px-2 py-1 text-xs rounded border border-dark-accent bg-dark-bg text-dark-text"
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setFontSize(v).run();
          else editor.chain().focus().unsetFontSize().run();
        }}
        defaultValue=""
      >
        <option value="">Size</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        title="Font family"
        className="px-2 py-1 text-xs rounded border border-dark-accent bg-dark-bg text-dark-text max-w-[120px]"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "inherit") editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
        defaultValue="inherit"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f} value={f}>
            {f.split(",")[0]}
          </option>
        ))}
      </select>
      <select
        title="Line spacing"
        className="px-2 py-1 text-xs rounded border border-dark-accent bg-dark-bg text-dark-text"
        onChange={(e) => {
          const v = e.target.value;
          if (v) editor.chain().focus().setLineHeight(v).run();
          else editor.chain().focus().unsetLineHeight().run();
        }}
        defaultValue=""
      >
        <option value="">Spacing</option>
        {LINE_HEIGHTS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <ToolbarButton title="Bullet list" onClick={() => editor.chain().focus().toggleBulletList().run()}>
        • List
      </ToolbarButton>
      <ToolbarButton title="Ordered list" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        1. List
      </ToolbarButton>
      <ToolbarButton title="Blockquote" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        "
      </ToolbarButton>
      <div className="w-px h-5 bg-dark-accent mx-1" />
      <ToolbarButton title="Toggle ruler" active={showRuler} onClick={onToggleRuler}>
        Ruler
      </ToolbarButton>
      {trailing && (
        <>
          <div className="flex-1 min-w-[8px]" />
          {trailing}
        </>
      )}
    </div>
  );
}
