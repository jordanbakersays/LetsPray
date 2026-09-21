// Calvary Students — Push Notification Worker
// Uses web-push compatible implementation for Cloudflare Workers

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminders(env));
  },
};

async function sendReminders(env) {
  const nowET = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const todayET = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
  });
  const [h, m] = nowET.replace(/\u202f/g, " ").trim().split(":").map(Number);
  const currentTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

  console.log(`Running at ${currentTime} ET on ${todayET}`);

  const indexRaw = await env.INTERCEDE_KV.get("push:index");
  if (!indexRaw) { console.log("No push:index found"); return; }

  const index = JSON.parse(indexRaw);
  console.log(`Found ${index.length} subscription(s)`);

  for (const key of index) {
    const raw = await env.INTERCEDE_KV.get(key);
    if (!raw) { console.log(`No data for key ${key}`); continue; }

    const record = JSON.parse(raw);
    console.log(`Sub: reminderTime=${record.reminderTime} lastSeen=${record.lastSeen}`);

    if (record.lastSeen === todayET) { console.log("Already seen today, skipping"); continue; }

    const preferredTime = record.reminderTime || "09:00";
    if (currentTime !== preferredTime) {
      console.log(`Time mismatch: current=${currentTime} preferred=${preferredTime}`);
      continue;
    }

    console.log("Sending push...");
    try {
      await sendWebPush(
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY,
        "mailto:jordan@cbcjoy.org",
        record.subscription,
        JSON.stringify({ title: "Calvary Students", body: "Time to pray for your students 🙏" })
      );
      console.log("Push sent successfully!");
    } catch (e) {
      console.log(`Push failed: ${e.message}`);
    }
  }
}

// ── Web Push implementation ───────────────────────────────────────────────────

async function sendWebPush(vapidPublicKey, vapidPrivateKey, subject, subscription, payload) {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys.p256dh;
  const auth = subscription.keys.auth;

  const audience = new URL(endpoint).origin;
  const now = Math.floor(Date.now() / 1000);

  // Build VAPID JWT
  const jwtHeader = base64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const jwtPayload = base64url(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject }));
  const sigInput = `${jwtHeader}.${jwtPayload}`;

  const privKeyBytes = decodeBase64url(vapidPrivateKey);
  const privKey = await crypto.subtle.importKey(
    "pkcs8",
    toPkcs8(privKeyBytes),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privKey,
    new TextEncoder().encode(sigInput)
  );

  const jwt = `${sigInput}.${encodeBase64url(new Uint8Array(sig))}`;
  const authHeader = `vapid t=${jwt}, k=${vapidPublicKey}`;

  // Encrypt payload
  const encrypted = await encrypt(payload, p256dh, auth);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "TTL": "86400",
    },
    body: encrypted,
  });

  console.log(`Push response: ${res.status} ${res.statusText}`);
  if (!res.ok && res.status !== 201) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

function toPkcs8(rawKey) {
  // Wrap raw 32-byte P-256 private key in PKCS8 DER
  const prefix = new Uint8Array([
    0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06,
    0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03,
    0x01, 0x07, 0x04, 0x27, 0x30, 0x25, 0x02, 0x01,
    0x01, 0x04, 0x20,
  ]);
  const result = new Uint8Array(prefix.length + rawKey.length);
  result.set(prefix);
  result.set(rawKey, prefix.length);
  return result.buffer;
}

async function encrypt(payloadStr, p256dhB64, authB64) {
  const payload = new TextEncoder().encode(payloadStr);
  const clientPubKey = await crypto.subtle.importKey(
    "raw", decodeBase64url(p256dhB64),
    { name: "ECDH", namedCurve: "P-256" }, false, []
  );
  const authSecret = decodeBase64url(authB64);

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  );
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));
  const sharedBits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey }, serverKeyPair.privateKey, 256
  ));

  const clientPubRaw = decodeBase64url(p256dhB64);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK via HKDF-SHA256
  const prk = await hkdfSha256(authSecret, sharedBits,
    concat(str2u8("WebPush: info\0"), clientPubRaw, serverPubRaw), 32);

  // CEK and nonce
  const cek = await hkdfSha256(salt, prk, str2u8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfSha256(salt, prk, str2u8("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const record = concat(payload, new Uint8Array([2])); // padding delimiter
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record));

  // aes128gcm header: salt(16) + rs(4) + keylen(1) + serverPubKey(65)
  const header = new Uint8Array(16 + 4 + 1 + serverPubRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = serverPubRaw.length;
  header.set(serverPubRaw, 21);

  return concat(header, ciphertext);
}

async function hkdfSha256(salt, ikm, info, len) {
  const saltKey = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, concat(info, new Uint8Array([1]))));
  return okm.slice(0, len);
}

function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.length; }
  return out;
}

function str2u8(s) { return new TextEncoder().encode(s); }
function decodeBase64url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
function encodeBase64url(u8) {
  return btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64url(str) { return encodeBase64url(new TextEncoder().encode(str)); }
