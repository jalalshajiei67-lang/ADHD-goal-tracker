// Single-user session: a signed, long-lived cookie. Uses Web Crypto so it also works in the proxy.

export const SESSION_COOKIE = "pp_session";
export const SESSION_DAYS = 180;

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const expires = now + SESSION_DAYS * 86_400_000;
  const payload = `v1.${expires}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [version, expires, sig] = token.split(".");
  if (version !== "v1" || !expires || !sig) return false;
  if (Number(expires) < now) return false;
  return safeEqual(sig, await hmac(`${version}.${expires}`));
}

export function passphraseMatches(input: string): boolean {
  const expected = process.env.APP_PASSPHRASE;
  if (!expected) throw new Error("APP_PASSPHRASE is not set");
  return safeEqual(input, expected);
}
