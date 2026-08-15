export type WeeklyActivityTarget = "thisWeek" | "nextWeek";

export type WeeklyActivityDrafts = Readonly<{
  thisWeekHtml: string;
  nextWeekHtml: string;
}>;

export interface SharedEditorAdapter {
  getSemanticHTML(): string;
  setSemanticHTML(html: string): void;
  focus(): void;
}

export const ALLOWED_QUILL_FORMATS = ["bold", "color", "size", "list"] as const;

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const ALLOWED_HTML_TAGS = new Set(["P", "BR", "STRONG", "UL", "OL", "LI", "SPAN"]);
const ALLOWED_COLORS = new Map([
  ["#161513", "#161513"],
  ["#7a2e1e", "#7A2E1E"],
  ["#0b5f66", "#0B5F66"],
  ["#5f4b8b", "#5F4B8B"]
]);
const ALLOWED_SIZES = new Set(["12px", "14px", "16px", "18px", "20px"]);

const NODE_TEST_ENTITY_FALLBACK: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: "\u00A0",
  copy: "©", euro: "€", CounterClockwiseContourIntegral: "∳"
};

/** Browser HTML parsing is the canonical full named/numeric entity decoder. */
const decodeHtmlEntities = (value: string): string => {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]+);/gi, (token, entity: string) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      if (Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10FFFF && !(codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
        return String.fromCodePoint(codePoint);
      }
      return token;
    }
    return NODE_TEST_ENTITY_FALLBACK[entity] ?? NODE_TEST_ENTITY_FALLBACK[entity.toLowerCase()] ?? token;
  });
};

export const sanitizeWeeklyActivityStyle = (style: string): string => {
  const accepted: string[] = [];
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim().toLowerCase();
    if (property === "color" && ALLOWED_COLORS.has(value)) accepted.push(`color:${ALLOWED_COLORS.get(value)}`);
    else if (property === "font-size" && ALLOWED_SIZES.has(value)) accepted.push(`font-size:${value}`);
  }
  return accepted.join(";");
};

const normalizeDerivedText = (text: string): string => {
  let normalized = "";
  for (const character of text) {
    if (character === "\n") normalized += "\n";
    else if (/^[\s\p{Z}]$/u.test(character)) normalized += " ";
    else if (!/^[\p{Cf}\p{Cc}]$/u.test(character)) normalized += character;
  }
  return normalized.replace(/ +/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
};

export const hasWeeklyActivityVisibleBase = (text: string): boolean =>
  Array.from(text).some((character) => !/^[\s\p{Z}\p{M}\p{Cf}\p{Cc}]$/u.test(character));

/** Mirrors the backend's structural text derivation and UTF-16 length semantics. */
export const deriveWeeklyActivityPlainText = (html: string): string => {
  const withoutNonContent = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)(?:\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, "");
  let out = "";
  let cursor = 0;
  const tagPattern = /<\/?([a-z][\w:-]*)(?:\s[^>]*)?\s*\/?>/gi;
  for (let match = tagPattern.exec(withoutNonContent); match; match = tagPattern.exec(withoutNonContent)) {
    out += decodeHtmlEntities(withoutNonContent.slice(cursor, match.index));
    const token = match[0];
    const tag = match[1].toLowerCase();
    const closing = /^<\//.test(token);
    if (!closing && tag === "br") out += "\n";
    else if (!closing && tag === "li") {
      const remainder = withoutNonContent.slice(tagPattern.lastIndex);
      const itemEnd = remainder.search(/<\/li\s*>/i);
      const itemSource = itemEnd < 0 ? remainder : remainder.slice(0, itemEnd);
      const itemText = normalizeDerivedText(decodeHtmlEntities(itemSource.replace(/<[^>]*>/g, "")));
      if (hasWeeklyActivityVisibleBase(itemText)) out += "• ";
    } else if (closing && ["p", "li", "ul", "ol"].includes(tag)) out += "\n";
    cursor = tagPattern.lastIndex;
  }
  out += decodeHtmlEntities(withoutNonContent.slice(cursor));
  return normalizeDerivedText(out);
};

/** Sanitizes API/editor HTML immediately before it reaches an HTML rendering sink. */
export const sanitizeWeeklyActivityHtml = (html: string): string => {
  if (typeof DOMParser === "undefined") return escapeHtml(html);
  try {
    const document = new DOMParser().parseFromString(html, "text/html");
    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      if (!ALLOWED_HTML_TAGS.has(element.tagName)) {
        element.replaceWith(document.createTextNode(element.textContent ?? ""));
        continue;
      }
      const style = element.getAttribute("style") ?? "";
      for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
      const safeStyle = sanitizeWeeklyActivityStyle(style);
      if (safeStyle) element.setAttribute("style", safeStyle);
    }
    return document.body.innerHTML;
  } catch {
    return escapeHtml(html);
  }
};

/**
 * Owns the two field drafts while reusing one editor adapter. The browser
 * wrapper supplies the single Quill instance; this class makes the target
 * transition deterministic and independently testable.
 */
export class SharedEditorSession {
  private currentDrafts: WeeklyActivityDrafts;
  private currentTarget: WeeklyActivityTarget = "thisWeek";

  constructor(
    private readonly editor: SharedEditorAdapter,
    drafts: WeeklyActivityDrafts,
    initialTarget: WeeklyActivityTarget = "thisWeek"
  ) {
    this.currentDrafts = { ...drafts };
    this.currentTarget = initialTarget;
    this.editor.setSemanticHTML(this.htmlFor(initialTarget));
  }

  get activeTarget(): WeeklyActivityTarget {
    return this.currentTarget;
  }

  get drafts(): WeeklyActivityDrafts {
    return { ...this.currentDrafts };
  }

  flush(): WeeklyActivityDrafts {
    this.store(this.currentTarget, this.editor.getSemanticHTML());
    return this.drafts;
  }

  switchTarget(nextTarget: WeeklyActivityTarget): WeeklyActivityDrafts {
    if (nextTarget === this.currentTarget) {
      this.editor.focus();
      return this.drafts;
    }
    this.store(this.currentTarget, this.editor.getSemanticHTML());
    this.currentTarget = nextTarget;
    this.editor.setSemanticHTML(this.htmlFor(nextTarget));
    this.editor.focus();
    return this.drafts;
  }

  replaceDrafts(drafts: WeeklyActivityDrafts, target: WeeklyActivityTarget = this.currentTarget): void {
    this.currentDrafts = { ...drafts };
    this.currentTarget = target;
    this.editor.setSemanticHTML(this.htmlFor(target));
  }

  private htmlFor(target: WeeklyActivityTarget): string {
    return target === "thisWeek" ? this.currentDrafts.thisWeekHtml : this.currentDrafts.nextWeekHtml;
  }

  private store(target: WeeklyActivityTarget, html: string): void {
    this.currentDrafts = target === "thisWeek"
      ? { ...this.currentDrafts, thisWeekHtml: html }
      : { ...this.currentDrafts, nextWeekHtml: html };
  }
}
