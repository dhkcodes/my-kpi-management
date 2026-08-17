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
export const WEEKLY_ACTIVITY_COLORS = [
  "#161513", "#C74634", "#7A2E1E", "#8A5B00", "#0B5F66", "#2458A6", "#2E6B3F", "#5F4B8B",
  "#B3261E", "#D45B13", "#C58A00", "#007C91", "#A13E75", "#6E46A5"
] as const;

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#39;");

const ALLOWED_HTML_TAGS = new Set(["P", "BR", "STRONG", "UL", "OL", "LI", "SPAN"]);
const ALLOWED_COLORS = new Map<string, string>([
  ["#161513", "#161513"], ["rgb(22,21,19)", "#161513"],
  ["#c74634", "#C74634"], ["rgb(199,70,52)", "#C74634"],
  ["#7a2e1e", "#7A2E1E"], ["rgb(122,46,30)", "#7A2E1E"],
  ["#8a5b00", "#8A5B00"], ["rgb(138,91,0)", "#8A5B00"],
  ["#0b5f66", "#0B5F66"], ["rgb(11,95,102)", "#0B5F66"],
  ["#2458a6", "#2458A6"], ["rgb(36,88,166)", "#2458A6"],
  ["#2e6b3f", "#2E6B3F"], ["rgb(46,107,63)", "#2E6B3F"],
  ["#5f4b8b", "#5F4B8B"], ["rgb(95,75,139)", "#5F4B8B"],
  ["#b3261e", "#B3261E"], ["rgb(179,38,30)", "#B3261E"],
  ["#d45b13", "#D45B13"], ["rgb(212,91,19)", "#D45B13"],
  ["#c58a00", "#C58A00"], ["rgb(197,138,0)", "#C58A00"],
  ["#007c91", "#007C91"], ["rgb(0,124,145)", "#007C91"],
  ["#a13e75", "#A13E75"], ["rgb(161,62,117)", "#A13E75"],
  ["#6e46a5", "#6E46A5"], ["rgb(110,70,165)", "#6E46A5"]
]);
export const WEEKLY_ACTIVITY_SIZES = ["10px", "12px", "14px", "16px", "18px", "20px", "22px", "24px", "26px", "28px", "30px"] as const;
const ALLOWED_SIZES = new Set<string>(WEEKLY_ACTIVITY_SIZES);

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
    const normalizedValue = property === "color" ? value.replace(/\s+/g, "") : value;
    if (property === "color" && ALLOWED_COLORS.has(normalizedValue)) accepted.push(`color:${ALLOWED_COLORS.get(normalizedValue)}`);
    else if (property === "font-size" && ALLOWED_SIZES.has(value)) accepted.push(`font-size:${value}`);
  }
  return accepted.join(";");
};

/**
 * Native list markers inherit from the LI, while Quill writes inline formats
 * on the leading SPAN. Promote only the existing color/size allow-list so the
 * persisted marker and its first text run render consistently.
 */
export const promoteWeeklyActivityListMarkerStyles = (html: string): string =>
  html.replace(/<li([^>]*)>([\s\S]*?)<\/li>/gi, (_match, rawAttributes: string, body: string) => {
    const existingStyle = rawAttributes.match(/\sstyle=(?:"([^"]*)"|'([^']*)')/i);
    const leadingStyle = body.match(/\sstyle=(?:"([^"]*)"|'([^']*)')/i);
    const safeStyle = sanitizeWeeklyActivityStyle(
      `${existingStyle?.[1] ?? existingStyle?.[2] ?? ""};${leadingStyle?.[1] ?? leadingStyle?.[2] ?? ""}`
    );
    const attributes = rawAttributes.replace(/\sstyle=(?:"[^"]*"|'[^']*')/gi, "");
    return `<li${attributes}${safeStyle ? ` style="${safeStyle}"` : ""}>${body}</li>`;
  });

const formattingTokens = (html: string): ReadonlySet<string> => {
  const tokens = new Set<string>();
  for (const match of html.matchAll(/\sstyle=(?:"([^"]*)"|'([^']*)')/gi)) {
    for (const declaration of sanitizeWeeklyActivityStyle(match[1] ?? match[2] ?? "").split(";")) {
      if (declaration) tokens.add(declaration);
    }
  }
  return tokens;
};

/** Detects a stale Backend that silently removed an allowed format. */
export const hasWeeklyActivityFormattingParity = (requestedHtml: string, savedHtml: string): boolean => {
  const requestedTokens = formattingTokens(requestedHtml);
  const savedTokens = formattingTokens(savedHtml);
  if (Array.from(requestedTokens).some((token) => !savedTokens.has(token))) return false;
  for (const tag of ["ol", "ul", "li"] as const) {
    const requestedCount = (requestedHtml.match(new RegExp(`<${tag}(?:\\s|>)`, "gi")) ?? []).length;
    const savedCount = (savedHtml.match(new RegExp(`<${tag}(?:\\s|>)`, "gi")) ?? []).length;
    if (savedCount < requestedCount) return false;
  }
  return true;
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
