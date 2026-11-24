import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db.ts';
import {
  type AuthedRequest,
  getClientIp,
  logAudit,
  requireAdmin,
  requireAuth,
  saveValidatedImage,
} from '../security.ts';

const router = Router();

// Enforce authentication and verified admin role across ALL /api/admin/* routes
router.use(requireAuth, requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const productSchema = z.object({
  name: z.string().trim().min(2, 'Nama produk wajib diisi').max(140),
  description: z.string().trim().min(5, 'Deskripsi wajib diisi').max(2000),
  categoryId: z.string().trim().min(1, 'Kategori wajib dipilih'),
  motif: z.string().trim().min(2, 'Motif wajib diisi').max(100),
  material: z.string().trim().max(200).optional().default('Katun Primisima Batik Khas Aceh'),
  careInstructions: z.string().trim().max(400).optional().default('Cuci lembut secara terpisah, hindari pemutih.'),
  price: z.number().int().min(1000, 'Harga minimal Rp1.000'),
  discountPrice: z.number().int().min(0).nullable().optional().default(null),
  sku: z.string().trim().min(2, 'SKU wajib diisi').max(40),
  stock: z.number().int().min(0, 'Stok tidak boleh negatif'),
  isActive: z.boolean().optional().default(true),
  isFeatured: z.boolean().optional().default(false),
  variants: z
    .array(
      z.object({
        id: z.string().optional(),
        size: z.string().trim().min(1).max(30),
        color: z.string().trim().min(1).max(40),
        sku: z.string().trim().min(2).max(50),
        stock: z.number().int().min(0),
        priceAdjustment: z.number().int().optional().default(0),
      })
    )
    .optional()
    .default([]),
  imageFileIds: z.array(z.string().trim().min(1)).optional().default([]),
  primaryFileId: z.string().trim().optional().nullable().default(null),
});

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Nama kategori wajib diisi').max(80),
  description: z.string().trim().max(300).optional().default(''),
  symbol: z.string().trim().max(10).optional().default('❋'),
  sortOrder: z.number().int().min(0).max(999).optional().default(0),
  isActive: z.boolean().optional().default(true),
  imageFileId: z.string().trim().nullable().optional().default(null),
});

const verifyPaymentSchema = z.object({
  decision: z.enum(['Dibayar', 'Ditolak']),
  adminNote: z.string().trim().max(400).optional().default(''),
});

const orderStatusSchema = z.object({
  orderStatus: z.enum([
    'Menunggu konfirmasi',
    'Menunggu pembayaran',
    'Pembayaran diverifikasi',
    'Pesanan diproses',
    'Pesanan dikirim',
    'Pesanan selesai',
    'Pesanan dibatalkan',
  ]),
  note: z.string().trim().max(400).optional().default(''),
  courierName: z.string().trim().max(80).optional(),
  serviceName: z.string().trim().max(80).optional(),
  trackingNumber: z.string().trim().max(100).optional(),
  shippingCost: z.number().int().min(0).optional(),
});

const settingsSchema = z.object({
  storeName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(120),
  instagram: z.string().trim().max(80),
  tiktok: z.string().trim().max(80),
  whatsapp: z.string().trim().max(40),
  bankInformation: z.string().trim().max(500),
  storeAddress: z.string().trim().max(300),
  shippingPolicy: z.string().trim().max(1000),
  returnPolicy: z.string().trim().max(1000),
  logoFileId: z.string().trim().nullable().optional(),
  bannerFileId: z.string().trim().nullable().optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ============================================================================
// Overview Analytics (100% Real DB Aggregations)
// ============================================================================
router.get('/overview', (_req, res) => {
  const stats = {
    totalProducts: (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number }).cnt,
    activeProducts: (db.prepare('SELECT COUNT(*) as cnt FROM products WHERE is_active = 1').get() as { cnt: number }).cnt,
    totalCustomers: (db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'customer'").get() as { cnt: number }).cnt,
    totalOrders: (db.prepare('SELECT COUNT(*) as cnt FROM orders').get() as { cnt: number }).cnt,
    awaitingConfirmation: (
      db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE order_status = 'Menunggu konfirmasi'").get() as { cnt: number }
    ).cnt,
    awaitingPayment: (
      db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE payment_status = 'Menunggu pembayaran' AND order_status != 'Pesanan dibatalkan'").get() as {
        cnt: number;
      }
    ).cnt,
    processingOrders: (
      db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE order_status IN ('Pembayaran diverifikasi', 'Pesanan diproses')").get() as {
        cnt: number;
      }
    ).cnt,
    totalSales: (
      db
        .prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE payment_status = 'Dibayar' AND order_status != 'Pesanan dibatalkan'")
        .get() as { total: number }
    ).total,
  };

  const bestSellers = db
    .prepare(`
      SELECT p.id, p.name, p.sku, p.sold_count, p.stock, COALESCE(p.discount_price, p.price) as effective_price,
        c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      ORDER BY p.sold_count DESC, p.stock ASC
      LIMIT 6
    `)
    .all();

  const dailySales = db
    .prepare(`
      SELECT substr(created_at, 1, 10) as date,
        COUNT(*) as orders,
        COALESCE(SUM(CASE WHEN order_status != 'Pesanan dibatalkan' THEN total_amount ELSE 0 END), 0) as revenue
      FROM orders
      GROUP BY substr(created_at, 1, 10)
      ORDER BY date DESC
      LIMIT 14
    `)
    .all()
    .reverse();

  const monthlySales = db
    .prepare(`
      SELECT substr(created_at, 1, 7) as month,
        COUNT(*) as orders,
        COALESCE(SUM(CASE WHEN order_status != 'Pesanan dibatalkan' THEN total_amount ELSE 0 END), 0) as revenue
      FROM orders
      GROUP BY substr(created_at, 1, 7)
      ORDER BY month DESC
      LIMIT 6
    `)
    .all()
    .reverse();

  const recentActivity = db
    .prepare(`
      SELECT a.*, u.name as actor_name, u.email as actor_email
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 12
    `)
    .all();

  res.json({ stats, bestSellers, dailySales, monthlySales, recentActivity });
});

// ============================================================================
// File Upload (Validated Magic Bytes)
// ============================================================================
router.post('/uploads', upload.single('image'), (req: AuthedRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File gambar wajib dipilih (JPG, PNG, WEBP maks. 5MB).' });
    return;
  }
  const purpose = typeof req.body?.purpose === 'string' ? req.body.purpose.slice(0, 40) : 'product';
  try {
    const saved = saveValidatedImage(req.file.buffer, req.file.originalname, req.user!.id, purpose);
    logAudit({
      actorUserId: req.user!.id,
      action: 'FILE_UPLOAD',
      entityType: 'storage_file',
      entityId: saved.fileId,
      description: `Admin mengunggah gambar (${saved.mimeType}, ${saved.sizeBytes} bytes).`,
      ipAddress: getClientIp(req),
    });
    res.status(201).json({
      fileId: saved.fileId,
      url: `/api/storage/files/${saved.fileId}`,
      mimeType: saved.mimeType,
      sizeBytes: saved.sizeBytes,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal mengunggah gambar.' });
  }
});

// ============================================================================
// Product Management
// ============================================================================
router.get('/products', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT p.*, c.name as category_name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      ORDER BY p.created_at DESC, p.rowid DESC
    `)
    .all() as Array<Record<string, unknown>>;

  const getImgs = db.prepare(
    'SELECT id, file_id, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC'
  );
  const getVars = db.prepare('SELECT * FROM product_variants WHERE product_id = ?');

  res.json({
    products: rows.map((p) => {
      const imgs = (getImgs.all(String(p.id)) as Array<Record<string, unknown>>).map((img) => ({
        id: img.id,
        fileId: img.file_id,
        url: `/api/storage/files/${img.file_id}`,
        altText: img.alt_text,
        isPrimary: Boolean(img.is_primary),
      }));
      return {
        ...p,
        isActive: Boolean(p.is_active),
        isFeatured: Boolean(p.is_featured),
        images: imgs,
        variants: getVars.all(String(p.id)),
      };
    }),
  });
});

router.post('/products', (req: AuthedRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data produk tidak valid.' });
    return;
  }

  const d = parsed.data;
  if (d.discountPrice !== null && d.discountPrice >= d.price) {
    res.status(400).json({ error: 'Harga diskon harus lebih kecil daripada harga normal.' });
    return;
  }

  const now = new Date().toISOString();
  const id = `prod-${crypto.randomUUID()}`;
  const slug = `${slugify(d.name)}-${crypto.randomBytes(2).toString('hex')}`;

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO products (
        id, name, slug, description, category_id, motif, material, care_instructions,
        price, discount_price, sku, stock, sold_count, is_active, is_featured, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      id,
      d.name,
      slug,
      d.description,
      d.categoryId,
      d.motif,
      d.material,
      d.careInstructions,
      d.price,
      d.discountPrice,
      d.sku.toUpperCase(),
      d.stock,
      d.isActive ? 1 : 0,
      d.isFeatured ? 1 : 0,
      now,
      now
    );

    const insertImg = db.prepare(`
      INSERT INTO product_images (id, product_id, file_id, alt_text, is_primary, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    d.imageFileIds.forEach((fid, idx) => {
      const isPrimary = d.primaryFileId ? fid === d.primaryFileId : idx === 0;
      insertImg.run(`img-${crypto.randomUUID()}`, id, fid, d.name, isPrimary ? 1 : 0, idx, now);
    });

    const insertVar = db.prepare(`
      INSERT INTO product_variants (id, product_id, size, color, sku, stock, price_adjustment, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const variants = d.variants.length
      ? d.variants
      : [{ size: 'All size', color: 'Motif Asli', sku: `${d.sku.toUpperCase()}-STD`, stock: d.stock, priceAdjustment: 0 }];

    for (const v of variants) {
      insertVar.run(`var-${crypto.randomUUID()}`, id, v.size, v.color, v.sku.toUpperCase(), v.stock, v.priceAdjustment || 0);
    }

    db.prepare(`
      INSERT INTO stock_movements (id, product_id, variant_id, delta, previous_stock, new_stock, reason, reference_id, actor_user_id, created_at)
      VALUES (?, ?, NULL, ?, 0, ?, 'Penambahan produk baru', ?, ?, ?)
    `).run(crypto.randomUUID(), id, d.stock, d.stock, d.sku.toUpperCase(), req.user!.id, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal menambahkan produk (cek keunikan SKU).' });
    return;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'PRODUCT_CREATE',
    entityType: 'product',
    entityId: id,
    description: `Produk "${d.name}" (SKU ${d.sku.toUpperCase()}, stok ${d.stock}) ditambahkan.`,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ id, slug });
});

router.put('/products/:id', (req: AuthedRequest, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data produk tidak valid.' });
    return;
  }

  const productId = String(req.params.id);
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Produk tidak ditemukan.' });
    return;
  }

  const d = parsed.data;
  if (d.discountPrice !== null && d.discountPrice >= d.price) {
    res.status(400).json({ error: 'Harga diskon harus lebih kecil daripada harga normal.' });
    return;
  }

  const now = new Date().toISOString();
  const prevStock = Number(existing.stock);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE products
      SET name = ?, description = ?, category_id = ?, motif = ?, material = ?, care_instructions = ?,
          price = ?, discount_price = ?, sku = ?, stock = ?, is_active = ?, is_featured = ?, updated_at = ?
      WHERE id = ?
    `).run(
      d.name,
      d.description,
      d.categoryId,
      d.motif,
      d.material,
      d.careInstructions,
      d.price,
      d.discountPrice,
      d.sku.toUpperCase(),
      d.stock,
      d.isActive ? 1 : 0,
      d.isFeatured ? 1 : 0,
      now,
      productId
    );

    if (d.imageFileIds.length > 0) {
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(productId);
      const insertImg = db.prepare(`
        INSERT INTO product_images (id, product_id, file_id, alt_text, is_primary, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      d.imageFileIds.forEach((fid, idx) => {
        const isPrimary = d.primaryFileId ? fid === d.primaryFileId : idx === 0;
        insertImg.run(`img-${crypto.randomUUID()}`, productId, fid, d.name, isPrimary ? 1 : 0, idx, now);
      });
    }

    if (d.variants.length > 0) {
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
      const insertVar = db.prepare(`
        INSERT INTO product_variants (id, product_id, size, color, sku, stock, price_adjustment, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `);
      for (const v of d.variants) {
        insertVar.run(v.id || `var-${crypto.randomUUID()}`, productId, v.size, v.color, v.sku.toUpperCase(), v.stock, v.priceAdjustment || 0);
      }
    }

    if (prevStock !== d.stock) {
      db.prepare(`
        INSERT INTO stock_movements (id, product_id, variant_id, delta, previous_stock, new_stock, reason, reference_id, actor_user_id, created_at)
        VALUES (?, ?, NULL, ?, ?, ?, 'Penyesuaian stok oleh admin', ?, ?, ?)
      `).run(crypto.randomUUID(), productId, d.stock - prevStock, prevStock, d.stock, d.sku.toUpperCase(), req.user!.id, now);
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memperbarui produk.' });
    return;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'PRODUCT_UPDATE',
    entityType: 'product',
    entityId: productId,
    description: `Produk "${d.name}" diperbarui (harga ${d.price}, stok ${prevStock} -> ${d.stock}, aktif=${d.isActive}).`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

router.delete('/products/:id', (req: AuthedRequest, res) => {
  const productId = String(req.params.id);
  const existing = db.prepare('SELECT name FROM products WHERE id = ?').get(productId) as { name: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Produk tidak ditemukan.' });
    return;
  }

  const usedInOrders = db.prepare('SELECT id FROM order_items WHERE product_id = ? LIMIT 1').get(productId);
  if (usedInOrders) {
    // Archive safely instead of hard delete to preserve order integrity
    db.prepare('UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?').run(new Date().toISOString(), productId);
    logAudit({
      actorUserId: req.user!.id,
      action: 'PRODUCT_ARCHIVE',
      entityType: 'product',
      entityId: productId,
      description: `Produk "${existing.name}" diarsipkan (memiliki riwayat transaksi).`,
      ipAddress: getClientIp(req),
    });
    res.json({ archived: true, message: 'Produk diarsipkan karena sudah pernah dipesan pelanggan.' });
    return;
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  logAudit({
    actorUserId: req.user!.id,
    action: 'PRODUCT_DELETE',
    entityType: 'product',
    entityId: productId,
    description: `Produk "${existing.name}" dihapus permanen.`,
    ipAddress: getClientIp(req),
  });
  res.json({ deleted: true });
});

router.get('/stock-movements', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT sm.*, p.name as product_name, p.sku, u.name as actor_name
      FROM stock_movements sm
      JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.actor_user_id = u.id
      ORDER BY sm.created_at DESC
      LIMIT 80
    `)
    .all();
  res.json({ movements: rows });
});

// ============================================================================
// Category Management
// ============================================================================
router.get('/categories', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
      FROM categories c
      ORDER BY c.sort_order ASC, c.name ASC
    `)
    .all() as Array<Record<string, unknown>>;

  res.json({
    categories: rows.map((c) => ({
      ...c,
      isActive: Boolean(c.is_active),
      imageUrl: c.image_file_id ? `/api/storage/files/${c.image_file_id}` : null,
    })),
  });
});

router.post('/categories', (req: AuthedRequest, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data kategori tidak valid.' });
    return;
  }

  const now = new Date().toISOString();
  const id = `cat-${crypto.randomUUID()}`;
  const slug = slugify(parsed.data.name);

  try {
    db.prepare(`
      INSERT INTO categories (id, name, slug, description, image_file_id, symbol, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      parsed.data.name,
      slug,
      parsed.data.description,
      parsed.data.imageFileId,
      parsed.data.symbol,
      parsed.data.isActive ? 1 : 0,
      parsed.data.sortOrder,
      now,
      now
    );
  } catch {
    res.status(409).json({ error: 'Nama atau slug kategori sudah ada.' });
    return;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'CATEGORY_CREATE',
    entityType: 'category',
    entityId: id,
    description: `Kategori "${parsed.data.name}" ditambahkan.`,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ id, slug });
});

router.put('/categories/:id', (req: AuthedRequest, res) => {
  const parsed = categorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data kategori tidak valid.' });
    return;
  }
  const catId = String(req.params.id);
  const now = new Date().toISOString();
  const result = db
    .prepare(`
      UPDATE categories
      SET name = ?, description = ?, image_file_id = ?, symbol = ?, is_active = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `)
    .run(
      parsed.data.name,
      parsed.data.description,
      parsed.data.imageFileId,
      parsed.data.symbol,
      parsed.data.isActive ? 1 : 0,
      parsed.data.sortOrder,
      now,
      catId
    );
  if (result.changes === 0) {
    res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    return;
  }
  logAudit({
    actorUserId: req.user!.id,
    action: 'CATEGORY_UPDATE',
    entityType: 'category',
    entityId: catId,
    description: `Kategori "${parsed.data.name}" diperbarui (aktif=${parsed.data.isActive}).`,
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

router.delete('/categories/:id', (req: AuthedRequest, res) => {
  const catId = String(req.params.id);
  const used = db.prepare('SELECT id FROM products WHERE category_id = ? LIMIT 1').get(catId);
  if (used) {
    res.status(400).json({ error: 'Kategori masih memiliki produk. Nonaktifkan atau pindahkan produk terlebih dahulu.' });
    return;
  }
  const result = db.prepare('DELETE FROM categories WHERE id = ?').run(catId);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    return;
  }
  logAudit({
    actorUserId: req.user!.id,
    action: 'CATEGORY_DELETE',
    entityType: 'category',
    entityId: catId,
    description: `Kategori ${catId} dihapus.`,
    ipAddress: getClientIp(req),
  });
  res.json({ ok: true });
});

// ============================================================================
// Order & Payment Verification Management
// ============================================================================
router.get('/orders', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

  const where: string[] = ['1=1'];
  const params: string[] = [];
  if (status) {
    where.push('order_status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(LOWER(order_number) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_email) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = db
    .prepare(`SELECT * FROM orders WHERE ${where.join(' AND ')} ORDER BY created_at DESC`)
    .all(...params) as Array<Record<string, unknown>>;

  const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const getPay = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1');
  const getShip = db.prepare('SELECT * FROM shipments WHERE order_id = ?');
  const getHist = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC');

  res.json({
    orders: rows.map((o) => {
      const id = String(o.id);
      const pay = getPay.get(id) as Record<string, unknown> | undefined;
      return {
        ...o,
        shippingAddress: JSON.parse(String(o.shipping_address_snapshot)),
        items: getItems.all(id),
        payment: pay
          ? { ...pay, proofUrl: pay.proof_file_id ? `/api/storage/files/${pay.proof_file_id}` : null }
          : null,
        shipment: getShip.get(id),
        history: getHist.all(id),
      };
    }),
  });
});

router.patch('/orders/:id/verify-payment', (req: AuthedRequest, res) => {
  const parsed = verifyPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Keputusan verifikasi pembayaran tidak valid.' });
    return;
  }

  const orderId = String(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined;
  if (!order) {
    res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  const nextOrderStatus = parsed.data.decision === 'Dibayar' ? 'Pembayaran diverifikasi' : 'Menunggu pembayaran';

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE payments
      SET payment_status = ?, verified_by = ?, verified_at = ?, admin_note = ?, updated_at = ?
      WHERE order_id = ?
    `).run(parsed.data.decision, req.user!.id, now, parsed.data.adminNote, now, orderId);

    db.prepare('UPDATE orders SET payment_status = ?, order_status = ?, updated_at = ? WHERE id = ?').run(
      parsed.data.decision,
      nextOrderStatus,
      now,
      orderId
    );

    db.prepare(`
      INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      orderId,
      String(order.order_status),
      nextOrderStatus,
      req.user!.id,
      parsed.data.adminNote || `Pembayaran ditandai sebagai ${parsed.data.decision} oleh admin`,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'PAYMENT_VERIFICATION',
    entityType: 'order',
    entityId: orderId,
    description: `Pembayaran pesanan ${order.order_number} diverifikasi: ${parsed.data.decision}.`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

router.patch('/orders/:id/status', (req: AuthedRequest, res) => {
  const parsed = orderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Status pesanan tidak valid.' });
    return;
  }

  const orderId = String(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown> | undefined;
  if (!order) {
    res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    return;
  }

  const prevStatus = String(order.order_status);
  const nextStatus = parsed.data.orderStatus;
  const now = new Date().toISOString();

  db.exec('BEGIN IMMEDIATE');
  try {
    let shippingCost = Number(order.shipping_cost);
    let totalAmount = Number(order.total_amount);

    if (typeof parsed.data.shippingCost === 'number') {
      shippingCost = parsed.data.shippingCost;
      totalAmount = Math.max(0, Number(order.subtotal) + shippingCost - Number(order.discount_amount));
    }

    let nextPaymentStatus = String(order.payment_status);
    if (nextStatus === 'Pesanan dibatalkan' && prevStatus !== 'Pesanan dibatalkan') {
      // Restore stock atomically only once when transitioning to cancelled
      const items = db
        .prepare('SELECT product_id, variant_id, quantity FROM order_items WHERE order_id = ?')
        .all(orderId) as Array<{ product_id: string | null; variant_id: string | null; quantity: number }>;

      for (const it of items) {
        if (it.variant_id) {
          db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(it.quantity, it.variant_id);
        }
        if (it.product_id) {
          const prod = db.prepare('SELECT stock FROM products WHERE id = ?').get(it.product_id) as { stock: number } | undefined;
          const prevProdStock = prod ? prod.stock : 0;
          db.prepare('UPDATE products SET stock = stock + ?, sold_count = MAX(0, sold_count - ?), updated_at = ? WHERE id = ?').run(
            it.quantity,
            it.quantity,
            now,
            it.product_id
          );
          db.prepare(`
            INSERT INTO stock_movements (id, product_id, variant_id, delta, previous_stock, new_stock, reason, reference_id, actor_user_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'Pengembalian stok pesanan dibatalkan', ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            it.product_id,
            it.variant_id,
            it.quantity,
            prevProdStock,
            prevProdStock + it.quantity,
            String(order.order_number),
            req.user!.id,
            now
          );
        }
      }
      if (nextPaymentStatus === 'Dibayar') {
        nextPaymentStatus = 'Dikembalikan';
        db.prepare("UPDATE payments SET payment_status = 'Dikembalikan', updated_at = ? WHERE order_id = ?").run(now, orderId);
      }
    }

    db.prepare(`
      UPDATE orders
      SET order_status = ?, payment_status = ?, shipping_cost = ?, total_amount = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, nextPaymentStatus, shippingCost, totalAmount, now, orderId);

    if (
      parsed.data.courierName !== undefined ||
      parsed.data.serviceName !== undefined ||
      parsed.data.trackingNumber !== undefined ||
      parsed.data.shippingCost !== undefined
    ) {
      const existingShip = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId) as Record<string, unknown> | undefined;
      const courier = parsed.data.courierName ?? String(existingShip?.courier_name || '');
      const service = parsed.data.serviceName ?? String(existingShip?.service_name || '');
      const tracking = parsed.data.trackingNumber ?? String(existingShip?.tracking_number || '');
      const shipStatus =
        nextStatus === 'Pesanan dikirim'
          ? 'Dalam pengiriman'
          : nextStatus === 'Pesanan selesai'
          ? 'Terkirim'
          : nextStatus === 'Pesanan dibatalkan'
          ? 'Dibatalkan'
          : 'Menunggu pengiriman';

      db.prepare(`
        UPDATE shipments
        SET courier_name = ?, service_name = ?, tracking_number = ?, shipping_cost = ?, shipment_status = ?,
            shipped_at = CASE WHEN ? = 'Pesanan dikirim' AND shipped_at IS NULL THEN ? ELSE shipped_at END,
            delivered_at = CASE WHEN ? = 'Pesanan selesai' AND delivered_at IS NULL THEN ? ELSE delivered_at END,
            updated_at = ?
        WHERE order_id = ?
      `).run(courier, service, tracking, shippingCost, shipStatus, nextStatus, now, nextStatus, now, now, orderId);
    }

    db.prepare(`
      INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      orderId,
      prevStatus,
      nextStatus,
      req.user!.id,
      parsed.data.note || `Status diperbarui dari ${prevStatus} ke ${nextStatus}`,
      now
    );

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'ORDER_STATUS_UPDATE',
    entityType: 'order',
    entityId: orderId,
    description: `Pesanan ${order.order_number}: ${prevStatus} -> ${nextStatus}.`,
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

// ============================================================================
// Customers, Coupons, Store Settings & Audit Logs
// ============================================================================
router.get('/customers', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at,
        COUNT(o.id) as order_count,
        COALESCE(SUM(CASE WHEN o.order_status != 'Pesanan dibatalkan' THEN o.total_amount ELSE 0 END), 0) as total_spent
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `)
    .all();

  res.json({ customers: rows });
});

router.get('/coupons', (_req, res) => {
  const rows = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.json({ coupons: rows });
});

router.post('/coupons', (req: AuthedRequest, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
  const discountType = req.body?.discountType === 'fixed' ? 'fixed' : 'percentage';
  const discountValue = Number(req.body?.discountValue) || 0;
  const minimumPurchase = Number(req.body?.minimumPurchase) || 0;
  const maximumDiscount = req.body?.maximumDiscount ? Number(req.body.maximumDiscount) : null;

  if (!code || code.length < 3 || discountValue <= 0) {
    res.status(400).json({ error: 'Kode kupon dan nilai potongan wajib valid.' });
    return;
  }

  const now = new Date().toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const id = `cpn-${crypto.randomUUID()}`;

  try {
    db.prepare(`
      INSERT INTO coupons (id, code, description, discount_type, discount_value, minimum_purchase, maximum_discount, usage_limit, used_count, start_at, end_at, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1000, 0, ?, ?, 1, ?, ?)
    `).run(id, code, description || `Promo ${code}`, discountType, discountValue, minimumPurchase, maximumDiscount, now, nextYear, now, now);
  } catch {
    res.status(409).json({ error: 'Kode kupon sudah terdaftar.' });
    return;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'COUPON_CREATE',
    entityType: 'coupon',
    entityId: id,
    description: `Kupon ${code} dibuat.`,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ id, code });
});

router.get('/settings', (_req, res) => {
  const row = db.prepare('SELECT * FROM store_settings WHERE id = ?').get('default') as Record<string, unknown> | undefined;
  res.json({
    settings: row
      ? {
          storeName: row.store_name,
          tagline: row.tagline,
          logoFileId: row.logo_file_id,
          logoUrl: row.logo_file_id ? `/api/storage/files/${row.logo_file_id}` : null,
          bannerFileId: row.banner_file_id,
          bannerUrl: row.banner_file_id ? `/api/storage/files/${row.banner_file_id}` : null,
          email: row.email,
          instagram: row.instagram,
          tiktok: row.tiktok,
          whatsapp: row.whatsapp,
          bankInformation: row.bank_information,
          storeAddress: row.store_address,
          shippingPolicy: row.shipping_policy,
          returnPolicy: row.return_policy,
          updatedAt: row.updated_at,
        }
      : null,
  });
});

router.put('/settings', (req: AuthedRequest, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Pengaturan toko tidak valid.' });
    return;
  }

  const d = parsed.data;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE store_settings
    SET store_name = ?, tagline = ?, logo_file_id = COALESCE(?, logo_file_id), banner_file_id = COALESCE(?, banner_file_id),
        email = ?, instagram = ?, tiktok = ?, whatsapp = ?, bank_information = ?,
        store_address = ?, shipping_policy = ?, return_policy = ?, updated_at = ?
    WHERE id = 'default'
  `).run(
    d.storeName,
    d.tagline,
    d.logoFileId ?? null,
    d.bannerFileId ?? null,
    d.email,
    d.instagram,
    d.tiktok,
    d.whatsapp,
    d.bankInformation,
    d.storeAddress,
    d.shippingPolicy,
    d.returnPolicy,
    now
  );

  logAudit({
    actorUserId: req.user!.id,
    action: 'STORE_SETTINGS_UPDATE',
    entityType: 'store_settings',
    entityId: 'default',
    description: 'Pengaturan identitas toko, kontak, dan rekening bank diperbarui.',
    ipAddress: getClientIp(req),
  });

  res.json({ ok: true });
});

router.get('/audit-logs', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT a.*, u.name as actor_name, u.email as actor_email, u.role as actor_role
      FROM audit_logs a
      LEFT JOIN users u ON a.actor_user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 100
    `)
    .all();
  res.json({ logs: rows });
});

export default router;
