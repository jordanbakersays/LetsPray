export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers });

  if (!env.INTERCEDE_KV) {
    return new Response(JSON.stringify({ error: "KV namespace not bound" }), { status: 500, headers });
  }

  if (request.method === "GET") {
    const data = await env.INTERCEDE_KV.get("week_history");
    return new Response(data || "[]", { headers });
  }

  if (request.method === "POST") {
    const body = await request.text();
    try {
      const parsed = JSON.parse(body);
      if (!Array.isArray(parsed)) throw new Error("not array");
      // Store up to 52 weeks for streak tracking
      const trimmed = parsed.slice(0, 52);
      await env.INTERCEDE_KV.put("week_history", JSON.stringify(trimmed));
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (_e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
}
