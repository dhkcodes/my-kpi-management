import { h } from "preact";
import { useEffect, useMemo, useRef } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import type { MessageBannerItem } from "@oracle/oraclejet-preact/UNSAFE_MessageBanner";
import "oj-c/message-banner";

export type AppMessage = MessageBannerItem & Readonly<{
  id: string;
  persistence?: "auto" | "sticky";
  autoDismissMs?: number;
}>;

const shouldPersist = (message: AppMessage) =>
  message.persistence === "sticky" || (message.persistence !== "auto" && message.severity === "error");

export function AppMessageBanner({ messages, onClose, ariaLabel = "Application notifications" }: Readonly<{
  messages: readonly AppMessage[];
  onClose?: (messageId: string) => void;
  ariaLabel?: string;
}>) {
  const timersRef = useRef(new Map<string, number>());
  const uniqueMessages = useMemo(() => {
    const seen = new Set<string>();
    return messages.filter((message) => {
      const key = `${message.severity ?? "none"}|${message.summary ?? ""}|${message.detail ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);
  const data = useMemo(() => new ArrayDataProvider([...uniqueMessages], { keyAttributes: "id" }), [uniqueMessages]);

  useEffect(() => {
    const visibleIds = new Set(uniqueMessages.map((message) => message.id));
    timersRef.current.forEach((timer, id) => {
      if (!visibleIds.has(id)) {
        window.clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });
    uniqueMessages.forEach((message) => {
      if (shouldPersist(message) || timersRef.current.has(message.id)) return;
      const timer = window.setTimeout(() => {
        timersRef.current.delete(message.id);
        onClose?.(message.id);
      }, message.autoDismissMs ?? 3000);
      timersRef.current.set(message.id, timer);
    });
  }, [uniqueMessages, onClose]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  if (uniqueMessages.length === 0) return null;
  return <div class="app-message-region" aria-label={ariaLabel}>
    <oj-c-message-banner data={data} type="section"
      onojClose={(event: CustomEvent<{ key: string }>) => onClose?.(String(event.detail.key))}></oj-c-message-banner>
  </div>;
}
