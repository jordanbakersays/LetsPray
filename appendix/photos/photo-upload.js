export async function onRequest(context) {
  const { request, env } = context;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") return new Response(null, { headers });

  if (!env.INTERCEDE_R2) {
    return new Response(JSON.stringify({ error: "R2 not bound" }), {
      status: 500, headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  // POST — upload photo
  if (request.method === "POST") {
    const formData = await request.formData();
    const file = formData.get("photo");
    const personId = formData.get("personId");

    if (!file || !personId) {
      return new Response(JSON.stringify({ error: "Missing photo or personId" }), {
        status: 400, headers: { ...headers, "Content-Type": "application/json" }
      });
    }

    const key = `photos/${personId}.jpg`;
    const arrayBuffer = await file.arrayBuffer();

    await env.INTERCEDE_R2.put(key, arrayBuffer, {
      httpMetadata: { contentType: "image/jpeg" },
    });

    // Return the public URL — requires public access enabled on the bucket
    const publicUrl = `${env.R2_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
    return new Response(JSON.stringify({ ok: true, url: publicUrl }), {
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  // DELETE — remove photo
  if (request.method === "DELETE") {
    const { personId } = await request.json();
    if (!personId) {
      return new Response(JSON.stringify({ error: "Missing personId" }), {
        status: 400, headers: { ...headers, "Content-Type": "application/json" }
      });
    }
    await env.INTERCEDE_R2.delete(`photos/${personId}.jpg`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405, headers: { ...headers, "Content-Type": "application/json" }
  });
}
