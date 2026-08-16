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
  initialTarget: WeeklyActivityTarget;
  disabled?: boolean;
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

export function SharedWeeklyActivityEditor({
  drafts,
  initialTarget,
  disabled = false,
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
      },
      focus: () => quill.focus()
    };
    const session = new SharedEditorSession(adapter, drafts, initialTarget);
    quill.on("text-change", (_delta, _old, source) => {
      if (source === "silent") return;
      onDraftsChangeRef.current(session.flush());
    });
    quill.enable(!disabled);
    quillRef.current = quill;
    sessionRef.current = session;

    return () => {
      quill.off("text-change");
      quillRef.current = null;
      sessionRef.current = null;
      editorRef.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    quillRef.current?.enable(!disabled);
  }, [disabled]);

  const selectTarget = (target: WeeklyActivityTarget) => {
    const session = sessionRef.current;
    if (!session || disabled) return;
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
          <option value="#7A2E1E"></option>
          <option value="#0B5F66"></option>
          <option value="#5F4B8B"></option>
        </select>
        <button type="button" class="ql-list" value="bullet" aria-label="Unordered list"></button>
        <button type="button" class="ql-list" value="ordered" aria-label="Ordered list"></button>
        <button type="button" class="ql-undo" aria-label="Undo"><span class="oj-ux-ico-undo" aria-hidden="true"></span></button>
        <button type="button" class="ql-redo" aria-label="Redo"><span class="oj-ux-ico-redo" aria-hidden="true"></span></button>
      </div>

      <div class="weekly-activity-target-selector" role="tablist" aria-label="Weekly activity edit target">
        {(Object.keys(TARGET_LABELS) as WeeklyActivityTarget[]).map((target) => (
          <button
            key={target}
            type="button"
            role="tab"
            aria-selected={activeTarget === target}
            aria-controls="weeklyActivitySharedEditor"
            class={activeTarget === target ? "is-selected" : ""}
            disabled={disabled}
            onClick={() => selectTarget(target)}>
            {TARGET_LABELS[target]}
          </button>
        ))}
      </div>

      <div class="weekly-activity-editor-grid">
        <section class="weekly-activity-active-editor" aria-labelledby="weeklyActivityEditingLabel">
          <h4 id="weeklyActivityEditingLabel">Editing: {TARGET_LABELS[activeTarget]}</h4>
          <div id="weeklyActivitySharedEditor" ref={editorRef}></div>
        </section>
        <section class="weekly-activity-preview" aria-labelledby="weeklyActivityPreviewLabel">
          <h4 id="weeklyActivityPreviewLabel">{TARGET_LABELS[inactiveTarget]} (read only)</h4>
          <div class="weekly-activity-preview__content" dangerouslySetInnerHTML={{ __html: sanitizeWeeklyActivityHtml(inactiveHtml) }}></div>
        </section>
      </div>
    </div>
  );
}
