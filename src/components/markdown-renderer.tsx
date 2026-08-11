"use client";

import { useMemo } from "react";

interface MarkdownRendererProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownToHtml(md: string): string {
  let html = md;

  // Handle tables first (GFM tables)
  const tableBlockRegex = /(^|\n)((?:\|[^\n]+\|\n)+)/g;
  html = html.replace(tableBlockRegex, (_match, prefix: string, tableBlock: string) => {
    const rows = tableBlock.trim().split("\n");
    if (rows.length < 2) return prefix + tableBlock;

    const parseRow = (row: string) =>
      row.split("|").filter((_, i, arr) => i > 0 && i < arr.length - 1).map((c) => c.trim());

    // Check if second row is a separator (---, :---, ---:, :---:)
    const sepRow = parseRow(rows[1]);
    const isSep = sepRow.every((cell) => /^:?-+:?$/.test(cell));
    if (!isSep) return prefix + tableBlock;

    const headerCells = parseRow(rows[0]);
    const bodyRows = rows.slice(2);

    let table = '<table class="w-full border-collapse my-2 text-xs">';
    table += '<thead class="bg-muted/50"><tr>';
    headerCells.forEach((cell) => {
      table += `<th class="border border-border px-2 py-1 text-left font-semibold">${processInline(cell)}</th>`;
    });
    table += "</tr></thead><tbody>";
    bodyRows.forEach((row, idx) => {
      const cells = parseRow(row);
      const bgClass = idx % 2 === 1 ? ' class="even:bg-muted/20"' : "";
      table += `<tr${bgClass}>`;
      cells.forEach((cell) => {
        table += `<td class="border border-border px-2 py-1">${processInline(cell)}</td>`;
      });
      table += "</tr>";
    });
    table += "</tbody></table>";
    return prefix + table;
  });

  // Split into lines for block-level processing
  const lines = html.split("\n");
  const result: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip if inside a table tag already
    if (line.includes("<table") || line.includes("</table") || line.includes("<thead") || line.includes("</thead") || line.includes("<tbody") || line.includes("</tbody") || line.includes("<tr") || line.includes("</tr") || line.includes("<th") || line.includes("</th") || line.includes("<td") || line.includes("</td")) {
      result.push(line);
      continue;
    }

    // Headings
    const h3Match = line.match(/^### (.+)/);
    const h2Match = line.match(/^## (.+)/);
    const h1Match = line.match(/^# (.+)/);
    if (h3Match) {
      closeList();
      result.push(`<h3 class="text-sm font-bold mt-2 mb-1">${processInline(h3Match[1])}</h3>`);
      continue;
    }
    if (h2Match) {
      closeList();
      result.push(`<h2 class="text-sm font-bold mt-2.5 mb-1 pb-1 border-b border-border">${processInline(h2Match[1])}</h2>`);
      continue;
    }
    if (h1Match) {
      closeList();
      result.push(`<h1 class="text-base font-bold mt-3 mb-1">${processInline(h1Match[1])}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      closeList();
      result.push('<hr class="my-2 border-border" />');
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*] (.+)/);
    if (ulMatch) {
      if (listType !== "ul") { closeList(); inList = true; listType = "ul"; result.push('<ul class="list-disc pl-4 my-1 space-y-0.5">'); }
      result.push(`<li class="leading-relaxed">${processInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)/);
    if (olMatch) {
      if (listType !== "ol") { closeList(); inList = true; listType = "ol"; result.push('<ol class="list-decimal pl-4 my-1 space-y-0.5">'); }
      result.push(`<li class="leading-relaxed">${processInline(olMatch[1])}</li>`);
      continue;
    }

    // Blockquote
    const bqMatch = line.match(/^> (.+)/);
    if (bqMatch) {
      closeList();
      result.push(`<blockquote class="border-l-2 border-primary pl-3 my-1 text-muted-foreground">${processInline(bqMatch[1])}</blockquote>`);
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      closeList();
      continue;
    }

    // Regular paragraph
    closeList();
    result.push(`<p class="my-1 leading-relaxed">${processInline(line)}</p>`);
  }
  closeList();

  function closeList() {
    if (inList && listType === "ul") result.push("</ul>");
    if (inList && listType === "ol") result.push("</ol>");
    inList = false;
    listType = null;
  }

  return result.join("\n");
}

function processInline(text: string): string {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold">$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  text = text.replace(/`(.+?)`/g, '<code class="bg-muted/50 px-1 py-0.5 rounded text-xs">$1</code>');
  // Line break
  text = text.replace(/  $/gm, "<br/>");
  return text;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = useMemo(() => renderMarkdownToHtml(content), [content]);
  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
