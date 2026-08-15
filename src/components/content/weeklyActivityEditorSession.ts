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
