import type { NextRequest } from "next/server";
import { handleChatHttpRequest } from "@/modules/chat/chat-http-adapter";

export async function POST(request: NextRequest) {
  return handleChatHttpRequest(request);
}
