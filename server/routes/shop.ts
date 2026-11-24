import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { db } from '../db.ts';
import {
  type AuthedRequest,
  getClientIp,
  logAudit,
  requireAuth,
  saveValidatedImage,
} from '../security.ts';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const addToCartSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().nullable().optional().default(null),
  quantity: z.number().int().min(1).max(100),
});

const updateCartSchema = z.object({
  quantity: z.number().int().min(0).max(100),
});

const checkoutSchema = z.object({
  recipientName: z.string().trim().min(2, 'Nama penerima wajib diisi').max(80),
  email: z.string().trim().email('Email tidak valid').max(120),
  phone: z.string().trim().min(8, 'Nomor WhatsApp tidak valid').max(30),
  addressLine: z.string().trim().min(5, 'Alamat lengkap wajib diisi').max(300),
  province: z.string().trim().min(2, 'Provinsi wajib diisi').max(80),
  city: z.string().trim().min(2, 'Kota/Kabupaten wajib diisi').max(80),
  district: z.string().trim().min(2, 'Kecamatan wajib diisi').max(80),
  postalCode: z.string().trim().min(4, 'Kode pos wajib diisi').max(12),
  customerNote: z.string().trim().max(400).optional().default(''),
  couponCode: z.string().trim().max(40).optional().default(''),
  paymentMethod: z.enum(['transfer_manual', 'whatsapp_confirm']).optional().default('transfer_manual'),
  saveAddress: z.boolean().optional().default(false),
});

function ensureUserCartId(userId: string): string {
  const existing = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(userId) as { id: string } | undefined;
  if (existing) return existing.id;
  const id = `cart-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO carts (id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, userId, now, now);
  return id;
}

function getCartSnapshot(userId: string) {
  const cartId = ensureUserCartId(userId);
  const rows = db
    .prepare(`
      SELECT ci.id, ci.product_id, ci.variant_id, ci.quantity,
        p.name as product_name, p.slug as product_slug, p.price, p.discount_price, p.stock as product_stock, p.is_active as product_active, p.motif, p.sku,
        v.size as variant_size, v.color as variant_color, v.stock as variant_stock, v.price_adjustment, v.sku as variant_sku, v.is_active as variant_active,
        (SELECT pi.file_id FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) as primary_file_id
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants v ON ci.variant_id = v.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at DESC
    `)
    .all(cartId) as Array<Record<string, unknown>>;

  let subtotal = 0;
  const items = rows.map((r) => {
    const baseUnit = (r.discount_price as number | null) ?? (r.price as number);
    const adj = (r.price_adjustment as number | null) ?? 0;
    const unitPrice = Math.max(0, baseUnit + adj);
    const availableStock = r.variant_id ? Number(r.variant_stock ?? 0) : Number(r.product_stock ?? 0);
    const qty = Number(r.quantity);
    const lineSubtotal = unitPrice * qty;
    subtotal += lineSubtotal;

    return {
      id: r.id,
      productId: r.product_id,
      variantId: r.variant_id,
      productName: r.product_name,
      productSlug: r.product_slug,
      motif: r.motif,
      sku: r.variant_sku || r.sku,
      variantLabel: r.variant_id ? `${r.variant_size} · ${r.variant_color}` : 'Standar',
      unitPrice,
      originalPrice: Number(r.price) + adj,
      quantity: qty,
      availableStock,
      isAvailable: Boolean(r.product_active) && (!r.variant_id || Boolean(r.variant_active)) && availableStock >= qty,
      subtotal: lineSubtotal,
      imageUrl: r.primary_file_id ? `/api/storage/files/${r.primary_file_id}` : null,
    };
  });

  return { cartId, items, subtotal, totalQuantity: items.reduce((s, x) => s + x.quantity, 0) };
}

function evaluateCoupon(code: string, subtotal: number): { valid: boolean; discount: number; message: string; couponId?: string } {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) return { valid: false, discount: 0, message: 'Kode kupon kosong.' };
  const coupon = db.prepare('SELECT * FROM coupons WHERE UPPER(code) = ?').get(cleanCode) as Record<string, unknown> | undefined;
  if (!coupon || !coupon.is_active) {
    return { valid: false, discount: 0, message: 'Kode kupon tidak ditemukan atau tidak aktif.' };
  }
  const now = Date.now();
  if (new Date(String(coupon.start_at)).getTime() > now || new Date(String(coupon.end_at)).getTime() < now) {
    return { valid: false, discount: 0, message: 'Kode kupon sudah kedaluwarsa atau belum berlaku.' };
  }
  if (coupon.usage_limit !== null && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
    return { valid: false, discount: 0, message: 'Batas pemakaian kupon telah habis.' };
  }
  if (subtotal < Number(coupon.minimum_purchase)) {
    return {
      valid: false,
      discount: 0,
      message: `Minimal belanja Rp${Number(coupon.minimum_purchase).toLocaleString('id-ID')} untuk menggunakan kupon ini.`,
    };
  }
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.floor((subtotal * Number(coupon.discount_value)) / 100);
    if (coupon.maximum_discount !== null) {
      discount = Math.min(discount, Number(coupon.maximum_discount));
    }
  } else {
    discount = Number(coupon.discount_value);
  }
  discount = Math.min(discount, subtotal);
  return {
    valid: true,
    discount,
    couponId: String(coupon.id),
    message: `Kupon ${cleanCode} diterapkan (-Rp${discount.toLocaleString('id-ID')}).`,
  };
}

router.get('/cart', requireAuth, (req: AuthedRequest, res) => {
  res.json(getCartSnapshot(req.user!.id));
});

router.post('/cart/items', requireAuth, (req: AuthedRequest, res) => {
  const parsed = addToCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Permintaan keranjang tidak valid.' });
    return;
  }

  const { productId, quantity } = parsed.data;
  let { variantId } = parsed.data;

  const product = db
    .prepare('SELECT id, stock, is_active FROM products WHERE id = ?')
    .get(productId) as { id: string; stock: number; is_active: number } | undefined;

  if (!product || !product.is_active) {
    res.status(404).json({ error: 'Produk tidak ditemukan atau sudah tidak aktif.' });
    return;
  }

  if (!variantId) {
    const defaultVar = db
      .prepare('SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY stock DESC LIMIT 1')
      .get(productId) as { id: string } | undefined;
    if (defaultVar) variantId = defaultVar.id;
  }

  let availableStock = product.stock;
  if (variantId) {
    const variant = db
      .prepare('SELECT id, stock, is_active FROM product_variants WHERE id = ? AND product_id = ?')
      .get(variantId, productId) as { id: string; stock: number; is_active: number } | undefined;
    if (!variant || !variant.is_active) {
      res.status(400).json({ error: 'Varian produk tidak valid atau tidak aktif.' });
      return;
    }
    availableStock = Math.min(product.stock, variant.stock);
  }

  const cartId = ensureUserCartId(req.user!.id);
  const existingItem = variantId
    ? (db
        .prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id = ?')
        .get(cartId, productId, variantId) as { id: string; quantity: number } | undefined)
    : (db
        .prepare('SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ? AND variant_id IS NULL')
        .get(cartId, productId) as { id: string; quantity: number } | undefined);

  const nextQty = (existingItem?.quantity || 0) + quantity;
  if (nextQty > availableStock) {
    res.status(400).json({ error: `Stok tersedia hanya ${availableStock} unit.` });
    return;
  }

  const now = new Date().toISOString();
  if (existingItem) {
    db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(nextQty, now, existingItem.id);
  } else {
    db.prepare(`
      INSERT INTO cart_items (id, cart_id, product_id, variant_id, quantity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`ci-${crypto.randomUUID()}`, cartId, productId, variantId, quantity, now, now);
  }

  res.json(getCartSnapshot(req.user!.id));
});

router.patch('/cart/items/:itemId', requireAuth, (req: AuthedRequest, res) => {
  const parsed = updateCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Jumlah produk tidak valid.' });
    return;
  }

  const cartId = ensureUserCartId(req.user!.id);
  const item = db
    .prepare(`
      SELECT ci.id, ci.product_id, ci.variant_id, p.stock as product_stock, v.stock as variant_stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN product_variants v ON ci.variant_id = v.id
      WHERE ci.id = ? AND ci.cart_id = ?
    `)
    .get(String(req.params.itemId), cartId) as
    | { id: string; product_id: string; variant_id: string | null; product_stock: number; variant_stock: number | null }
    | undefined;

  if (!item) {
    res.status(404).json({ error: 'Item keranjang tidak ditemukan.' });
    return;
  }

  if (parsed.data.quantity === 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
    res.json(getCartSnapshot(req.user!.id));
    return;
  }

  const maxStock = item.variant_id ? Math.min(item.product_stock, item.variant_stock ?? 0) : item.product_stock;
  if (parsed.data.quantity > maxStock) {
    res.status(400).json({ error: `Jumlah melebihi stok tersedia (${maxStock}).` });
    return;
  }

  db.prepare('UPDATE cart_items SET quantity = ?, updated_at = ? WHERE id = ?').run(
    parsed.data.quantity,
    new Date().toISOString(),
    item.id
  );
  res.json(getCartSnapshot(req.user!.id));
});

router.delete('/cart/items/:itemId', requireAuth, (req: AuthedRequest, res) => {
  const cartId = ensureUserCartId(req.user!.id);
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(String(req.params.itemId), cartId);
  res.json(getCartSnapshot(req.user!.id));
});

router.post('/coupons/validate', requireAuth, (req: AuthedRequest, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  const cart = getCartSnapshot(req.user!.id);
  const result = evaluateCoupon(code, cart.subtotal);
  if (!result.valid) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json(result);
});

router.post('/checkout', requireAuth, (req: AuthedRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Data checkout tidak lengkap.' });
    return;
  }

  const now = new Date().toISOString();
  const orderId = `ord-${crypto.randomUUID()}`;
  const orderNumber = `NS-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;

  const addressSnapshot = JSON.stringify({
    recipientName: parsed.data.recipientName,
    phone: parsed.data.phone,
    addressLine: parsed.data.addressLine,
    province: parsed.data.province,
    city: parsed.data.city,
    district: parsed.data.district,
    postalCode: parsed.data.postalCode,
  });

  db.exec('BEGIN IMMEDIATE');
  try {
    const cartId = ensureUserCartId(req.user!.id);
    const cartRows = db
      .prepare(`
        SELECT ci.id as cart_item_id, ci.product_id, ci.variant_id, ci.quantity,
          p.name as product_name, p.price, p.discount_price, p.stock as product_stock, p.sku as product_sku, p.is_active as product_active,
          v.size as variant_size, v.color as variant_color, v.stock as variant_stock, v.price_adjustment, v.sku as variant_sku, v.is_active as variant_active,
          (SELECT pi.file_id FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order ASC LIMIT 1) as primary_file_id
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        LEFT JOIN product_variants v ON ci.variant_id = v.id
        WHERE ci.cart_id = ?
      `)
      .all(cartId) as Array<Record<string, unknown>>;

    if (cartRows.length === 0) {
      db.exec('ROLLBACK');
      res.status(400).json({ error: 'Keranjang belanja masih kosong.' });
      return;
    }

    let subtotal = 0;
    const preparedItems: Array<{
      productId: string;
      variantId: string | null;
      productNameSnapshot: string;
      productImageSnapshot: string;
      skuSnapshot: string;
      variantSnapshot: string;
      unitPrice: number;
      quantity: number;
      lineSubtotal: number;
      prevProductStock: number;
    }> = [];

    for (const row of cartRows) {
      const qty = Number(row.quantity);
      const productId = String(row.product_id);
      const variantId = row.variant_id ? String(row.variant_id) : null;

      if (!row.product_active || (variantId && !row.variant_active)) {
        throw new Error(`Produk "${row.product_name}" sudah tidak aktif.`);
      }

      if (variantId) {
        const varRes = db
          .prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ? AND stock >= ?')
          .run(qty, variantId, qty);
        if (varRes.changes === 0) {
          throw new Error(`Stok varian untuk "${row.product_name}" tidak mencukupi.`);
        }
      }

      const prodRes = db
        .prepare('UPDATE products SET stock = stock - ?, sold_count = sold_count + ?, updated_at = ? WHERE id = ? AND stock >= ?')
        .run(qty, qty, now, productId, qty);
      if (prodRes.changes === 0) {
        throw new Error(`Stok produk "${row.product_name}" tidak mencukupi.`);
      }

      const basePrice = (row.discount_price as number | null) ?? Number(row.price);
      const adj = Number(row.price_adjustment ?? 0);
      const unitPrice = Math.max(0, basePrice + adj);
      const lineSubtotal = unitPrice * qty;
      subtotal += lineSubtotal;

      preparedItems.push({
        productId,
        variantId,
        productNameSnapshot: String(row.product_name),
        productImageSnapshot: row.primary_file_id ? `/api/storage/files/${row.primary_file_id}` : '',
        skuSnapshot: String(row.variant_sku || row.product_sku),
        variantSnapshot: variantId ? `${row.variant_size} · ${row.variant_color}` : 'Standar',
        unitPrice,
        quantity: qty,
        lineSubtotal,
        prevProductStock: Number(row.product_stock),
      });
    }

    let discountAmount = 0;
    let appliedCoupon: string | null = null;
    if (parsed.data.couponCode) {
      const couponCheck = evaluateCoupon(parsed.data.couponCode, subtotal);
      if (!couponCheck.valid) {
        throw new Error(couponCheck.message);
      }
      discountAmount = couponCheck.discount;
      appliedCoupon = parsed.data.couponCode.trim().toUpperCase();
      db.prepare('UPDATE coupons SET used_count = used_count + 1, updated_at = ? WHERE id = ?').run(
        now,
        couponCheck.couponId!
      );
    }

    // Shipping cost is 0 initially until confirmed/updated by admin or shipping provider
    const shippingCost = 0;
    const totalAmount = Math.max(0, subtotal + shippingCost - discountAmount);

    db.prepare(`
      INSERT INTO orders (
        id, order_number, user_id, customer_name, customer_email, customer_phone,
        shipping_address_snapshot, subtotal, shipping_cost, discount_amount, coupon_code,
        total_amount, payment_status, order_status, customer_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Menunggu pembayaran', 'Menunggu pembayaran', ?, ?, ?)
    `).run(
      orderId,
      orderNumber,
      req.user!.id,
      parsed.data.recipientName,
      parsed.data.email.toLowerCase(),
      parsed.data.phone,
      addressSnapshot,
      subtotal,
      shippingCost,
      discountAmount,
      appliedCoupon,
      totalAmount,
      parsed.data.customerNote,
      now,
      now
    );

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, variant_id, product_name_snapshot,
        product_image_snapshot, sku_snapshot, variant_snapshot, unit_price, quantity, subtotal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMove = db.prepare(`
      INSERT INTO stock_movements (id, product_id, variant_id, delta, previous_stock, new_stock, reason, reference_id, actor_user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of preparedItems) {
      insertItem.run(
        `oi-${crypto.randomUUID()}`,
        orderId,
        it.productId,
        it.variantId,
        it.productNameSnapshot,
        it.productImageSnapshot,
        it.skuSnapshot,
        it.variantSnapshot,
        it.unitPrice,
        it.quantity,
        it.lineSubtotal
      );
      insertMove.run(
        crypto.randomUUID(),
        it.productId,
        it.variantId,
        -it.quantity,
        it.prevProductStock,
        it.prevProductStock - it.quantity,
        'Reservasi checkout pesanan',
        orderNumber,
        req.user!.id,
        now
      );
    }

    db.prepare(`
      INSERT INTO payments (id, order_id, payment_method, payment_reference, amount, payment_status, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, 'Menunggu pembayaran', ?, ?)
    `).run(`pay-${crypto.randomUUID()}`, orderId, parsed.data.paymentMethod, totalAmount, now, now);

    db.prepare(`
      INSERT INTO shipments (id, order_id, courier_name, service_name, tracking_number, shipping_cost, shipment_status, created_at, updated_at)
      VALUES (?, ?, '', '', '', 0, 'Menunggu konfirmasi pengiriman', ?, ?)
    `).run(`shp-${crypto.randomUUID()}`, orderId, now, now);

    db.prepare(`
      INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, NULL, 'Menunggu pembayaran', ?, 'Pesanan dibuat oleh pelanggan', ?)
    `).run(crypto.randomUUID(), orderId, req.user!.id, now);

    if (parsed.data.saveAddress) {
      db.prepare(`
        INSERT INTO addresses (id, user_id, recipient_name, phone, address_line, province, city, district, postal_code, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        `addr-${crypto.randomUUID()}`,
        req.user!.id,
        parsed.data.recipientName,
        parsed.data.phone,
        parsed.data.addressLine,
        parsed.data.province,
        parsed.data.city,
        parsed.data.district,
        parsed.data.postalCode,
        now,
        now
      );
    }

    db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cartId);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: err instanceof Error ? err.message : 'Checkout gagal diproses.' });
    return;
  }

  logAudit({
    actorUserId: req.user!.id,
    action: 'ORDER_CREATED',
    entityType: 'order',
    entityId: orderId,
    description: `Pesanan baru ${orderNumber} dibuat oleh ${req.user!.email}.`,
    ipAddress: getClientIp(req),
  });

  res.status(201).json({ orderNumber, orderId });
});

function buildOrderDetail(orderRow: Record<string, unknown>) {
  const orderId = String(orderRow.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  const payments = db
    .prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC')
    .all(orderId) as Array<Record<string, unknown>>;
  const shipment = db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
  const history = db
    .prepare(`
      SELECT h.*, u.name as actor_name
      FROM order_status_history h
      LEFT JOIN users u ON h.changed_by = u.id
      WHERE h.order_id = ?
      ORDER BY h.created_at ASC
    `)
    .all(orderId);

  return {
    id: orderRow.id,
    orderNumber: orderRow.order_number,
    userId: orderRow.user_id,
    customerName: orderRow.customer_name,
    customerEmail: orderRow.customer_email,
    customerPhone: orderRow.customer_phone,
    shippingAddress: JSON.parse(String(orderRow.shipping_address_snapshot)),
    subtotal: orderRow.subtotal,
    shippingCost: orderRow.shipping_cost,
    discountAmount: orderRow.discount_amount,
    couponCode: orderRow.coupon_code,
    totalAmount: orderRow.total_amount,
    paymentStatus: orderRow.payment_status,
    orderStatus: orderRow.order_status,
    customerNote: orderRow.customer_note,
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
    items,
    payments: payments.map((p) => ({
      ...p,
      proofUrl: p.proof_file_id ? `/api/storage/files/${p.proof_file_id}` : null,
    })),
    shipment,
    history,
  };
}

router.get('/orders', requireAuth, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user!.id) as Array<Record<string, unknown>>;

  res.json({ orders: rows.map(buildOrderDetail) });
});

router.get('/orders/:orderNumber', requireAuth, (req: AuthedRequest, res) => {
  const orderNumber = String(req.params.orderNumber).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?')
    .get(orderNumber) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    return;
  }

  // Strictly enforce ownership or admin authorization
  if (String(row.user_id) !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Anda tidak memiliki izin mengakses detail pesanan ini.' });
    return;
  }

  res.json({ order: buildOrderDetail(row) });
});

router.post('/orders/:orderNumber/payment-proof', requireAuth, upload.single('proof'), (req: AuthedRequest, res) => {
  const orderNumber = String(req.params.orderNumber).trim().toUpperCase();
  const row = db
    .prepare('SELECT * FROM orders WHERE UPPER(order_number) = ?')
    .get(orderNumber) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
    return;
  }

  if (String(row.user_id) !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat mengunggah bukti untuk pesanan Anda sendiri.' });
    return;
  }

  if (row.order_status === 'Pesanan dibatalkan') {
    res.status(400).json({ error: 'Pesanan telah dibatalkan dan tidak dapat menerima bukti pembayaran.' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'File bukti transfer wajib diunggah (JPG, PNG, atau WEBP maks. 5MB).' });
    return;
  }

  let savedFile: { fileId: string };
  try {
    savedFile = saveValidatedImage(req.file.buffer, req.file.originalname, req.user!.id, 'payment_proof');
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'File tidak valid.' });
    return;
  }

  const reference = typeof req.body?.paymentReference === 'string' ? req.body.paymentReference.trim().slice(0, 120) : '';
  const now = new Date().toISOString();
  const orderId = String(row.id);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      UPDATE payments
      SET proof_file_id = ?, payment_reference = ?, payment_status = 'Menunggu verifikasi', updated_at = ?
      WHERE order_id = ?
    `).run(savedFile.fileId, reference, now, orderId);

    db.prepare(`
      UPDATE orders
      SET payment_status = 'Menunggu verifikasi', order_status = 'Menunggu konfirmasi', updated_at = ?
      WHERE id = ?
    `).run(now, orderId);

    db.prepare(`
      INSERT INTO order_status_history (id, order_id, previous_status, new_status, changed_by, note, created_at)
      VALUES (?, ?, ?, 'Menunggu konfirmasi', ?, 'Pelanggan mengunggah bukti transfer untuk diverifikasi admin', ?)
    `).run(crypto.randomUUID(), orderId, String(row.order_status), req.user!.id, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as Record<string, unknown>;
  res.json({ order: buildOrderDetail(updated) });
});

export default router;
