import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.ts';
import {
  type AuthedRequest,
  clearSessionCookie,
  createRateLimiter,
  getClientIp,
  hashPassword,
  logAudit,
  optionalAuth,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
} from '../security.ts';

const router = Router();

const authLimiter = createRateLimiter(
  15,
  15 * 60 * 1000,
  'Terlalu banyak percobaan autentikasi. Silakan coba lagi dalam 15 menit.'
);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80, 'Nama maksimal 80 karakter'),
  email: z.string().trim().email('Format email tidak valid').max(120),
  phone: z.string().trim().max(30).optional().default(''),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter').max(128),
});

const loginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid').max(120),
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
});

const bootstrapSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  email: z.string().trim().email('Format email tidak valid').max(120),
  phone: z.string().trim().max(30).optional().default(''),
  password: z.string().min(10, 'Kata sandi admin minimal 10 karakter').max(128),
  bootstrapSecret: z.string().optional().default(''),
});

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(80),
  phone: z.string().trim().max(30),
});

const addressSchema = z.object({
  recipientName: z.string().trim().min(2, 'Nama penerima wajib diisi').max(80),
  phone: z.string().trim().min(8, 'Nomor WhatsApp tidak valid').max(30),
  addressLine: z.string().trim().min(5, 'Alamat lengkap wajib diisi').max(300),
  province: z.string().trim().min(2, 'Provinsi wajib diisi').max(80),
  city: z.string().trim().min(2, 'Kota/Kabupaten wajib diisi').max(80),
  district: z.string().trim().min(2, 'Kecamatan wajib diisi').max(80),
  postalCode: z.string().trim().min(4, 'Kode pos wajib diisi').max(12),
  isDefault: z.boolean().optional().default(false),
});

function hasConfiguredAdmin(): boolean {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number };
  return row.cnt > 0;
}

router.get('/auth/me', optionalAuth, (req: AuthedRequest, res) => {
  res.json({
    user: req.user ?? null,
    hasAdmin: hasConfiguredAdmin(),
    requiresBootstrapSecret: Boolean(process.env.ADMIN_BOOTSTRAP_SECRET?.trim()),
  });
});

router.post('/auth/register', authLimiter, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data pendaftaran tidak valid.' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk dengan akun Anda.' });
    return;
  }

  const now = new Date().toISOString();
  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = hashPassword(parsed.data.password);

  db.exec('BEGIN IMMEDIATE');
  try {
    // Strictly assign role = 'customer' — public registration can NEVER create admin
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'customer', 1, ?, ?)
    `).run(userId, parsed.data.name, email, parsed.data.phone, passwordHash, now, now);

    db.prepare(`
      INSERT INTO carts (id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(`cart-${crypto.randomUUID()}`, userId, now, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const token = signSessionToken(userId, 'customer');
  setSessionCookie(req, res, token);

  res.status(201).json({
    token,
    user: {
      id: userId,
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      role: 'customer',
      isActive: true,
    },
  });
});

router.post('/auth/login', authLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data login tidak valid.' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const row = db
    .prepare(
      'SELECT id, name, email, phone, password_hash, role, is_active, failed_login_attempts, locked_until FROM users WHERE email = ?'
    )
    .get(email) as
    | {
        id: string;
        name: string;
        email: string;
        phone: string;
        password_hash: string;
        role: 'customer' | 'admin';
        is_active: number;
        failed_login_attempts: number;
        locked_until: string | null;
      }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Email atau kata sandi salah.' });
    return;
  }

  if (!row.is_active) {
    res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan oleh admin.' });
    return;
  }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    res.status(429).json({
      error: 'Akun terkunci sementara karena beberapa kali gagal login. Coba lagi dalam 5 menit.',
    });
    return;
  }

  if (!verifyPassword(parsed.data.password, row.password_hash)) {
    const attempts = row.failed_login_attempts + 1;
    const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null;
    db.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?').run(
      attempts,
      lockedUntil,
      new Date().toISOString(),
      row.id
    );
    res.status(401).json({ error: 'Email atau kata sandi salah.' });
    return;
  }

  db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.id
  );

  if (row.role === 'admin') {
    logAudit({
      actorUserId: row.id,
      action: 'ADMIN_LOGIN',
      entityType: 'user',
      entityId: row.id,
      description: `Admin ${row.email} berhasil masuk ke sistem.`,
      ipAddress: getClientIp(req),
    });
  }

  const token = signSessionToken(row.id, row.role);
  setSessionCookie(req, res, token);

  res.json({
    token,
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isActive: Boolean(row.is_active),
    },
  });
});

router.post('/auth/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

// One-time secure first-admin setup (locks permanently once any admin exists)
router.post('/admin/bootstrap', authLimiter, (req, res) => {
  const envSecret = process.env.ADMIN_BOOTSTRAP_SECRET?.trim();
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data konfigurasi admin tidak valid.' });
    return;
  }

  if (envSecret) {
    const provided = Buffer.from(parsed.data.bootstrapSecret || '', 'utf8');
    const expected = Buffer.from(envSecret, 'utf8');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      res.status(403).json({ error: 'Kode rahasia bootstrap admin tidak valid.' });
      return;
    }
  }

  const email = parsed.data.email.toLowerCase();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(parsed.data.password);
  let adminId = '';

  db.exec('BEGIN IMMEDIATE');
  try {
    const adminCnt = (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get() as { cnt: number }).cnt;
    if (adminCnt > 0) {
      db.exec('ROLLBACK');
      res.status(403).json({ error: 'Admin utama sudah dikonfigurasi. Pendaftaran admin publik terkunci.' });
      return;
    }

    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined;
    if (existingUser) {
      db.exec('ROLLBACK');
      res.status(409).json({ error: 'Email tersebut sudah terdaftar sebagai pelanggan. Gunakan email khusus admin.' });
      return;
    }

    adminId = `adm-${crypto.randomUUID()}`;
    db.prepare(`
      INSERT INTO users (id, name, email, phone, password_hash, role, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, ?)
    `).run(adminId, parsed.data.name, email, parsed.data.phone, passwordHash, now, now);

    db.prepare(`
      INSERT INTO carts (id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(`cart-${crypto.randomUUID()}`, adminId, now, now);

    db.prepare(`
      INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, description, ip_address, created_at)
      VALUES (?, ?, 'ADMIN_BOOTSTRAP', 'user', ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      adminId,
      adminId,
      `Akun admin perdana ${email} diaktifkan.`,
      getClientIp(req),
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const token = signSessionToken(adminId, 'admin');
  setSessionCookie(req, res, token);

  res.status(201).json({
    token,
    user: {
      id: adminId,
      name: parsed.data.name,
      email,
      phone: parsed.data.phone,
      role: 'admin',
      isActive: true,
    },
  });
});

// Customer Profile & Addresses (strictly scoped to req.user.id)
router.patch('/account/profile', requireAuth, (req: AuthedRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data profil tidak valid.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.name,
    parsed.data.phone,
    now,
    req.user!.id
  );

  res.json({
    user: {
      ...req.user!,
      name: parsed.data.name,
      phone: parsed.data.phone,
    },
  });
});

router.get('/account/addresses', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
    .all(req.user!.id);
  res.json({ addresses: rows });
});

router.post('/account/addresses', requireAuth, (req: AuthedRequest, res) => {
  const parsed = addressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data alamat tidak valid.' });
    return;
  }

  const id = `addr-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    if (parsed.data.isDefault) {
      db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id);
    }
    db.prepare(`
      INSERT INTO addresses (id, user_id, recipient_name, phone, address_line, province, city, district, postal_code, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.user!.id,
      parsed.data.recipientName,
      parsed.data.phone,
      parsed.data.addressLine,
      parsed.data.province,
      parsed.data.city,
      parsed.data.district,
      parsed.data.postalCode,
      parsed.data.isDefault ? 1 : 0,
      now,
      now
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const created = db.prepare('SELECT * FROM addresses WHERE id = ?').get(id);
  res.status(201).json({ address: created });
});

router.delete('/account/addresses/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = db
    .prepare('DELETE FROM addresses WHERE id = ? AND user_id = ?')
    .run(String(req.params.id), req.user!.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Alamat tidak ditemukan.' });
    return;
  }
  res.json({ ok: true });
});

export default router;
