import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * At-rest encryption for OAuth refresh tokens (AES-256-GCM).
 *
 * Envelope format: `v1.<b64 iv>.<b64 ciphertext>.<b64 auth tag>` — versioned
 * so the scheme can rotate without breaking stored values.
 *
 * Key = SHA-256 of ENCRYPTION_SECRET (preferred) or AUTH_SECRET. The dev
 * fallback keeps zero-config demos working; set a real secret in production
 * or previously encrypted values become undecryptable across deploys.
 */

const FALLBACK_SECRET = "foundly-dev-encryption-set-ENCRYPTION_SECRET-in-production";

function encryptionKey(): Buffer {
  const configured = process.env.ENCRYPTION_SECRET || process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("ENCRYPTION_SECRET or AUTH_SECRET is required in production");
  }
  const secret = configured || FALLBACK_SECRET;
  return createHash("sha256").update(secret).digest();
}

/** Encrypt a secret string into a `v1.` envelope. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${ciphertext.toString("base64")}.${tag.toString("base64")}`;
}

/** Decrypt a `v1.` envelope. Returns null on tampering, wrong key, or bad format. */
export function decryptSecret(envelope: string): string | null {
  try {
    const parts = envelope.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return null;
    const [, ivB64, ctB64, tagB64] = parts;
    if (!ivB64 || !ctB64 || !tagB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  } catch {
    return null;
  }
}
