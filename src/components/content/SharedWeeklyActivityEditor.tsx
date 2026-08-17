import { h } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import QuillClass from "quill";
import * as QuillModule from "quill";
import {
  ALLOWED_QUILL_FORMATS,
  sanitizeWeeklyActivityHtml,
  SharedEditorSession,
  WEEKLY_ACTIVITY_COLORS,
  WEEKLY_ACTIVITY_SIZES,
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

const installWeeklyActivityListIcons = (toolbar: HTMLElement) => {
  const namespace = "http://www.w3.org/2000/svg";
  for (const button of Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button.ql-list"))) {
    const ordered = button.value === "ordered";
    const svg = document.createElementNS(namespace, "svg");
    svg.setAttribute("class", "weekly-activity-list-icon");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("aria-hidden", "true");
    for (let row = 0; row < 3; row += 1) {
      const y = 4 + row * 5;
      if (ordered) {
        const number = document.createElementNS(namespace, "text");
        number.setAttribute("x", "1.25");
        number.setAttribute("y", `${y + 1.5}`);
        number.textContent = `${row + 1}`;
        svg.append(number);
      } else {
        const bullet = document.createElementNS(namespace, "circle");
        bullet.setAttribute("cx", "3");
        bullet.setAttribute("cy", `${y}`);
        bullet.setAttribute("r", "1.15");
        svg.append(bullet);
      }
      const line = document.createElementNS(namespace, "path");
      line.setAttribute("d", `M6 ${y}H16`);
      svg.append(line);
    }
    button.replaceChildren(svg);
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
    SizeStyle.whitelist = [...WEEKLY_ACTIVITY_SIZES];
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
    installWeeklyActivityListIcons(toolbarRef.current);
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
          {WEEKLY_ACTIVITY_SIZES.map((size) => <option value={size}>{size}</option>)}
        </select>
        <button type="button" class="ql-bold" aria-label="Bold"></button>
        <select class="ql-color" aria-label="Text color">
          {WEEKLY_ACTIVITY_COLORS.map((color) => <option value={color}></option>)}
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
        <section class="weekly-activity-edit-column weekly-activity-edit-column--inactive" onDblClick={() => selectTarget(inactiveTarget)}>
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
