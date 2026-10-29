// Server-side only: imported by app/api/profile/me, never by client components.
// Keep the existing endpoint as the default and the rollback path.
export function usesGoProfileRead(): boolean {
  return process.env.PROFILE_READ_BACKEND === "go";
}

function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function backendURL(): URL {
  const url = new URL(process.env.GO_API_URL ?? "");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.pathname !== "" && url.pathname !== "/") ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && loopback && process.env.NODE_ENV !== "production"))) {
    throw new Error("Invalid backend origin");
  }
  return new URL("/api/profile/me", url);
}

export async function forwardProfileRead(
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let url: URL;
  try { url = backendURL(); }
  catch { return errorResponse(503, "Profile backend is not configured"); }
  try {
    const upstream = await fetcher(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const errors: Record<number, string> = {
      401: "Not authenticated",
      404: "Profile not found",
      503: "Profile temporarily unavailable",
    };
    if (upstream.status !== 200) {
      await upstream.body?.cancel();
      return errorResponse(upstream.status in errors ? upstream.status : 502,
        errors[upstream.status] ?? "Profile backend returned an invalid response");
    }
    if (!upstream.headers.get("content-type")?.includes("application/json")) {
      await upstream.body?.cancel();
      return errorResponse(502, "Profile backend returned an invalid response");
    }
    // A bounded reader avoids buffering an unbounded upstream response.
    const reader = upstream.body?.getReader();
    if (!reader) throw new Error("Missing response body");
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1024 * 1024) throw new Error("Response too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const profile: unknown = JSON.parse(new TextDecoder().decode(body));
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) throw new Error("Invalid response");
    return Response.json(profile, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never log tokens/URLs or retry against the legacy path automatically.
    return errorResponse(503, "Profile temporarily unavailable");
  }
}

export async function forwardAccountRequest(path: string, accessToken?: string, method = "GET", body?: string, fetcher: typeof fetch = fetch): Promise<Response> {
 try {
  const url = new URL(path, backendURL());
  if (!path.startsWith("/api/") || url.origin !== backendURL().origin) throw new Error("Invalid path");
  const upstream = await fetcher(url, {
   method, headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
   body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
  });
  const allowed: Record<number,string> = {400:"Invalid profile or ranking fields",401:"Not authenticated",403:"Access denied",404:"Profile not found",409:"Profile change conflicts with username availability or the 14-day cooldown",503:"Profile service temporarily unavailable"};
  if (upstream.status !== 200 && upstream.status !== 201) { await upstream.body?.cancel(); return errorResponse(upstream.status in allowed ? upstream.status : 502,allowed[upstream.status] ?? "Invalid backend response"); }
  if (!upstream.headers.get("content-type")?.includes("application/json")) throw new Error("Invalid response");
  const reader=upstream.body?.getReader(); if(!reader) throw new Error("Missing body");
  const chunks: Uint8Array[]=[];let size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024)throw new Error("Response too large");chunks.push(value);}}
  finally{await reader.cancel();reader.releaseLock();}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const data:unknown=JSON.parse(new TextDecoder().decode(bytes));
  if(!data || typeof data!=="object" || Array.isArray(data)) throw new Error("Invalid response");
  return Response.json(data,{status:upstream.status,headers:{"Cache-Control":"no-store"}});
 } catch { return errorResponse(503,"Profile service temporarily unavailable"); }
}
