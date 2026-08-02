import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: true });

export function renderSafeMarkdown(markdown: string): string {
  const rendered = marked.parse(markdown, { async: false }) as string;
  return DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "ul", "ol", "li", "blockquote", "code", "pre", "a", "h2", "h3", "hr", "table", "thead", "tbody", "tr", "th", "td"],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOW_DATA_ATTR: false,
  });
}
