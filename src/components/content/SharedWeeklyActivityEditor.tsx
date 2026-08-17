import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import QuillClass from "quill";
import * as QuillModule from "quill";
import {
  ALLOWED_QUILL_FORMATS,
  sanitizeWeeklyActivityHtml,
  SharedEditorSession,
  WeeklyActivityDrafts,
  WeeklyActivityTarget
} from "./weeklyActivityEditorSession";

export type SharedWeeklyActivityEditorProps = Readonly<{
  drafts: WeeklyActivityDrafts;
  disabled?: boolean;
  initialTarget?: WeeklyActivityTarget;
  registerFlush?: (flush: (() => WeeklyActivityDrafts) | null) => void;
  onDraftsChange: (drafts: WeeklyActivityDrafts) => void;
}>;

const TARGET_LABELS: Record<WeeklyActivityTarget, string> = {
  thisWeek: "This Week",
  nextWeek: "Next Week"
};

// Quill 2's UMD build is a direct AMD export while its declarations
// describe an ES default export. Normalize both shapes for JET RequireJS.
const QuillRuntime: typeof QuillClass =
  (QuillModule as unknown as { default?: typeof QuillClass }).default ??
  (QuillModule as unknown as typeof QuillClass);

const normalizeEditorHtml = (html: string) => html === "<p><br></p>" ? "" : html;

const syncWeeklyActivityListMarkerStyles = (root: HTMLElement) => {
  for (const item of Array.from(root.querySelectorAll<HTMLElement>("li"))) {
    const firstText = Array.from(item.querySelectorAll<HTMLElement>("span, strong"))
      .find((element) => (element.textContent ?? "").trim());
    const style = getComputedStyle(firstText ?? item);
    item.style.setProperty("--weekly-list-marker-color", style.color);
    item.style.setProperty("--weekly-list-marker-size", style.fontSize);
    item.style.setProperty("--weekly-list-marker-weight", style.fontWeight);
  }
};

export function SharedWeeklyActivityEditor({
  drafts,
  disabled = false,
  initialTarget = "thisWeek",
  registerFlush,
  onDraftsChange
}: SharedWeeklyActivityEditorProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<QuillClass | null>(null);
  const sessionRef = useRef<SharedEditorSession | null>(null);
  const onDraftsChangeRef = useRef(onDraftsChange);
  const [activeTarget, setActiveTarget] = useState<WeeklyActivityTarget>(initialTarget);

  onDraftsChangeRef.current = onDraftsChange;

  useEffect(() => {
    if (!toolbarRef.current || !editorRef.current || quillRef.current) return;

    const SizeStyle = QuillRuntime.import("attributors/style/size") as any;
    SizeStyle.whitelist = ["12px", "14px", "16px", "18px", "20px"];
    QuillRuntime.register(SizeStyle, true);

    const quill = new QuillRuntime(editorRef.current, {
      theme: "snow",
      formats: [...ALLOWED_QUILL_FORMATS],
      modules: {
        history: { delay: 500, maxStack: 100, userOnly: true },
        toolbar: {
          container: toolbarRef.current,
          handlers: {
            undo: function (this: { quill: QuillClass }) { this.quill.history.undo(); },
            redo: function (this: { quill: QuillClass }) { this.quill.history.redo(); }
          }
        }
      },
      placeholder: "Enter weekly activities"
    });
    toolbarRef.current.querySelector<HTMLElement>(".ql-color .ql-picker-label")?.setAttribute("aria-label", "Text color");
    toolbarRef.current.querySelector<HTMLElement>(".ql-size .ql-picker-label")?.setAttribute("aria-label", "Text size");
    const adapter = {
      getSemanticHTML: () => normalizeEditorHtml(quill.getSemanticHTML()),
      setSemanticHTML: (html: string) => {
        const delta = quill.clipboard.convert({ html: html || "<p><br></p>" });
        quill.setContents(delta, "silent");
        quill.history.clear();
        syncWeeklyActivityListMarkerStyles(quill.root);
      },
      focus: () => quill.focus()
    };
    const session = new SharedEditorSession(adapter, drafts, initialTarget);
    quill.on("text-change", (_delta, _old, source) => {
      if (source === "silent") return;
      syncWeeklyActivityListMarkerStyles(quill.root);
      onDraftsChangeRef.current(session.flush());
    });
    quill.enable(!disabled);
    quillRef.current = quill;
    sessionRef.current = session;
    registerFlush?.(() => session.flush());

    return () => {
      quill.off("text-change");
      quillRef.current = null;
      sessionRef.current = null;
      registerFlush?.(null);
      editorRef.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    quillRef.current?.enable(!disabled);
  }, [disabled]);

  const selectTarget = (target: WeeklyActivityTarget) => {
    const session = sessionRef.current;
    if (!session || disabled || target === activeTarget) return;
    const nextDrafts = session.switchTarget(target);
    setActiveTarget(target);
    onDraftsChange(nextDrafts);
  };

  const inactiveTarget: WeeklyActivityTarget = activeTarget === "thisWeek" ? "nextWeek" : "thisWeek";
  const inactiveHtml = inactiveTarget === "thisWeek" ? drafts.thisWeekHtml : drafts.nextWeekHtml;

  return (
    <div class="weekly-activity-editor-composition">
      <div ref={toolbarRef} class="weekly-activity-toolbar" role="toolbar" aria-label="Weekly activity rich text formatting">
        <select class="ql-size" aria-label="Text size" defaultValue="14px">
          <option value="12px">12px</option>
          <option value="14px">14px</option>
          <option value="16px">16px</option>
          <option value="18px">18px</option>
          <option value="20px">20px</option>
        </select>
        <button type="button" class="ql-bold" aria-label="Bold"></button>
        <select class="ql-color" aria-label="Text color">
          <option value="#161513"></option>
          <option value="#C74634"></option>
          <option value="#7A2E1E"></option>
          <option value="#8A5B00"></option>
          <option value="#0B5F66"></option>
          <option value="#2458A6"></option>
          <option value="#2E6B3F"></option>
          <option value="#5F4B8B"></option>
        </select>
        <button type="button" class="ql-list" value="bullet" aria-label="Unordered list"></button>
        <button type="button" class="ql-list" value="ordered" aria-label="Ordered list"></button>
        <button type="button" class="ql-undo" aria-label="Undo"><span class="oj-ux-ico-undo" aria-hidden="true"></span></button>
        <button type="button" class="ql-redo" aria-label="Redo"><span class="oj-ux-ico-redo" aria-hidden="true"></span></button>
      </div>

      <div class={`weekly-activity-edit-columns weekly-activity-edit-columns--${activeTarget}`}>
        <section class="weekly-activity-edit-column weekly-activity-edit-column--active" aria-labelledby="weeklyActivityEditingLabel">
          <h4 id="weeklyActivityEditingLabel" class={`weekly-activity-section-label weekly-activity-section-label--${activeTarget === "thisWeek" ? "this-week" : "next-week"}`}>{TARGET_LABELS[activeTarget]}</h4>
          <span class="weekly-activity-edit-column__status">Editing</span>
          <div id="weeklyActivitySharedEditor" ref={editorRef}></div>
        </section>
        <section class="weekly-activity-edit-column weekly-activity-edit-column--inactive">
          <button
            type="button"
            class="weekly-activity-edit-column__select"
            disabled={disabled}
            aria-label={`Select and edit ${TARGET_LABELS[inactiveTarget]}`}
            onClick={() => selectTarget(inactiveTarget)}>
            <span class={`weekly-activity-edit-column__heading weekly-activity-section-label weekly-activity-section-label--${inactiveTarget === "thisWeek" ? "this-week" : "next-week"}`}>{TARGET_LABELS[inactiveTarget]}</span>
            <span class="weekly-activity-edit-column__status">Select and edit</span>
          </button>
          <div class="weekly-activity-preview__content" aria-label={`${TARGET_LABELS[inactiveTarget]} preview`} dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(inactiveHtml) }}></div>
        </section>
      </div>
    </div>
  );
}
