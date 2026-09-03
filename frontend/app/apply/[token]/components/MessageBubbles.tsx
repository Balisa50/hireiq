"use client";

import type { ConversationMessage } from "../types";
import { Mark } from "./icons";

export function AIMessageBubble({ message }: { message: ConversationMessage }) {
  const isTypingDots = !!message.isTyping;
  return (
    <div
      className="flex items-start gap-3"
      dir="ltr"
      data-msg-id={message.id}
      style={{ scrollMarginTop: "72px" }}
    >
      <div className="w-6 h-6 rounded-full bg-white border border-border flex items-center justify-center shrink-0 mt-1">
        {isTypingDots ? (
          <span className="w-1.5 h-4 bg-muted rounded-full animate-pulse inline-block" />
        ) : (
          <Mark className="w-3 h-3 text-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {isTypingDots ? (
          <span className="text-[16px] text-muted animate-pulse"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>_</span>
        ) : (
          <p className="text-[16px] text-ink leading-[1.75] whitespace-pre-wrap"
            style={{ fontFamily: "'Playfair Display', Georgia, serif", textAlign: "left", direction: "ltr" }}>
            {message.content}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Candidate Message ──────────────────────────────────────────────────────────

export function CandidateMessageBubble({ content, showTimestamp, timestamp }: {
  content: string; showTimestamp?: boolean; timestamp: string;
}) {
  const time = new Date(timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex flex-col items-end gap-1" dir="ltr">
      {showTimestamp && (
        <p className="text-[11px]" style={{ color: "#9C9590" }}>{time}</p>
      )}
      <p
        className="text-[15px] text-ink border-r-2 border-[#E8E4DF] pr-3.5 max-w-[85%] leading-relaxed w-fit"
        style={{ textAlign: "left", direction: "ltr" }}
      >
        {content}
      </p>
    </div>
  );
}
