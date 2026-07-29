import { POST as storefrontAssistantPost } from "@/app/api/assistant/chat/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = new Headers(request.headers);
  headers.set("origin", new URL(request.url).origin);
  headers.set("sec-fetch-site", "same-origin");
  return storefrontAssistantPost(new Request(request.url, {
    method: "POST",
    headers,
    body: await request.text(),
  }));
}
