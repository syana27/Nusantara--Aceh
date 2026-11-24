import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { db, UPLOAD_DIR, SEED_DIR } from './db.ts';

// Ephemeral fallback if SESSION_SECRET env var is unset (never stored in files or .env.example)
const RUNTIME_SESSION_SECRET = process.env.SESSION_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
export const SESSION_COOKIE_NAME = 'nusantara_session';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
  isActive: boolean;
}

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

// ============================================================================
// Password Hashing (crypto.scryptSync + timingSafeEqual)
// ============================================================================
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

// ============================================================================
// Signed Session Tokens (HMAC-SHA256)
// ============================================================================
interface TokenPayload {
  uid: string;
  role: 'customer' | 'admin';
  exp: number;
}

export function signSessionToken(uid: string, role: 'customer' | 'admin'): string {
  const payload: TokenPayload = {
    uid,
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = crypto
    .createHmac('sha256', RUNTIME_SESSION_SECRET)
    .update(body)
    .digest('base64url');
  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.uid || !payload.exp || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      out[key] = decodeURIComponent(val);
    }
  }
  return out;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [`${SESSION_COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function extractRequestToken(req: Request): { token: string | null; viaCookie: boolean } {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return { token, viaCookie: false };
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return { token: cookies[SESSION_COOKIE_NAME], viaCookie: true };
  }
  return { token: null, viaCookie: false };
}

function loadUserFromToken(token: string): AuthUser | null {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const row = db
    .prepare('SELECT id, name, email, phone, role, is_active FROM users WHERE id = ?')
    .get(payload.uid) as
    | {
        id: string;
        name: string;
        email: string;
        phone: string;
        role: 'customer' | 'admin';
        is_active: number;
      }
    | undefined;
  if (!row || !row.is_active) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: Boolean(row.is_active),
  };
}

function passesCsrfCheck(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') return true;
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  if (origin && host) {
    try {
      const parsed = new URL(origin);
      return parsed.host === host;
    } catch {
      return false;
    }
  }
  return false;
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const { token } = extractRequestToken(req);
  if (token) {
    const user = loadUserFromToken(token);
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const { token, viaCookie } = extractRequestToken(req);
  if (!token) {
    res.status(401).json({ error: 'Silakan login terlebih dahulu untuk melanjutkan.' });
    return;
  }
  if (viaCookie && !passesCsrfCheck(req)) {
    res.status(403).json({ error: 'Permintaan ditolak oleh validasi keamanan CSRF.' });
    return;
  }
  const user = loadUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sesi login tidak valid atau telah kedaluwarsa.' });
    return;
  }
  req.user = user;
  next();
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Autentikasi diperlukan.' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak. Fitur ini khusus untuk admin terverifikasi.' });
    return;
  }
  next();
}

// ============================================================================
// Security Headers Middleware (iFrame-compatible)
// ============================================================================
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
}

// ============================================================================
// In-Memory Rate Limiter (Brute-force & Spam Guard)
// ============================================================================
interface RateBucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(maxAttempts: number, windowMs: number, message: string) {
  const buckets = new Map<string, RateBucket>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${ip}:${req.path}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (current.count >= maxAttempts) {
      res.status(429).json({ error: message });
      return;
    }
    current.count += 1;
    next();
  };
}

// ============================================================================
// File Validation (Magic Bytes + Path Confinement)
// ============================================================================
export function detectImageMimeType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WEBP: RIFF .... WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function saveValidatedImage(
  buffer: Buffer,
  originalName: string,
  uploadedBy: string,
  purpose: string
): { fileId: string; mimeType: string; sizeBytes: number } {
  const mimeType = detectImageMimeType(buffer);
  if (!mimeType) {
    throw new Error('Format file ditolak. Hanya gambar JPG, PNG, atau WEBP yang valid yang diizinkan.');
  }
  const extMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  const fileId = `file-${crypto.randomUUID()}`;
  const fileName = `${fileId}${extMap[mimeType]}`;
  const targetPath = path.resolve(UPLOAD_DIR, fileName);
  if (!targetPath.startsWith(UPLOAD_DIR + path.sep)) {
    throw new Error('Jalur penyimpanan file tidak valid.');
  }
  fs.writeFileSync(targetPath, buffer);
  const relPath = path.relative(process.cwd(), targetPath);
  const safeOriginal = path.basename(originalName || fileName).slice(0, 120);
  db.prepare(`
    INSERT INTO storage_files (id, original_name, mime_type, size_bytes, storage_path, uploaded_by, purpose, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(fileId, safeOriginal, mimeType, buffer.length, relPath, uploadedBy, purpose, new Date().toISOString());

  return { fileId, mimeType, sizeBytes: buffer.length };
}

export function resolveSafeStoragePath(relPath: string): string | null {
  const resolved = path.resolve(process.cwd(), relPath);
  const inUploads = resolved.startsWith(UPLOAD_DIR + path.sep);
  const inSeed = resolved.startsWith(SEED_DIR + path.sep);
  if (!inUploads && !inSeed) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

export function logAudit(params: {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  ipAddress?: string;
}): void {
  db.prepare(`
    INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, description, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    params.actorUserId,
    params.action,
    params.entityType,
    params.entityId,
    params.description,
    params.ipAddress || '',
    new Date().toISOString()
  );
}
