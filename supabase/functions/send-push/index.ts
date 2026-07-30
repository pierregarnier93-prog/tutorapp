import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = "mailto:pierre.garnier93@gmail.com";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - b64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function bytesToBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function signVapidJwt(endpoint: string): Promise<{ auth: string }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = bytesToBase64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToBase64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: VAPID_SUBJECT })));
  const signingInput = `${header}.${payload}`;

  const privBytes = base64urlToBytes(VAPID_PRIVATE);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", privBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const sig = bytesToBase64url(new Uint8Array(sigBuffer));
  const jwt = `${signingInput}.${sig}`;
  return { auth: `vapid t=${jwt},k=${VAPID_PUBLIC}` };
}

async function encryptPayload(subscription: { keys: { p256dh: string; auth: string } }, payload: string): Promise<{ body: Uint8Array; salt: Uint8Array }> {
  const clientPublicKey = base64urlToBytes(subscription.keys.p256dh);
  const clientAuthSecret = base64urlToBytes(subscription.keys.auth);
  const payloadBytes = new TextEncoder().encode(payload);

  // Generate server ECDH key pair
  const serverKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));

  // Import client public key
  const clientKey = await crypto.subtle.importKey("raw", clientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);

  // Derive shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits({ name: "ECDH", public: clientKey }, serverKeyPair.privateKey, 256);
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // Generate salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // HKDF: PRK from shared secret + auth
  async function hkdfExtract(ikm: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
    const key = await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const prk = new Uint8Array(await crypto.subtle.sign("HMAC", key, ikm));
    return crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  }

  async function hkdfExpand(prk: CryptoKey, info: Uint8Array, length: number): Promise<Uint8Array> {
    const result = new Uint8Array(length);
    let t = new Uint8Array(0);
    let offset = 0;
    for (let i = 1; offset < length; i++) {
      const input = new Uint8Array([...t, ...info, i]);
      t = new Uint8Array(await crypto.subtle.sign("HMAC", prk, input));
      result.set(t.slice(0, Math.min(t.length, length - offset)), offset);
      offset += t.length;
    }
    return result;
  }

  // Auth secret
  const authInfo = new TextEncoder().encode("Content-Encoding: auth\0");
  const prkKey = await hkdfExtract(sharedSecret, clientAuthSecret);
  const ikm = await hkdfExpand(prkKey, authInfo, 32);

  // Content encryption key + nonce
  const keyInfo = new Uint8Array([...new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 0x00, ...clientPublicKey, ...serverPublicKeyRaw]);
  const nonceInfo = new Uint8Array([...new TextEncoder().encode("Content-Encoding: nonce\0"), 0x00, ...clientPublicKey, ...serverPublicKeyRaw]);

  const saltKey = await hkdfExtract(ikm, salt);
  const contentKey = await hkdfExpand(saltKey, keyInfo, 16);
  const nonce = await hkdfExpand(saltKey, nonceInfo, 12);

  const aesKey = await crypto.subtle.importKey("raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]);

  // Padding: 1 byte record type (2 = final)
  const paddedPayload = new Uint8Array([...payloadBytes, 2]);

  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedPayload));

  // aes128gcm header: salt(16) + record_size(4) + keyid_len(1) + server_pub(65)
  const recordSize = new DataView(new ArrayBuffer(4));
  recordSize.setUint32(0, 4096, false);

  const body = new Uint8Array([
    ...salt,
    ...new Uint8Array(recordSize.buffer),
    65, // keyid length
    ...serverPublicKeyRaw,
    ...encrypted
  ]);

  return { body, salt };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, title, body: msgBody, url } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("subscription")
      .eq("user_id", userId);

    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title: title || "TutorApp", body: msgBody || "", url: url || "/" });

    const results = await Promise.allSettled(subs.map(async (row) => {
      const sub = typeof row.subscription === "string" ? JSON.parse(row.subscription) : row.subscription;
      const { auth } = await signVapidJwt(sub.endpoint);
      const { body: encBody } = await encryptPayload(sub, payload);

      return fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Authorization": auth,
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          "TTL": "86400",
        },
        body: encBody,
      });
    }));

    const sent = results.filter(r => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
