import bcrypt from "bcryptjs";

/** Password hashing — bcryptjs (pure JS, serverless-safe). */

// V17: raised from 10 to 12 to meet the current OWASP baseline for bcrypt.
// Existing 10-round hashes still verify (the cost is encoded in each hash);
// they transparently upgrade the next time the user sets a new password.
const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * A tiny blocklist of the most-abused passwords. It is not a substitute for a
 * breach-corpus check (e.g. HIBP k-anonymity), which is the recommended
 * follow-up, but it cheaply rejects the credentials attackers try first.
 */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "qwerty123",
  "111111111", "letmein123", "welcome123", "admin123", "iloveyou1", "abc12345",
  "1q2w3e4r", "qwertyuiop", "changeme1", "foundly123",
]);

export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 10) return "Password must be at least 10 characters.";
  if (plain.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return "Use at least one letter and one number.";
  }
  if (COMMON_PASSWORDS.has(plain.toLowerCase())) {
    return "That password is too common — please choose a less predictable one.";
  }
  return null;
}
