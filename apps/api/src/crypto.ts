const enc = new TextEncoder();
export const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const randomToken = (bytes = 32) =>
  hex(crypto.getRandomValues(new Uint8Array(bytes)));
export async function sha256(value: string) {
  return hex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))),
  );
}
export async function keyedHash(value: string, pepper: string) {
  return sha256(`${pepper}:${value}`);
}
export async function passwordHash(
  password: string,
  salt = randomToken(16),
  iterations = 600_000,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    key,
    256,
  );
  return { salt, iterations, hash: hex(new Uint8Array(bits)) };
}
export async function verifyPassword(
  password: string,
  salt: string,
  iterations: number,
  expected: string,
) {
  const result = await passwordHash(password, salt, iterations);
  return timingEqual(result.hash, expected);
}
export function timingEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
export async function verifyTelegramInitData(
  data: string,
  botToken: string,
  maxAge = 3600,
) {
  const params = new URLSearchParams(data),
    hash = params.get("hash"),
    authDate = Number(params.get("auth_date"));
  if (
    !hash ||
    !Number.isInteger(authDate) ||
    Math.abs(Date.now() / 1000 - authDate) > maxAge
  )
    return null;
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const secretBytes = await crypto.subtle.sign(
    "HMAC",
    secret,
    enc.encode(botToken),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const actual = hex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(check))),
  );
  if (!timingEqual(actual, hash)) return null;
  try {
    const user = JSON.parse(params.get("user") || "{}");
    return typeof user.id === "number" && Number.isSafeInteger(user.id)
      ? user.id
      : null;
  } catch {
    return null;
  }
}
