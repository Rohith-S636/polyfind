import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}
const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AuthPrincipal {
  id: string;
  email: string;
  roles: string[];
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthPrincipal;
}

export class AuthenticationError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code = "UNAUTHORIZED", statusCode = 401) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024,
  }) as Buffer;
  return ["scrypt", SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("hex"), derived.toString("hex")].join("$");
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4] ?? "";
  const hashHex = parts[5] ?? "";
  if (![n, r, p].every(Number.isSafeInteger) || !/^[a-f0-9]{32}$/i.test(saltHex) ||
      !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"), expected.length, {
    N: n, r, p, maxmem: 64 * 1024 * 1024,
  }) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  status: "active" | "disabled" | "locked";
}

interface SessionRoleRow extends RowDataPacket {
  id: string;
  email: string;
  role: string | null;
}

export class SessionAuthService {
  constructor(private readonly pool: Pool, private readonly bootstrapToken?: string) {}

  async bootstrapAdmin(emailInput: string, password: string, suppliedToken: string): Promise<AuthSession> {
    const email = this.validateEmail(emailInput);
    this.validatePassword(password);
    if (!this.bootstrapToken || this.bootstrapToken.length < 32 ||
        !constantTimeEqual(suppliedToken, this.bootstrapToken)) {
      throw new AuthenticationError("Admin bootstrap is unavailable or the bootstrap token is invalid.", "BOOTSTRAP_DENIED", 403);
    }

    const connection = await this.pool.getConnection();
    let userId = "";
    try {
      await connection.beginTransaction();
      const [countRows] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM users FOR UPDATE",
      );
      if (Number(countRows[0]?.["total"] ?? 0) > 0) {
        throw new AuthenticationError("Admin bootstrap has already been completed.", "BOOTSTRAP_CLOSED", 409);
      }
      userId = randomUUID();
      const passwordHash = await hashPassword(password);
      await connection.query("INSERT INTO roles (id, name) VALUES ('role-admin', 'admin'), ('role-customer', 'customer')");
      await connection.query(
        "INSERT INTO users (id, email, password_hash, status) VALUES (?, ?, ?, 'active')",
        [userId, email, passwordHash],
      );
      await connection.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, 'role-admin')", [userId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError("Admin bootstrap could not be completed.", "BOOTSTRAP_FAILED", 409);
    } finally {
      connection.release();
    }
    return this.createSession(userId, email, ["admin"]);
  }

  async login(emailInput: string, password: string): Promise<AuthSession> {
    const email = this.validateEmail(emailInput);
    const [rows] = await this.pool.query<UserRow[]>(
      "SELECT id, email, password_hash, status FROM users WHERE email = ? LIMIT 1",
      [email],
    );
    const user = rows[0];
    if (!user || user.status !== "active" || !(await verifyPassword(password, user.password_hash))) {
      throw new AuthenticationError("Email or password is incorrect.");
    }
    const [roleRows] = await this.pool.query<RowDataPacket[]>(
      "SELECT r.name FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? ORDER BY r.name ASC",
      [user.id],
    );
    return this.createSession(user.id, user.email, roleRows.map((row) => String(row["name"])));
  }

  async authenticate(token: string): Promise<AuthPrincipal | null> {
    if (!token || token.length < 32 || token.length > 256) return null;
    const [rows] = await this.pool.query<SessionRoleRow[]>(
      "SELECT u.id, u.email, r.name AS role FROM sessions s INNER JOIN users u ON u.id = s.user_id LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP(3) AND u.status = 'active' ORDER BY r.name ASC",
      [sha256(token)],
    );
    if (rows.length === 0) return null;
    return {
      id: rows[0]!.id,
      email: rows[0]!.email,
      roles: [...new Set(rows.map((row) => row.role).filter((role): role is string => Boolean(role)))],
    };
  }

  async logout(token: string): Promise<void> {
    if (!token || token.length < 32 || token.length > 256) return;
    await this.pool.query(
      "UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP(3) WHERE token_hash = ? AND revoked_at IS NULL",
      [sha256(token)],
    );
  }

  private async createSession(userId: string, email: string, roles: string[]): Promise<AuthSession> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.pool.query(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      [randomUUID(), userId, sha256(token), expiresAt],
    );
    return { token, expiresAt: expiresAt.toISOString(), user: { id: userId, email, roles } };
  }

  private validateEmail(value: string): string {
    const email = value.trim().toLowerCase();
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AuthenticationError("A valid email address is required.", "INVALID_CREDENTIALS", 400);
    }
    return email;
  }

  private validatePassword(value: string): void {
    if (typeof value !== "string" || value.length < 12 || value.length > 256) {
      throw new AuthenticationError("Password must be between 12 and 256 characters.", "INVALID_CREDENTIALS", 400);
    }
  }
}
