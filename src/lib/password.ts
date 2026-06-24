import bcrypt from "bcryptjs";

// bcryptjs: pure-JS bcrypt, same hashing scheme as the native addon but with
// no native build step (Windows-friendly). Swap for `bcrypt` if you need the
// C++ implementation's throughput.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
