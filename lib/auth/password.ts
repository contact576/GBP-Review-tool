import bcrypt from "bcryptjs";

/** Password hashing — bcryptjs (pure JS, serverless-safe). */

const ROUNDS = 10;

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

export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 8) return "Password must be at least 8 characters.";
  if (plain.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return "Use at least one letter and one number.";
  }
  return null;
}
