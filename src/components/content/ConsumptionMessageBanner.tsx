import { h } from "preact";
import { AppMessageBanner } from "./AppMessageBanner";
import type { AppMessage } from "./AppMessageBanner";

export type ConsumptionMessage = AppMessage;

export function ConsumptionMessageBanner({
  messages,
  onClose,
  placement = "floating",
  onRetry,
  retryDisabled = false
}: Readonly<{
  messages: readonly ConsumptionMessage[];
  onClose?: (messageId: string) => void;
  placement?: "floating" | "inline";
  onRetry?: () => void;
  retryDisabled?: boolean;
}>) {
  return <AppMessageBanner messages={messages} onClose={onClose} ariaLabel="Consumption notifications"
    placement={placement} onRetry={onRetry} retryDisabled={retryDisabled} />;
}
