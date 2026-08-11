export interface ChatMessage {
  role: "user" | "ai" | "system";
  content: string;
  isLoading?: boolean;
}

export type ViewMode = "chat" | "report" | "dashboard";
