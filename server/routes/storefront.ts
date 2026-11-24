import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db } from '../db.ts';
import { type AuthedRequest, requireAuth, resolveSafeStoragePath } from '../security.ts';

const router = Router();

const reviewSchema = z.object({
  orderId: z.string().trim().min(1, 'ID pesanan wajib dipilih'),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, 'Ulasan minimal 5 karakter').max(800),
});

router.get('/store/settings', (_req, res) => {
  const row = db.prepare('SELECT * FROM store_settings WHERE id = ?').get('default') as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    res.status(404).json({ error: 'Pengaturan toko tidak ditemukan.' });
    return;
  }
  res.json({
    settings: {
      storeName: row.store_name,
      tagline: row.tagline,
      logoUrl: row.logo_file_id ? `/api/storage/files/${row.logo_file_id}` : null,
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
    },
  });
});

router.get('/categories', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) as product_count
      FROM categories c
      WHERE c.is_active = 1
      ORDER BY c.sort_order ASC, c.name ASC
    `)
    .all() as Array<Record<string, unknown>>;

  res.json({
    categories: rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      symbol: c.symbol,
      imageUrl: c.image_file_id ? `/api/storage/files/${c.image_file_id}` : null,
      sortOrder: c.sort_order,
      productCount: c.product_count,
    })),
  });
});

router.get('/products', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const motif = typeof req.query.motif === 'string' ? req.query.motif.trim() : '';
  const minPrice = Number(req.query.minPrice) || 0;
  const maxPrice = Number(req.query.maxPrice) || 0;
  const inStock = req.query.inStock === 'true';
  const featured = req.query.featured === 'true';
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
  const offset = (page - 1) * limit;

  const where: string[] = ['p.is_active = 1', 'c.is_active = 1'];
  const params: (string | number)[] = [];

  if (q) {
    const like = `%${q}%`;
    where.push(
      '(LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.motif) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(p.sku) LIKE ?)'
    );
    params.push(like, like, like, like, like);
  }

  if (category) {
    where.push('(c.slug = ? OR c.id = ? OR LOWER(c.name) = LOWER(?))');
    params.push(category, category, category);
  }

  if (motif) {
    where.push('LOWER(p.motif) LIKE ?');
    params.push(`%${motif.toLowerCase()}%`);
  }

  if (minPrice > 0) {
    where.push('COALESCE(p.discount_price, p.price) >= ?');
    params.push(minPrice);
  }

  if (maxPrice > 0) {
    where.push('COALESCE(p.discount_price, p.price) <= ?');
    params.push(maxPrice);
  }

  if (inStock) {
    where.push('p.stock > 0');
  }

  if (featured) {
    where.push('p.is_featured = 1');
  }

  const orderMap: Record<string, string> = {
    newest: 'p.created_at DESC, p.rowid DESC',
    bestseller: 'p.sold_count DESC, p.created_at DESC',
    price_asc: 'COALESCE(p.discount_price, p.price) ASC',
    price_desc: 'COALESCE(p.discount_price, p.price) DESC',
    az: 'p.name ASC',
  };
  const orderBy = orderMap[sort] || orderMap.newest;

  const whereSql = where.join(' AND ');

  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM products p JOIN categories c ON p.category_id = c.id WHERE ${whereSql}`)
    .get(...params) as { cnt: number };

  const rows = db
    .prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug,
        (SELECT pi.file_id FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) as primary_file_id
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE ${whereSql}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `)
    .all(...params, limit, offset) as Array<Record<string, unknown>>;

  const getVariants = db.prepare('SELECT id, size, color, sku, stock, price_adjustment FROM product_variants WHERE product_id = ? AND is_active = 1');

  const products = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    categoryId: r.category_id,
    categoryName: r.category_name,
    categorySlug: r.category_slug,
    motif: r.motif,
    material: r.material,
    careInstructions: r.care_instructions,
    price: r.price,
    discountPrice: r.discount_price,
    sku: r.sku,
    stock: r.stock,
    soldCount: r.sold_count,
    isFeatured: Boolean(r.is_featured),
    primaryImageUrl: r.primary_file_id ? `/api/storage/files/${r.primary_file_id}` : null,
    variants: getVariants.all(String(r.id)),
    createdAt: r.created_at,
  }));

  res.json({
    products,
    pagination: {
      page,
      limit,
      total: countRow.cnt,
      totalPages: Math.max(1, Math.ceil(countRow.cnt / limit)),
    },
  });
});

router.get('/products/:slug', (req, res) => {
  const row = db
    .prepare(`
      SELECT p.*, c.name as category_name, c.slug as category_slug
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE (p.slug = ? OR p.id = ?) AND p.is_active = 1
    `)
    .get(String(req.params.slug), String(req.params.slug)) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Produk tidak ditemukan.' });
    return;
  }

  const productId = String(row.id);
  const images = (
    db
      .prepare('SELECT id, file_id, alt_text, is_primary, sort_order FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order ASC')
      .all(productId) as Array<Record<string, unknown>>
  ).map((img) => ({
    id: img.id,
    fileId: img.file_id,
    url: `/api/storage/files/${img.file_id}`,
    altText: img.alt_text,
    isPrimary: Boolean(img.is_primary),
  }));

  const variants = db
    .prepare('SELECT id, size, color, sku, stock, price_adjustment FROM product_variants WHERE product_id = ? AND is_active = 1')
    .all(productId);

  const reviews = db
    .prepare(`
      SELECT r.id, r.rating, r.comment, r.is_verified_purchase, r.created_at, u.name as author_name
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.is_published = 1
      ORDER BY r.created_at DESC
    `)
    .all(productId);

  const related = (
    db
      .prepare(`
        SELECT p.id, p.name, p.slug, p.price, p.discount_price, p.motif, p.stock, c.name as category_name,
          (SELECT pi.file_id FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) as primary_file_id
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.category_id = ? AND p.id != ? AND p.is_active = 1
        ORDER BY p.sold_count DESC
        LIMIT 4
      `)
      .all(String(row.category_id), productId) as Array<Record<string, unknown>>
  ).map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    price: r.price,
    discountPrice: r.discount_price,
    motif: r.motif,
    stock: r.stock,
    categoryName: r.category_name,
    primaryImageUrl: r.primary_file_id ? `/api/storage/files/${r.primary_file_id}` : null,
  }));

  res.json({
    product: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      categoryId: row.category_id,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      motif: row.motif,
      material: row.material,
      careInstructions: row.care_instructions,
      price: row.price,
      discountPrice: row.discount_price,
      sku: row.sku,
      stock: row.stock,
      soldCount: row.sold_count,
      isFeatured: Boolean(row.is_featured),
      primaryImageUrl: images[0]?.url || null,
      images,
      variants,
      reviews,
      related,
    },
  });
});

// Only verified buyers can publish reviews
router.post('/products/:id/reviews', requireAuth, (req: AuthedRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Ulasan tidak valid.' });
    return;
  }

  const productId = String(req.params.id);
  const eligible = db
    .prepare(`
      SELECT o.id
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = ? AND o.user_id = ? AND oi.product_id = ?
        AND (o.order_status = 'Pesanan selesai' OR o.payment_status = 'Dibayar')
      LIMIT 1
    `)
    .get(parsed.data.orderId, req.user!.id, productId) as { id: string } | undefined;

  if (!eligible) {
    res.status(403).json({
      error: 'Ulasan terverifikasi hanya dapat dikirim untuk produk yang sudah Anda beli dan dibayar.',
    });
    return;
  }

  const existing = db
    .prepare('SELECT id FROM reviews WHERE user_id = ? AND product_id = ? AND order_id = ?')
    .get(req.user!.id, productId, parsed.data.orderId);
  if (existing) {
    res.status(409).json({ error: 'Anda sudah memberikan ulasan untuk produk ini pada pesanan tersebut.' });
    return;
  }

  const now = new Date().toISOString();
  const id = `rev-${crypto.randomUUID()}`;
  db.prepare(`
    INSERT INTO reviews (id, user_id, product_id, order_id, rating, comment, is_verified_purchase, is_published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
  `).run(id, req.user!.id, productId, parsed.data.orderId, parsed.data.rating, parsed.data.comment, now, now);

  res.status(201).json({ ok: true, id });
});

router.get('/reviews/featured', (_req, res) => {
  const rows = db
    .prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at, u.name as author_name, p.name as product_name, p.slug as product_slug
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      JOIN products p ON r.product_id = p.id
      WHERE r.is_published = 1 AND r.is_verified_purchase = 1
      ORDER BY r.rating DESC, r.created_at DESC
      LIMIT 6
    `)
    .all();
  res.json({ reviews: rows });
});

router.get('/storage/files/:id', (req, res) => {
  const row = db
    .prepare('SELECT mime_type, storage_path FROM storage_files WHERE id = ?')
    .get(String(req.params.id)) as { mime_type: string; storage_path: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'File tidak ditemukan.' });
    return;
  }

  const safePath = resolveSafeStoragePath(row.storage_path);
  if (!safePath) {
    res.status(404).json({ error: 'File tidak ditemukan di penyimpanan.' });
    return;
  }

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(safePath);
});

export default router;
