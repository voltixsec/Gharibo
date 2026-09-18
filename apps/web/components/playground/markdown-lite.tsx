"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";

/**
 * Minimal, dependency-free markdown renderer for assistant responses.
 *
 * Renders to React elements — never via `dangerouslySetInnerHTML` — so model
 * output can never inject markup into the application.
 *
 * Supported: fenced code blocks, headings, unordered/ordered lists, block
 * quotes, horizontal rules, and inline `code`, **bold**, *italic*.
 */

interface MarkdownLiteProps {
  content: string;
  className?: string;
}

export function MarkdownLite({ content, className }: MarkdownLiteProps) {
  const blocks = parseBlocks(content);
  return <div className={cn("space-y-3 text-sm leading-relaxed", className)}>{blocks}</div>;
}

type Block =
  | { kind: "code"; language: string; code: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "paragraph"; text: string };

function parseBlocks(source: string): ReactNode[] {
  const lines = (source ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^\s*```(\w+)?\s*$/);
    if (fence) {
      const language = fence[1] ?? "";
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({ kind: "code", language, code: body.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ kind: "hr" });
      i += 1;
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    // Block quote
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ kind: "quote", text: quote.join("\n") });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: false, items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
        i += 1;
      }
      blocks.push({ kind: "list", ordered: true, items });
      continue;
    }

    // Blank line
    if (line.trim().length === 0) {
      i += 1;
      continue;
    }

    // Paragraph (until a blank line or the start of another block)
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^\s*```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*(---|\*\*\*|___)\s*$/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }

  return blocks.map((block, index) => <BlockView key={index} block={block} />);
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "code":
      return <CodeBlock language={block.language} code={block.code} />;
    case "heading": {
      const size =
        block.level === 1
          ? "text-lg font-semibold"
          : block.level === 2
            ? "text-base font-semibold"
            : "text-sm font-semibold";
      return <p className={cn(size, "text-foreground")}>{renderInline(block.text)}</p>;
    }
    case "list":
      return block.ordered ? (
        <ol className="ml-5 list-decimal space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul className="ml-5 list-disc space-y-1">
          {block.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-[color:var(--gharibo-border-strong)] pl-3 text-muted-foreground">
          {renderInline(block.text)}
        </blockquote>
      );
    case "hr":
      return <hr className="border-border" />;
    default:
      return <p className="whitespace-pre-wrap">{renderInline(block.text)}</p>;
  }
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no false success state */
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-[color:var(--gharibo-surface-sunken)]">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-[color:var(--gharibo-text-subtle)]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Long lines scroll horizontally instead of breaking the layout. */}
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

/**
 * Renders inline spans: `code`, **bold**, *italic*.
 *
 * Splits on the tokens and returns plain strings for everything else, so no
 * model-provided markup is ever interpreted as HTML.
 */
function renderInline(text: string): ReactNode[] {
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = text.split(pattern).filter((p) => p !== undefined && p !== "");

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded bg-[color:var(--gharibo-surface-sunken)] px-1 py-0.5 font-mono text-[0.8125em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
