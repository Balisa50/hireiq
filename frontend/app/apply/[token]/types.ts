/* Shapes shared by the application flow. */

export type Screen = "loading" | "welcome" | "auth" | "conversation" | "review" | "complete" | "error";

export interface ConversationMessage {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: string;
  isTyping?: boolean;
  /**
   * If set, the AI bubble types its content out character-by-character.
   * Cleared (or absent) on bubbles that have already finished animating
   * or were restored from localStorage.
   */
  animate?: boolean;
  /** Optional millisecond delay before the typewriter starts. */
  animateDelayMs?: number;
  action?: "continue" | "request_file" | "request_link" | "complete";
  requirement_id?: string | null;
  requirement_label?: string | null;
  cardStatus?: "idle" | "uploading" | "complete" | "error";
  cardProgress?: number;
  cardFileName?: string;
  cardFileSize?: number;
  cardUrl?: string;
  cardError?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function nanoid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Review helpers ─────────────────────────────────────────────────────────────

export type FieldType = "text" | "email" | "phone" | "date" | "yes_no" | "number" | "currency";

export interface StructuredField {
  /** id used to key edits + locate the source candidate message */
  id:          string;
  /** Visible label on the review screen */
  label:       string;
  /** Detection type, drives validation + rendering */
  type:        FieldType;
  /** Extracted value the candidate gave */
  value:       string;
  /** Whether this field must validate before submit */
  required:    boolean;
  /** Index of the candidate message that produced this value (for editing) */
  sourceIndex: number | null;
}

export interface OpenAnswer {
  id:       string;
  question: string;
  answer:   string;
}
