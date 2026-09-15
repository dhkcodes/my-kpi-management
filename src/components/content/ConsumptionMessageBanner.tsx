import { h } from "preact";
import { useMemo } from "preact/hooks";
import ArrayDataProvider = require("ojs/ojarraydataprovider");
import type { MessageBannerItem } from "@oracle/oraclejet-preact/UNSAFE_MessageBanner";
import "oj-c/message-banner";

export type ConsumptionMessage = MessageBannerItem & Readonly<{ id: string }>;

export function ConsumptionMessageBanner({ messages }: Readonly<{ messages: readonly ConsumptionMessage[] }>) {
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

  if (uniqueMessages.length === 0) return null;
  return <div class="consumption-message-region" aria-label="Consumption 안내">
    <oj-c-message-banner data={data} type="section"></oj-c-message-banner>
  </div>;
}
