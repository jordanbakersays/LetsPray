export async function onRequest(context) {
  const { request, env } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!env.INTERCEDE_KV) return new Response(JSON.stringify({ error: "KV not bound" }), { status: 500, headers });
  let body;
  try { body = await request.json(); } catch (_e) { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers }); }
  const { subscription, reminderTime } = body;
  if (!subscription?.endpoint) return new Response(JSON.stringify({ error: "Invalid subscription" }), { status: 400, headers });
  const key = "push:" + btoa(subscription.endpoint).slice(0, 40);
  const record = { subscription, reminderTime: reminderTime || "09:00", lastSeen: null };
  await env.INTERCEDE_KV.put(key, JSON.stringify(record));
  const indexRaw = await env.INTERCEDE_KV.get("push:index");
  const index = indexRaw ? JSON.parse(indexRaw) : [];
  if (!index.includes(key)) { index.push(key); await env.INTERCEDE_KV.put("push:index", JSON.stringify(index)); }
  return new Response(JSON.stringify({ ok: true }), { headers });
}
