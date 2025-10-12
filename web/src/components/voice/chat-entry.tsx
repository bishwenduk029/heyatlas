import * as React from "react";
import type {
  MessageFormatter,
  ReceivedChatMessage,
} from "@livekit/components-react";
import { cn } from "@/lib/utils";

export interface ChatEntryProps extends React.HTMLAttributes<HTMLLIElement> {
  /** The chat massage object to display. */
  entry: ReceivedChatMessage;
  /** Hide sender name. Useful when displaying multiple consecutive chat messages from the same person. */
  hideName?: boolean;
  /** Hide message timestamp. */
  hideTimestamp?: boolean;
  /** An optional formatter for the message body. */
  messageFormatter?: MessageFormatter;
}

const useChatMessage = (
  entry: ReceivedChatMessage,
  messageFormatter?: MessageFormatter
) => {
  const formattedMessage = React.useMemo(() => {
    return messageFormatter ? messageFormatter(entry.message) : entry.message;
  }, [entry.message, messageFormatter]);
  const hasBeenEdited = !!entry.editTimestamp;
  const time = new Date(entry.timestamp);
  const locale =
    typeof navigator !== "undefined" ? navigator.language : "en-US";

  const name =
    entry.from?.name && entry.from.name !== ""
      ? entry.from.name
      : entry.from?.identity;

  return { message: formattedMessage, hasBeenEdited, time, locale, name };
};

export const ChatEntry = ({
  entry,
  messageFormatter,
  hideName,
  hideTimestamp,
  className,
  ...props
}: ChatEntryProps) => {
  const { message, hasBeenEdited, time, locale, name } = useChatMessage(
    entry,
    messageFormatter
  );

  const isUser = entry.from?.isLocal ?? false;
  const messageOrigin = isUser ? "local" : "remote";

  return (
    <li
      data-lk-message-origin={messageOrigin}
      title={time.toLocaleTimeString(locale, { timeStyle: "full" })}
      className={cn(
        "group flex flex-col gap-1",
        isUser ? "items-end" : "items-start",
        className
      )}
      {...props}
    >
      {(!hideTimestamp || !hideName || hasBeenEdited) && (
        <span className={cn(
          "flex items-center gap-2 text-xs",
          isUser ? "flex-row-reverse" : "flex-row"
        )}>
          {!hideName && (
            <strong className={cn(
              "font-medium",
              isUser ? "text-primary" : "text-muted-foreground"
            )}>
              {isUser ? "You" : name || "Assistant"}
            </strong>
          )}

          {!hideTimestamp && (
            <span className="text-muted-foreground/60 font-mono text-[10px] opacity-0 transition-opacity ease-linear group-hover:opacity-100">
              {hasBeenEdited && "*"}
              {time.toLocaleTimeString(locale, { timeStyle: "short" })}
            </span>
          )}
        </span>
      )}

      <span
        className={cn(
          "max-w-[85%] rounded-lg px-4 py-2 text-sm border-sky-100",
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        {message}
      </span>
    </li>
  );
};
