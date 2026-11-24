import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'nusantara.db');
export const STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
export const UPLOAD_DIR = path.join(STORAGE_ROOT, 'uploads');
export const SEED_DIR = path.join(STORAGE_ROOT, 'seed');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(SEED_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS storage_files (
      id TEXT PRIMARY KEY,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      uploaded_by TEXT,
      purpose TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'admin')) DEFAULT 'customer',
      avatar_file_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      image_file_id TEXT,
      symbol TEXT NOT NULL DEFAULT '❋',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      motif TEXT NOT NULL,
      material TEXT NOT NULL DEFAULT 'Katun Primisima Batik Tulis & Cap',
      care_instructions TEXT NOT NULL DEFAULT 'Cuci lembut dengan tangan menggunakan deterjen khusus batik, hindari pemutih dan jemur di tempat teduh.',
      price INTEGER NOT NULL CHECK(price >= 0),
      discount_price INTEGER CHECK(discount_price IS NULL OR discount_price >= 0),
      sku TEXT NOT NULL UNIQUE,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      sold_count INTEGER NOT NULL DEFAULT 0 CHECK(sold_count >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);

    CREATE TABLE IF NOT EXISTS product_images (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES storage_files(id),
      alt_text TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);

    CREATE TABLE IF NOT EXISTS product_variants (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT NOT NULL,
      color TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
      price_adjustment INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);

    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_carts_user ON carts(user_id);

    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(cart_id, product_id, variant_id)
    );
    CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items(cart_id);

    CREATE TABLE IF NOT EXISTS addresses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address_line TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK(discount_type IN ('percentage', 'fixed')),
      discount_value INTEGER NOT NULL CHECK(discount_value > 0),
      minimum_purchase INTEGER NOT NULL DEFAULT 0,
      maximum_discount INTEGER,
      usage_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      shipping_address_snapshot TEXT NOT NULL,
      subtotal INTEGER NOT NULL CHECK(subtotal >= 0),
      shipping_cost INTEGER NOT NULL DEFAULT 0 CHECK(shipping_cost >= 0),
      discount_amount INTEGER NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
      coupon_code TEXT,
      total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('Menunggu pembayaran', 'Menunggu verifikasi', 'Dibayar', 'Ditolak', 'Dikembalikan')),
      order_status TEXT NOT NULL CHECK(order_status IN ('Menunggu konfirmasi', 'Menunggu pembayaran', 'Pembayaran diverifikasi', 'Pesanan diproses', 'Pesanan dikirim', 'Pesanan selesai', 'Pesanan dibatalkan')),
      customer_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
      variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
      product_name_snapshot TEXT NOT NULL,
      product_image_snapshot TEXT NOT NULL,
      sku_snapshot TEXT NOT NULL,
      variant_snapshot TEXT NOT NULL,
      unit_price INTEGER NOT NULL CHECK(unit_price >= 0),
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      subtotal INTEGER NOT NULL CHECK(subtotal >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_method TEXT NOT NULL,
      payment_reference TEXT NOT NULL DEFAULT '',
      amount INTEGER NOT NULL CHECK(amount >= 0),
      proof_file_id TEXT REFERENCES storage_files(id),
      payment_status TEXT NOT NULL CHECK(payment_status IN ('Menunggu pembayaran', 'Menunggu verifikasi', 'Dibayar', 'Ditolak', 'Dikembalikan')),
      verified_by TEXT REFERENCES users(id),
      verified_at TEXT,
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      courier_name TEXT NOT NULL DEFAULT '',
      service_name TEXT NOT NULL DEFAULT '',
      tracking_number TEXT NOT NULL DEFAULT '',
      shipping_cost INTEGER NOT NULL DEFAULT 0,
      shipment_status TEXT NOT NULL DEFAULT 'Menunggu pengiriman',
      shipped_at TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      changed_by TEXT REFERENCES users(id),
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      is_verified_purchase INTEGER NOT NULL DEFAULT 1,
      is_published INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, product_id, order_id)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);

    CREATE TABLE IF NOT EXISTS store_settings (
      id TEXT PRIMARY KEY,
      store_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      logo_file_id TEXT REFERENCES storage_files(id),
      banner_file_id TEXT REFERENCES storage_files(id),
      email TEXT NOT NULL,
      instagram TEXT NOT NULL,
      tiktok TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      bank_information TEXT NOT NULL,
      store_address TEXT NOT NULL,
      shipping_policy TEXT NOT NULL,
      return_policy TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      description TEXT NOT NULL,
      ip_address TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      variant_id TEXT REFERENCES product_variants(id) ON DELETE SET NULL,
      delta INTEGER NOT NULL,
      previous_stock INTEGER NOT NULL,
      new_stock INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_id TEXT NOT NULL DEFAULT '',
      actor_user_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
  `);

  seedInitialData();
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function registerSeedFile(id: string, relPath: string, mimeType: string, purpose: string): string {
  const fullPath = path.resolve(process.cwd(), relPath);
  const existing = db.prepare('SELECT id FROM storage_files WHERE id = ?').get(id) as { id: string } | undefined;
  if (existing) return existing.id;
  const stat = fs.existsSync(fullPath) ? fs.statSync(fullPath) : null;
  db.prepare(`
    INSERT INTO storage_files (id, original_name, mime_type, size_bytes, storage_path, uploaded_by, purpose, created_at)
    VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
  `).run(
    id,
    path.basename(fullPath),
    mimeType,
    stat ? stat.size : 0,
    relPath,
    purpose,
    new Date().toISOString()
  );
  return id;
}

function seedInitialData(): void {
  const now = new Date().toISOString();

  const heroFileId = registerSeedFile('seed-hero-nusantara', 'storage/seed/hero-nusantara.jpg', 'image/jpeg', 'banner');

  const existingSettings = db.prepare('SELECT id FROM store_settings WHERE id = ?').get('default');
  if (!existingSettings) {
    db.prepare(`
      INSERT INTO store_settings (
        id, store_name, tagline, logo_file_id, banner_file_id,
        email, instagram, tiktok, whatsapp, bank_information,
        store_address, shipping_policy, return_policy, updated_at
      ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'default',
      'Nusantara',
      'Kerajinan & Batik Aceh untuk Dunia',
      heroFileId,
      'syaharaninajwa01@gmail.com',
      '@syana.lbs',
      '@syana.lbs',
      'BELUM_DIKONFIGURASI',
      'Rekening Bank belum dikonfigurasi oleh admin toko. Hubungi admin sebelum melakukan transfer.',
      'Banda Aceh, Aceh — Indonesia (Alamat lengkap dapat diatur admin)',
      'Pengiriman dilakukan ke seluruh Indonesia dan luar negeri melalui kurir terverifikasi. Ongkos kirim & nomor resi diperbarui admin setelah konfirmasi pesanan.',
      'Pengembalian produk diterima maksimal 3 hari setelah barang tiba dengan video unboxing jika terdapat cacat produksi atau salah kirim motif/ukuran.',
      now
    );
  }

  const existingCategoriesCount = (db.prepare('SELECT COUNT(*) as cnt FROM categories').get() as { cnt: number }).cnt;
  if (existingCategoriesCount === 0) {
    const categories = [
      { id: 'cat-baju', name: 'Baju dan Atasan', slug: 'baju-dan-atasan', description: 'Blouse, tunik, atasan, dan kemeja batik motif khas Aceh.', symbol: '👘', sortOrder: 1 },
      { id: 'cat-rok', name: 'Rok', slug: 'rok', description: 'Rok batik, rok lilit, dan rok maxi bermotif tradisional Aceh.', symbol: '👗', sortOrder: 2 },
      { id: 'cat-dress', name: 'Dress', slug: 'dress', description: 'Dress dan gamis elegan dengan sentuhan motif Pintu Aceh & Bungong Jeumpa.', symbol: '✨', sortOrder: 3 },
      { id: 'cat-kain', name: 'Kain Batik Aceh', slug: 'kain-batik-aceh', description: 'Kain batik panjang dan kain sarung motif Aceh berkualitas.', symbol: '🧵', sortOrder: 4 },
      { id: 'cat-selendang', name: 'Selendang dan Hijab', slug: 'selendang-dan-hijab', description: 'Selendang songket, pashmina, dan hijab motif Aceh.', symbol: '🧣', sortOrder: 5 },
      { id: 'cat-tas', name: 'Tas dan Aksesori', slug: 'tas-dan-aksesori', description: 'Tas sulam kasab Aceh, dompet motif, dan aksesori khas Aceh.', symbol: '👜', sortOrder: 6 },
      { id: 'cat-kerajinan', name: 'Oleh-oleh dan Kerajinan', slug: 'oleh-oleh-dan-kerajinan', description: 'Kupiah Meukutop, kotak perhiasan ukir, dan cinderamata khas Aceh.', symbol: '🎁', sortOrder: 7 },
    ];

    const insertCat = db.prepare(`
      INSERT INTO categories (id, name, slug, description, image_file_id, symbol, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, 1, ?, ?, ?)
    `);
    for (const c of categories) {
      insertCat.run(c.id, c.name, c.slug, c.description, c.symbol, c.sortOrder, now, now);
    }
  }

  const existingProductsCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as { cnt: number }).cnt;
  if (existingProductsCount === 0) {
    const metaPath = path.join(SEED_DIR, 'products-meta.json');
    let rawProducts: Array<{
      name: string;
      category: string;
      price: number;
      old?: number;
      motif: string;
      sizes: string;
      image: string;
      description: string;
      stock: number;
    }> = [];

    if (fs.existsSync(metaPath)) {
      rawProducts = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }

    // Add 2 more products for Tas dan Aksesori + Oleh-oleh dan Kerajinan (total 18 products across all 7 categories)
    rawProducts.push(
      {
        name: 'Tas Sulam Kasab Pintu Aceh',
        category: 'Tas & Aksesori',
        price: 265000,
        old: 310000,
        motif: 'Motif Pintu Aceh',
        sizes: 'All size',
        image: '/storage/seed/product-17.jpg',
        description: 'Ilustrasi contoh tas sulam kasab khas Aceh dengan ornamen geometris emas dan cokelat tua yang elegan.',
        stock: 12,
      },
      {
        name: 'Set Kupiah Meukutop & Kotak Ukir Aceh',
        category: 'Kerajinan',
        price: 325000,
        old: 375000,
        motif: 'Motif Bungong Jeumpa',
        sizes: 'M, L, XL',
        image: '/storage/seed/product-18.jpg',
        description: 'Ilustrasi contoh set cinderamata kerajinan khas Aceh berupa Kupiah Meukutop tenun dan kotak kayu ukir.',
        stock: 10,
      }
    );

    const categoryMap: Record<string, string> = {
      Baju: 'cat-baju',
      Rok: 'cat-rok',
      Dress: 'cat-dress',
      Kain: 'cat-kain',
      Selendang: 'cat-selendang',
      'Tas & Aksesori': 'cat-tas',
      Kerajinan: 'cat-kerajinan',
    };

    const insertProd = db.prepare(`
      INSERT INTO products (
        id, name, slug, description, category_id, motif, material, care_instructions,
        price, discount_price, sku, stock, sold_count, is_active, is_featured, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    const insertImg = db.prepare(`
      INSERT INTO product_images (id, product_id, file_id, alt_text, is_primary, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVar = db.prepare(`
      INSERT INTO product_variants (id, product_id, size, color, sku, stock, price_adjustment, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1)
    `);
    const insertMove = db.prepare(`
      INSERT INTO stock_movements (id, product_id, variant_id, delta, previous_stock, new_stock, reason, reference_id, actor_user_id, created_at)
      VALUES (?, ?, NULL, ?, 0, ?, 'Stok awal produk', 'SEED', NULL, ?)
    `);

    rawProducts.forEach((p, idx) => {
      const num = idx + 1;
      const prodId = `prod-${num}`;
      const catId = categoryMap[p.category] ?? 'cat-baju';
      const sku = `NS-${String(num).padStart(4, '0')}`;
      const slug = `${slugify(p.name)}-${num}`;

      // In original HTML: price was current price, old was original strikethrough price
      const originalPrice = p.old && p.old > p.price ? p.old : p.price;
      const discountPrice = p.old && p.old > p.price ? p.price : null;

      const sizeList = p.sizes.split(',').map((s) => s.trim()).filter(Boolean);
      const totalStock = p.stock || 15;
      const soldCount = (num * 3) % 19; // varied realistic baseline ordering
      const isFeatured = num <= 6 || num >= 17 ? 1 : 0;

      insertProd.run(
        prodId,
        p.name,
        slug,
        p.description,
        catId,
        p.motif,
        p.category === 'Tas & Aksesori'
          ? 'Kanvas Tenun & Sulam Benang Emas Kasab'
          : p.category === 'Kerajinan'
          ? 'Tenun Tradisional & Kayu Ukir Finishing Alami'
          : 'Katun Primisima Batik Khas Aceh',
        p.category === 'Tas & Aksesori' || p.category === 'Kerajinan'
          ? 'Simpan di tempat kering dan bersihkan permukaan dengan kain lembut kering.'
          : 'Cuci lembut secara terpisah, gunakan sabun khusus batik, dan hindari sinar matahari langsung.',
        originalPrice,
        discountPrice,
        sku,
        totalStock,
        soldCount,
        isFeatured,
        now,
        now
      );

      // Register primary & 2 gallery images using extracted seed files
      const primaryRel = `storage/seed/product-${num}.jpg`;
      const primaryFileId = registerSeedFile(`seed-prod-${num}-1`, primaryRel, 'image/jpeg', 'product');
      insertImg.run(`img-${num}-1`, prodId, primaryFileId, `${p.name} — Tampak Utama`, 1, 0, now);

      const altIdx2 = ((num % 16) + 1);
      const altIdx3 = (((num + 3) % 16) + 1);
      const fileId2 = registerSeedFile(`seed-prod-${altIdx2}-1`, `storage/seed/product-${altIdx2}.jpg`, 'image/jpeg', 'product');
      const fileId3 = registerSeedFile(`seed-prod-${altIdx3}-1`, `storage/seed/product-${altIdx3}.jpg`, 'image/jpeg', 'product');
      insertImg.run(`img-${num}-2`, prodId, fileId2, `${p.name} — Detail Motif Aceh`, 0, 1, now);
      insertImg.run(`img-${num}-3`, prodId, fileId3, `${p.name} — Paduan Tekstur`, 0, 2, now);

      // Distribute stock across sizes evenly
      const perSize = Math.max(1, Math.floor(totalStock / Math.max(1, sizeList.length)));
      let remaining = totalStock;
      sizeList.forEach((sz, sIdx) => {
        const isLast = sIdx === sizeList.length - 1;
        const varStock = isLast ? Math.max(0, remaining) : Math.min(remaining, perSize);
        remaining -= varStock;
        const varId = `var-${num}-${sIdx + 1}`;
        const varSku = `${sku}-${slugify(sz).toUpperCase() || 'STD'}`;
        insertVar.run(varId, prodId, sz, 'Cokelat Soga & Emas', varSku, varStock);
      });

      insertMove.run(crypto.randomUUID(), prodId, totalStock, totalStock, now);
    });
  }

  const existingCoupon = db.prepare('SELECT id FROM coupons WHERE code = ?').get('NUSANTARA10');
  if (!existingCoupon) {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO coupons (
        id, code, description, discount_type, discount_value,
        minimum_purchase, maximum_discount, usage_limit, used_count,
        start_at, end_at, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, 'percentage', 10, 200000, 50000, 500, 0, ?, ?, 1, ?, ?)
    `).run(
      'coupon-nusantara10',
      'NUSANTARA10',
      'Potongan 10% (maks. Rp50.000) untuk minimal belanja Rp200.000',
      now,
      nextYear,
      now,
      now
    );
  }
}
