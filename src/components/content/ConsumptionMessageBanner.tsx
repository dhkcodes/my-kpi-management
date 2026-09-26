import { h } from "preact";
import { AppMessageBanner } from "./AppMessageBanner";
import type { AppMessage } from "./AppMessageBanner";

export type ConsumptionMessage = AppMessage;

export function ConsumptionMessageBanner({ messages, onClose }: Readonly<{
  messages: readonly ConsumptionMessage[];
  onClose?: (messageId: string) => void;
}>) {
  return <AppMessageBanner messages={messages} onClose={onClose} ariaLabel="Consumption notifications" />;
}
