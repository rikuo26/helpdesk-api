import { type HttpRequest } from "@azure/functions";

/** CORSヘッダを生成（ALLOWED_ORIGINS で Origin をホワイトリスト制御） */
export function corsHeaders(req: HttpRequest, allowMethods: string): Record<string, string> {
  const origin = req.headers.get("Origin") || req.headers.get("origin") || "";
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);

  const isAllowed = allowed.length > 0 && allowed.includes(origin);

  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  if (allowMethods) headers["Access-Control-Allow-Methods"] = allowMethods;
  if (isAllowed) headers["Access-Control-Allow-Origin"] = origin;

  return headers;
}

/** JSONボディ読取り（fetch互換/フォールバックあり） */
export async function readJson<T = unknown>(req: HttpRequest): Promise<T> {
  try {
    const data = await (req as any).json();
    return data as T;
  } catch {
    // fetch互換じゃない環境向けのフォールバック
    try {
      const text = await (req as any).text?.();
      if (text) return JSON.parse(text) as T;
    } catch {}
  }
  throw new Error("invalid_json");
}
