import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  FolderTree,
  LayoutDashboard,
  Lock,
  LogOut,
  Package,
  Plus,
  Settings,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Trash2,
  UploadCloud,
  Users,
  XCircle,
} from 'lucide-react';
import type { Category, OrderRecord, StoreSettings, User } from '../types';
import type { RoutePath } from '../components/Navbar';
import { apiRequest, formatDateId, formatRupiah, formatShortDateId, setAuthToken } from '../lib/api';

type AdminTab = 'overview' | 'products' | 'categories' | 'orders' | 'customers' | 'settings';

interface AdminDashboardProps {
  user: User | null;
  hasAdmin: boolean;
  requiresBootstrapSecret: boolean;
  onUserChange: (u: User | null) => void;
  onRefreshStore: () => Promise<void>;
  onNavigate: (r: RoutePath) => void;
}

interface OverviewData {
  stats: {
    totalProducts: number;
    activeProducts: number;
    totalCustomers: number;
    totalOrders: number;
    awaitingConfirmation: number;
    awaitingPayment: number;
    processingOrders: number;
    totalSales: number;
  };
  bestSellers: Array<{
    id: string;
    name: string;
    sku: string;
    sold_count: number;
    stock: number;
    effective_price: number;
    category_name: string;
  }>;
  dailySales: Array<{ date: string; orders: number; revenue: number }>;
  monthlySales: Array<{ month: string; orders: number; revenue: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    description: string;
    actor_name: string | null;
    actor_email: string | null;
    created_at: string;
  }>;
}

interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  category_id: string;
  category_name: string;
  motif: string;
  material: string;
  care_instructions: string;
  price: number;
  discount_price: number | null;
  sku: string;
  stock: number;
  sold_count: number;
  isActive: boolean;
  isFeatured: boolean;
  images: Array<{ id: string; fileId: string; url: string; altText: string; isPrimary: boolean }>;
  variants: Array<{
    id: string;
    size: string;
    color: string;
    sku: string;
    stock: number;
    price_adjustment: number;
  }>;
}

const ORDER_STATUSES = [
  'Menunggu konfirmasi',
  'Menunggu pembayaran',
  'Pembayaran diverifikasi',
  'Pesanan diproses',
  'Pesanan dikirim',
  'Pesanan selesai',
  'Pesanan dibatalkan',
] as const;

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  hasAdmin,
  requiresBootstrapSecret,
  onUserChange,
  onRefreshStore,
  onNavigate,
}) => {
  // Auth / Bootstrap state
  const [bootName, setBootName] = useState('');
  const [bootEmail, setBootEmail] = useState('');
  const [bootPhone, setBootPhone] = useState('');
  const [bootPassword, setBootPassword] = useState('');
  const [bootSecret, setBootSecret] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Dashboard state
  const [tab, setTab] = useState<AdminTab>('overview');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [products, setProducts] = useState<AdminProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [customers, setCustomers] = useState<Array<Record<string, unknown>>>([]);
  const [coupons, setCoupons] = useState<Array<Record<string, unknown>>>([]);
  const [stockMovements, setStockMovements] = useState<Array<Record<string, unknown>>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [loadingTab, setLoadingTab] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  // Product Form Modal
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodForm, setProdForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    motif: '',
    material: 'Katun Primisima Batik Khas Aceh',
    careInstructions: 'Cuci lembut dengan tangan, gunakan sabun batik, hindari pemutih.',
    price: '185000',
    discountPrice: '',
    sku: '',
    stock: '15',
    isActive: true,
    isFeatured: false,
  });
  const [prodImages, setProdImages] = useState<Array<{ fileId: string; url: string }>>([]);
  const [primaryFileId, setPrimaryFileId] = useState<string | null>(null);
  const [prodVariants, setProdVariants] = useState<
    Array<{ size: string; color: string; sku: string; stock: number; priceAdjustment: number }>
  >([]);
  const [confirmDeleteProdId, setConfirmDeleteProdId] = useState<string | null>(null);

  // Category Form
  const [catForm, setCatForm] = useState({
    id: '',
    name: '',
    description: '',
    symbol: '❋',
    sortOrder: '1',
    isActive: true,
  });

  // Order Filters & Inspector
  const [orderSearch, setOrderSearch] = useState('');
  const [orderFilterStatus, setOrderFilterStatus] = useState('');
  const [activeOrder, setActiveOrder] = useState<OrderRecord | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [statusUpdate, setStatusUpdate] = useState({
    orderStatus: 'Pesanan diproses',
    note: '',
    courierName: '',
    serviceName: '',
    trackingNumber: '',
    shippingCost: '0',
  });

  // Coupon Form
  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discountType: 'percentage',
    discountValue: '10',
    minimumPurchase: '100000',
    maximumDiscount: '50000',
  });

  const notify = (type: 'ok' | 'err', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 5000);
  };

  const loadAllAdminData = async () => {
    if (!user || user.role !== 'admin') return;
    setLoadingTab(true);
    try {
      const [ov, pr, ct, or, cu, cp, sm, st, al] = await Promise.all([
        apiRequest<OverviewData>('/api/admin/overview'),
        apiRequest<{ products: AdminProductRow[] }>('/api/admin/products'),
        apiRequest<{ categories: Category[] }>('/api/admin/categories'),
        apiRequest<{ orders: OrderRecord[] }>('/api/admin/orders'),
        apiRequest<{ customers: Array<Record<string, unknown>> }>('/api/admin/customers'),
        apiRequest<{ coupons: Array<Record<string, unknown>> }>('/api/admin/coupons'),
        apiRequest<{ movements: Array<Record<string, unknown>> }>('/api/admin/stock-movements'),
        apiRequest<{ settings: StoreSettings }>('/api/admin/settings'),
        apiRequest<{ logs: Array<Record<string, unknown>> }>('/api/admin/audit-logs'),
      ]);
      setOverview(ov);
      setProducts(pr.products);
      setCategories(ct.categories);
      setOrders(or.orders);
      setCustomers(cu.customers);
      setCoupons(cp.coupons);
      setStockMovements(sm.movements);
      setStoreSettings(st.settings);
      setAuditLogs(al.logs);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal memuat data admin.');
    } finally {
      setLoadingTab(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAllAdminData();
    }
  }, [user?.id, user?.role]);

  // ============================================================================
  // Security Gate: First-Admin Bootstrap / Admin Login / 403 Forbidden
  // ============================================================================
  if (!hasAdmin) {
    const handleBootstrap = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      try {
        const res = await apiRequest<{ token: string; user: User }>('/api/admin/bootstrap', {
          method: 'POST',
          body: JSON.stringify({
            name: bootName,
            email: bootEmail,
            phone: bootPhone,
            password: bootPassword,
            bootstrapSecret: bootSecret,
          }),
        });
        setAuthToken(res.token);
        onUserChange(res.user);
        await onRefreshStore();
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Konfigurasi admin gagal.');
      } finally {
        setAuthLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FFF4E8] flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white border border-[#54280F]/20 rounded-2xl p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 text-[#54280F]">
            <ShieldCheck className="w-6 h-6 text-[#C99A45]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#7A3E16]">
              Konfigurasi Awal Aman
            </span>
          </div>
          <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">
            Aktivasi Akun Admin Pertama Nusantara
          </h1>
          <p className="text-xs text-[#7A3E16] leading-relaxed">
            Belum ada akun admin terdaftar di database. Formulir satu-kali ini akan membuat admin pertama dan langsung mengunci pendaftaran admin publik secara permanen.
          </p>

          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
              {authError}
            </div>
          )}

          <form onSubmit={handleBootstrap} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Admin</label>
              <input
                type="text"
                required
                value={bootName}
                onChange={(e) => setBootName(e.target.value)}
                placeholder="Nama Pengelola Toko"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Email Admin</label>
              <input
                type="email"
                required
                value={bootEmail}
                onChange={(e) => setBootEmail(e.target.value)}
                placeholder="admin@nusantara.id"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nomor WhatsApp</label>
              <input
                type="tel"
                value={bootPhone}
                onChange={(e) => setBootPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">
                Kata Sandi Kuat (minimal 10 karakter)
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={bootPassword}
                onChange={(e) => setBootPassword(e.target.value)}
                placeholder="Minimal 10 karakter"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            {requiresBootstrapSecret && (
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">
                  Kode Rahasia Server (ADMIN_BOOTSTRAP_SECRET)
                </label>
                <input
                  type="password"
                  required
                  value={bootSecret}
                  onChange={(e) => setBootSecret(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={authLoading}
                className="flex-1 py-3 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] cursor-pointer"
              >
                {authLoading ? 'Mengaktifkan...' : 'Aktifkan Admin Pertama'}
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'home' })}
                className="px-4 py-3 border border-[#54280F]/20 text-[#54280F] text-sm font-semibold rounded-lg cursor-pointer"
              >
                Kembali
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    const handleAdminLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError('');
      setAuthLoading(true);
      try {
        const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
        });
        setAuthToken(res.token);
        onUserChange(res.user);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Login gagal.');
      } finally {
        setAuthLoading(false);
      }
    };

    return (
      <div className="min-h-screen bg-[#FFF4E8] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-[#54280F]/20 rounded-2xl p-8 shadow-sm space-y-5">
          <div className="flex items-center gap-2 text-[#54280F]">
            <Lock className="w-5 h-5 text-[#C99A45]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#7A3E16]">Portal Admin Terproteksi</span>
          </div>
          <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">Masuk Dashboard Admin</h1>
          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">{authError}</div>
          )}
          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Email Admin</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Kata Sandi</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              {authLoading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </button>
          </form>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'home' })}
            className="text-xs font-semibold text-[#7A3E16] hover:underline cursor-pointer"
          >
            ← Kembali ke Toko Nusantara
          </button>
        </div>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#FFF4E8] flex items-center justify-center p-4">
        <div className="max-w-md bg-white border border-red-200 rounded-2xl p-8 text-center space-y-4">
          <ShieldAlert className="w-10 h-10 text-red-700 mx-auto" />
          <h1 className="font-serif-display text-2xl font-bold text-[#111111]">Akses Ditolak (403)</h1>
          <p className="text-sm text-[#737373]">
            Akun Anda ({user.email}) memiliki role <strong>customer</strong>. Dashboard admin hanya dapat diakses oleh akun admin yang terverifikasi di server.
          </p>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'home' })}
            className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            Kembali ke Beranda Toko
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Admin Handlers
  // ============================================================================
  const openCreateProduct = () => {
    setEditingProdId(null);
    setProdForm({
      name: '',
      description: '',
      categoryId: categories[0]?.id || '',
      motif: '',
      material: 'Katun Primisima Batik Khas Aceh',
      careInstructions: 'Cuci lembut dengan tangan, gunakan sabun batik, hindari pemutih.',
      price: '185000',
      discountPrice: '',
      sku: `NS-${Math.floor(1000 + Math.random() * 8999)}`,
      stock: '15',
      isActive: true,
      isFeatured: false,
    });
    setProdImages([]);
    setPrimaryFileId(null);
    setProdVariants([{ size: 'All size', color: 'Cokelat & Emas', sku: '', stock: 15, priceAdjustment: 0 }]);
    setShowProdForm(true);
  };

  const openEditProduct = (p: AdminProductRow) => {
    setEditingProdId(p.id);
    setProdForm({
      name: p.name,
      description: p.description,
      categoryId: p.category_id,
      motif: p.motif,
      material: p.material,
      careInstructions: p.care_instructions,
      price: String(p.price),
      discountPrice: p.discount_price !== null ? String(p.discount_price) : '',
      sku: p.sku,
      stock: String(p.stock),
      isActive: p.isActive,
      isFeatured: p.isFeatured,
    });
    setProdImages(p.images.map((img) => ({ fileId: img.fileId, url: img.url })));
    setPrimaryFileId(p.images.find((img) => img.isPrimary)?.fileId || p.images[0]?.fileId || null);
    setProdVariants(
      p.variants.map((v) => ({
        size: v.size,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceAdjustment: v.price_adjustment,
      }))
    );
    setShowProdForm(true);
  };

  const handleUploadImage = async (file: File, purpose: string): Promise<{ fileId: string; url: string } | null> => {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('purpose', purpose);
    try {
      return await apiRequest<{ fileId: string; url: string }>('/api/admin/uploads', {
        method: 'POST',
        body: fd,
      });
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Upload gambar gagal.');
      return null;
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: prodForm.name,
      description: prodForm.description,
      categoryId: prodForm.categoryId,
      motif: prodForm.motif,
      material: prodForm.material,
      careInstructions: prodForm.careInstructions,
      price: Number(prodForm.price),
      discountPrice: prodForm.discountPrice ? Number(prodForm.discountPrice) : null,
      sku: prodForm.sku,
      stock: Number(prodForm.stock),
      isActive: prodForm.isActive,
      isFeatured: prodForm.isFeatured,
      imageFileIds: prodImages.map((x) => x.fileId),
      primaryFileId,
      variants: prodVariants.map((v, idx) => ({
        ...v,
        sku: v.sku || `${prodForm.sku}-V${idx + 1}`,
      })),
    };

    try {
      if (editingProdId) {
        await apiRequest(`/api/admin/products/${editingProdId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('ok', 'Produk berhasil diperbarui.');
      } else {
        await apiRequest('/api/admin/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('ok', 'Produk baru berhasil ditambahkan.');
      }
      setShowProdForm(false);
      await loadAllAdminData();
      await onRefreshStore();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal menyimpan produk.');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await apiRequest<{ message?: string }>(`/api/admin/products/${id}`, { method: 'DELETE' });
      setConfirmDeleteProdId(null);
      notify('ok', res.message || 'Produk dihapus.');
      await loadAllAdminData();
      await onRefreshStore();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal menghapus produk.');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: catForm.name,
        description: catForm.description,
        symbol: catForm.symbol,
        sortOrder: Number(catForm.sortOrder) || 0,
        isActive: catForm.isActive,
      };
      if (catForm.id) {
        await apiRequest(`/api/admin/categories/${catForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        notify('ok', 'Kategori diperbarui.');
      } else {
        await apiRequest('/api/admin/categories', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        notify('ok', 'Kategori ditambahkan.');
      }
      setCatForm({ id: '', name: '', description: '', symbol: '❋', sortOrder: '1', isActive: true });
      await loadAllAdminData();
      await onRefreshStore();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal menyimpan kategori.');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try {
      await apiRequest(`/api/admin/categories/${id}`, { method: 'DELETE' });
      notify('ok', 'Kategori dihapus.');
      await loadAllAdminData();
      await onRefreshStore();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal menghapus kategori.');
    }
  };

  const handleVerifyPayment = async (orderId: string, decision: 'Dibayar' | 'Ditolak') => {
    try {
      await apiRequest(`/api/admin/orders/${orderId}/verify-payment`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, adminNote: verifyNote }),
      });
      setVerifyNote('');
      notify('ok', `Pembayaran ditandai sebagai ${decision}.`);
      await loadAllAdminData();
      const updated = (await apiRequest<{ orders: OrderRecord[] }>('/api/admin/orders')).orders.find(
        (o) => o.id === orderId
      );
      if (updated) setActiveOrder(updated);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.');
    }
  };

  const handleUpdateOrderStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    try {
      await apiRequest(`/api/admin/orders/${activeOrder.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          orderStatus: statusUpdate.orderStatus,
          note: statusUpdate.note,
          courierName: statusUpdate.courierName,
          serviceName: statusUpdate.serviceName,
          trackingNumber: statusUpdate.trackingNumber,
          shippingCost: Number(statusUpdate.shippingCost) || 0,
        }),
      });
      notify('ok', 'Status pesanan dan informasi pengiriman diperbarui.');
      await loadAllAdminData();
      const updated = (await apiRequest<{ orders: OrderRecord[] }>('/api/admin/orders')).orders.find(
        (o) => o.id === activeOrder.id
      );
      if (updated) setActiveOrder(updated);
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal memperbarui status pesanan.');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: couponForm.code,
          description: couponForm.description,
          discountType: couponForm.discountType,
          discountValue: Number(couponForm.discountValue),
          minimumPurchase: Number(couponForm.minimumPurchase),
          maximumDiscount: couponForm.maximumDiscount ? Number(couponForm.maximumDiscount) : null,
        }),
      });
      setCouponForm({
        code: '',
        description: '',
        discountType: 'percentage',
        discountValue: '10',
        minimumPurchase: '100000',
        maximumDiscount: '50000',
      });
      notify('ok', 'Kupon promo berhasil dibuat.');
      await loadAllAdminData();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal membuat kupon.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSettings) return;
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(storeSettings),
      });
      notify('ok', 'Pengaturan toko berhasil disimpan.');
      await loadAllAdminData();
      await onRefreshStore();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Gagal menyimpan pengaturan toko.');
    }
  };

  const filteredOrders = orders.filter((o) => {
    const num = (o.order_number || o.orderNumber || '').toLowerCase();
    const cname = (o.customer_name || o.customerName || '').toLowerCase();
    const st = o.order_status || o.orderStatus;
    const matchStatus = !orderFilterStatus || st === orderFilterStatus;
    const matchQ = !orderSearch.trim() || num.includes(orderSearch.toLowerCase()) || cname.includes(orderSearch.toLowerCase());
    return matchStatus && matchQ;
  });

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Dashboard Utama', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'products', label: 'Produk & Stok', icon: <Package className="w-4 h-4" /> },
    { id: 'categories', label: 'Kategori', icon: <FolderTree className="w-4 h-4" /> },
    { id: 'orders', label: 'Pesanan & Pembayaran', icon: <ShoppingBag className="w-4 h-4" /> },
    { id: 'customers', label: 'Pelanggan & Kupon', icon: <Users className="w-4 h-4" /> },
    { id: 'settings', label: 'Toko & Audit Keamanan', icon: <Settings className="w-4 h-4" /> },
  ];

  const maxDailyRev = Math.max(1, ...(overview?.dailySales.map((d) => d.revenue) || [1]));
  const maxMonthlyRev = Math.max(1, ...(overview?.monthlySales.map((m) => m.revenue) || [1]));

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 bg-[#54280F] text-[#FFF4E8] shrink-0 flex flex-col">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="font-serif-display text-xl font-bold text-[#C99A45]">❋ Nusantara</div>
          <div className="text-xs text-[#FFF4E8]/75 mt-0.5">Panel Administrasi Toko</div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-x-auto flex lg:flex-col gap-1 lg:gap-0">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                tab === item.id ? 'bg-[#C99A45] text-[#111111]' : 'text-[#FFF4E8]/85 hover:bg-white/10'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 text-xs">
          <div className="truncate text-[#FFF4E8]/80">{user.email}</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onNavigate({ page: 'home' })}
              className="flex-1 inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Toko
            </button>
            <button
              type="button"
              onClick={async () => {
                await apiRequest('/api/auth/logout', { method: 'POST' });
                setAuthToken(null);
                onUserChange(null);
              }}
              className="inline-flex items-center justify-center gap-1 py-2 px-2.5 rounded bg-red-900/60 hover:bg-red-800 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Keluar
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="text-xs text-[#7A3E16]">
              Nusantara Admin / {navItems.find((n) => n.id === tab)?.label}
            </div>
            <h1 className="font-serif-display text-xl font-bold text-[#54280F]">
              {navItems.find((n) => n.id === tab)?.label}
            </h1>
          </div>
          <button
            type="button"
            onClick={loadAllAdminData}
            className="px-3.5 py-2 text-xs font-semibold border border-[#54280F]/20 rounded-lg text-[#54280F] hover:bg-[#FFF4E8] cursor-pointer"
          >
            {loadingTab ? 'Memuat...' : 'Segarkan Data'}
          </button>
        </header>

        <main className="p-6 space-y-6 flex-1 overflow-x-hidden">
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-semibold ${
                feedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {feedback.msg}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {tab === 'overview' && overview && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Produk', val: overview.stats.totalProducts },
                  { label: 'Total Pelanggan', val: overview.stats.totalCustomers },
                  { label: 'Total Pesanan', val: overview.stats.totalOrders },
                  { label: 'Total Penjualan (Dibayar)', val: formatRupiah(overview.stats.totalSales) },
                  { label: 'Menunggu Konfirmasi', val: overview.stats.awaitingConfirmation },
                  { label: 'Menunggu Pembayaran', val: overview.stats.awaitingPayment },
                  { label: 'Pesanan Diproses', val: overview.stats.processingOrders },
                  { label: 'Produk Aktif', val: overview.stats.activeProducts },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white border border-neutral-200 rounded-xl p-4">
                    <div className="text-xs text-[#737373]">{kpi.label}</div>
                    <div className="font-mono-num text-xl font-bold text-[#54280F] mt-1">{kpi.val}</div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <h2 className="text-sm font-bold text-[#54280F] mb-4">Grafik Penjualan Harian (Database)</h2>
                  {overview.dailySales.length === 0 ? (
                    <p className="text-xs text-[#737373] py-8 text-center">Belum ada transaksi tercatat.</p>
                  ) : (
                    <div className="space-y-2">
                      {overview.dailySales.map((d) => (
                        <div key={d.date} className="flex items-center gap-3 text-xs">
                          <span className="font-mono-num w-24 text-[#737373] shrink-0">{d.date}</span>
                          <div className="flex-1 h-5 bg-[#FFF4E8] rounded overflow-hidden">
                            <div
                              className="h-full bg-[#7A3E16] rounded"
                              style={{ width: `${Math.max(4, Math.round((d.revenue / maxDailyRev) * 100))}%` }}
                            />
                          </div>
                          <span className="font-mono-num w-28 text-right font-semibold text-[#111111]">
                            {formatRupiah(d.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <h2 className="text-sm font-bold text-[#54280F] mb-4">Grafik Penjualan Bulanan (Database)</h2>
                  {overview.monthlySales.length === 0 ? (
                    <p className="text-xs text-[#737373] py-8 text-center">Belum ada data penjualan bulanan.</p>
                  ) : (
                    <div className="space-y-2">
                      {overview.monthlySales.map((m) => (
                        <div key={m.month} className="flex items-center gap-3 text-xs">
                          <span className="font-mono-num w-20 text-[#737373] shrink-0">{m.month}</span>
                          <div className="flex-1 h-5 bg-[#FFF4E8] rounded overflow-hidden">
                            <div
                              className="h-full bg-[#C99A45] rounded"
                              style={{ width: `${Math.max(4, Math.round((m.revenue / maxMonthlyRev) * 100))}%` }}
                            />
                          </div>
                          <span className="font-mono-num w-28 text-right font-semibold text-[#111111]">
                            {formatRupiah(m.revenue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <h2 className="text-sm font-bold text-[#54280F] mb-3">Produk Terlaris</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-neutral-200 text-left text-[#737373]">
                          <th className="py-2">Produk</th>
                          <th className="py-2 text-right">Terjual</th>
                          <th className="py-2 text-right">Stok</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.bestSellers.map((b) => (
                          <tr key={b.id} className="border-b border-neutral-100">
                            <td className="py-2 font-medium text-[#111111]">{b.name}</td>
                            <td className="py-2 text-right font-mono-num">{b.sold_count}</td>
                            <td className="py-2 text-right font-mono-num">{b.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-neutral-200 rounded-xl p-5">
                  <h2 className="text-sm font-bold text-[#54280F] mb-3 flex items-center gap-1.5">
                    <Activity className="w-4 h-4" />
                    Aktivitas Terbaru
                  </h2>
                  {overview.recentActivity.length === 0 ? (
                    <p className="text-xs text-[#737373]">Belum ada aktivitas tercatat.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {overview.recentActivity.map((act) => (
                        <div key={act.id} className="text-xs pb-2 border-b border-neutral-100">
                          <div className="font-semibold text-[#54280F]">{act.action}</div>
                          <div className="text-[#111111]/85">{act.description}</div>
                          <div className="text-[11px] text-[#737373] mt-0.5">
                            {act.actor_email || 'Sistem'} · {formatDateId(act.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PRODUCTS */}
          {tab === 'products' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold text-[#54280F]">Daftar Produk ({products.length})</h2>
                <button
                  type="button"
                  onClick={openCreateProduct}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tambah Produk
                </button>
              </div>

              {showProdForm && (
                <form onSubmit={handleSaveProduct} className="bg-white border border-[#54280F]/20 rounded-xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-serif-display text-lg font-bold text-[#54280F]">
                      {editingProdId ? 'Edit Produk' : 'Tambah Produk Baru'}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowProdForm(false)}
                      className="text-xs text-[#737373] cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Produk</label>
                      <input
                        required
                        value={prodForm.name}
                        onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Kategori</label>
                      <select
                        required
                        value={prodForm.categoryId}
                        onChange={(e) => setProdForm({ ...prodForm, categoryId: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Motif</label>
                      <input
                        required
                        value={prodForm.motif}
                        onChange={(e) => setProdForm({ ...prodForm, motif: e.target.value })}
                        placeholder="Motif Bungong Jeumpa"
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Harga Normal (Rp)</label>
                      <input
                        type="number"
                        required
                        min={1000}
                        value={prodForm.price}
                        onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Harga Diskon (Opsional)</label>
                      <input
                        type="number"
                        min={0}
                        value={prodForm.discountPrice}
                        onChange={(e) => setProdForm({ ...prodForm, discountPrice: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">SKU & Total Stok</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          required
                          value={prodForm.sku}
                          onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })}
                          placeholder="SKU"
                          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                        />
                        <input
                          type="number"
                          required
                          min={0}
                          value={prodForm.stock}
                          onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })}
                          placeholder="Stok"
                          className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">Deskripsi Produk</label>
                    <textarea
                      rows={2}
                      required
                      value={prodForm.description}
                      onChange={(e) => setProdForm({ ...prodForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Bahan</label>
                      <input
                        value={prodForm.material}
                        onChange={(e) => setProdForm({ ...prodForm, material: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#54280F] mb-1">Perawatan</label>
                      <input
                        value={prodForm.careInstructions}
                        onChange={(e) => setProdForm({ ...prodForm, careInstructions: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Image Upload Manager */}
                  <div className="p-4 rounded-xl bg-[#FAF6F1] border border-neutral-200 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#54280F]">Foto Produk (File Storage Server)</span>
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#7A3E16] text-white text-xs font-semibold rounded-lg cursor-pointer">
                        <UploadCloud className="w-3.5 h-3.5" />
                        Unggah Foto
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const uploaded = await handleUploadImage(file, 'product');
                            if (uploaded) {
                              setProdImages((prev) => [...prev, uploaded]);
                              if (!primaryFileId) setPrimaryFileId(uploaded.fileId);
                            }
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {prodImages.map((img) => (
                        <div key={img.fileId} className="w-24 space-y-1">
                          <img
                            src={img.url}
                            alt="Foto produk"
                            className={`w-24 h-20 object-cover rounded border-2 ${
                              primaryFileId === img.fileId ? 'border-[#54280F]' : 'border-transparent'
                            }`}
                          />
                          <div className="flex justify-between text-[10px]">
                            <button
                              type="button"
                              onClick={() => setPrimaryFileId(img.fileId)}
                              className="text-[#54280F] font-semibold cursor-pointer"
                            >
                              {primaryFileId === img.fileId ? 'Utama' : 'Set Utama'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setProdImages((prev) => prev.filter((x) => x.fileId !== img.fileId))
                              }
                              className="text-red-700 cursor-pointer"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Variants Manager */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-[#54280F]">Varian Ukuran & Warna</span>
                      <button
                        type="button"
                        onClick={() =>
                          setProdVariants((prev) => [
                            ...prev,
                            { size: 'L', color: 'Cokelat Soga', sku: '', stock: 5, priceAdjustment: 0 },
                          ])
                        }
                        className="text-xs font-semibold text-[#7A3E16] cursor-pointer"
                      >
                        + Tambah Varian
                      </button>
                    </div>
                    {prodVariants.map((v, idx) => (
                      <div key={idx} className="grid grid-cols-5 gap-2">
                        <input
                          placeholder="Ukuran"
                          value={v.size}
                          onChange={(e) => {
                            const copy = [...prodVariants];
                            copy[idx].size = e.target.value;
                            setProdVariants(copy);
                          }}
                          className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded"
                        />
                        <input
                          placeholder="Warna"
                          value={v.color}
                          onChange={(e) => {
                            const copy = [...prodVariants];
                            copy[idx].color = e.target.value;
                            setProdVariants(copy);
                          }}
                          className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded"
                        />
                        <input
                          placeholder="SKU Varian"
                          value={v.sku}
                          onChange={(e) => {
                            const copy = [...prodVariants];
                            copy[idx].sku = e.target.value;
                            setProdVariants(copy);
                          }}
                          className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded"
                        />
                        <input
                          type="number"
                          min={0}
                          placeholder="Stok"
                          value={v.stock}
                          onChange={(e) => {
                            const copy = [...prodVariants];
                            copy[idx].stock = Number(e.target.value);
                            setProdVariants(copy);
                          }}
                          className="px-2.5 py-1.5 text-xs border border-neutral-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => setProdVariants((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-xs text-red-700 cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-6 text-xs">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prodForm.isActive}
                        onChange={(e) => setProdForm({ ...prodForm, isActive: e.target.checked })}
                      />
                      Aktif di Katalog
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={prodForm.isFeatured}
                        onChange={(e) => setProdForm({ ...prodForm, isFeatured: e.target.checked })}
                      />
                      Produk Unggulan
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Simpan Produk
                  </button>
                </form>
              )}

              <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#FAF6F1] border-b border-neutral-200 text-left text-[#54280F]">
                      <th className="p-3">Produk</th>
                      <th className="p-3">Kategori</th>
                      <th className="p-3">SKU</th>
                      <th className="p-3 text-right">Harga</th>
                      <th className="p-3 text-right">Stok</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.id} className="border-b border-neutral-100 hover:bg-[#FAF6F1]/50">
                        <td className="p-3 font-semibold text-[#111111]">{p.name}</td>
                        <td className="p-3 text-[#7A3E16]">{p.category_name}</td>
                        <td className="p-3 font-mono-num">{p.sku}</td>
                        <td className="p-3 text-right font-mono-num">
                          {formatRupiah(p.discount_price ?? p.price)}
                        </td>
                        <td className="p-3 text-right font-mono-num">{p.stock}</td>
                        <td className="p-3">{p.isActive ? 'Aktif' : 'Arsip'}</td>
                        <td className="p-3 text-right space-x-2 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditProduct(p)}
                            className="text-[#54280F] font-semibold hover:underline cursor-pointer"
                          >
                            Edit
                          </button>
                          {confirmDeleteProdId === p.id ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-red-700 font-bold underline cursor-pointer"
                            >
                              Konfirmasi Hapus
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteProdId(p.id)}
                              className="text-red-700 hover:underline cursor-pointer"
                            >
                              Hapus
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Riwayat Pergerakan Stok */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5">
                <h3 className="text-sm font-bold text-[#54280F] mb-3">Riwayat Pergerakan Stok</h3>
                <div className="overflow-x-auto max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-left text-[#737373]">
                        <th className="py-2">Waktu</th>
                        <th className="py-2">Produk</th>
                        <th className="py-2 text-right">Perubahan</th>
                        <th className="py-2 text-right">Stok Akhir</th>
                        <th className="py-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockMovements.map((m) => (
                        <tr key={String(m.id)} className="border-b border-neutral-100">
                          <td className="py-2 text-[#737373]">{formatDateId(String(m.created_at))}</td>
                          <td className="py-2 font-medium">{String(m.product_name)}</td>
                          <td className="py-2 text-right font-mono-num">
                            {Number(m.delta) > 0 ? `+${m.delta}` : String(m.delta)}
                          </td>
                          <td className="py-2 text-right font-mono-num">{String(m.new_stock)}</td>
                          <td className="py-2">{String(m.reason)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CATEGORIES */}
          {tab === 'categories' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form onSubmit={handleSaveCategory} className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-bold text-[#54280F]">
                  {catForm.id ? 'Ubah Kategori' : 'Tambah Kategori Baru'}
                </h2>
                <input
                  required
                  placeholder="Nama Kategori"
                  value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                />
                <textarea
                  rows={2}
                  placeholder="Deskripsi singkat"
                  value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    placeholder="Simbol"
                    value={catForm.symbol}
                    onChange={(e) => setCatForm({ ...catForm, symbol: e.target.value })}
                    className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                  />
                  <input
                    type="number"
                    placeholder="Urutan"
                    value={catForm.sortOrder}
                    onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })}
                    className="px-3 py-2 text-sm border border-neutral-300 rounded-lg"
                  />
                </div>
                <label className="inline-flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={catForm.isActive}
                    onChange={(e) => setCatForm({ ...catForm, isActive: e.target.checked })}
                  />
                  Kategori Aktif
                </label>
                <div className="flex gap-2">
                  <button type="submit" className="flex-1 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer">
                    Simpan
                  </button>
                  {catForm.id && (
                    <button
                      type="button"
                      onClick={() => setCatForm({ id: '', name: '', description: '', symbol: '❋', sortOrder: '1', isActive: true })}
                      className="px-3 py-2 border border-neutral-300 text-xs rounded-lg cursor-pointer"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </form>

              <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#FAF6F1] border-b border-neutral-200 text-left text-[#54280F]">
                      <th className="p-3">Urutan</th>
                      <th className="p-3">Kategori</th>
                      <th className="p-3 text-right">Produk</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} className="border-b border-neutral-100">
                        <td className="p-3 font-mono-num">{c.sort_order ?? c.sortOrder}</td>
                        <td className="p-3 font-semibold">
                          {c.symbol} {c.name}
                        </td>
                        <td className="p-3 text-right font-mono-num">{c.product_count ?? c.productCount}</td>
                        <td className="p-3">{c.isActive ? 'Aktif' : 'Nonaktif'}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              setCatForm({
                                id: c.id,
                                name: c.name,
                                description: c.description,
                                symbol: c.symbol,
                                sortOrder: String(c.sort_order ?? c.sortOrder ?? 0),
                                isActive: Boolean(c.isActive),
                              })
                            }
                            className="text-[#54280F] font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(c.id)}
                            className="text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ORDERS & PAYMENT VERIFICATION */}
          {tab === 'orders' && (
            <div className="space-y-4">
              <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap gap-3">
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Cari nomor pesanan atau nama pelanggan..."
                  className="flex-1 min-w-[200px] px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
                <select
                  value={orderFilterStatus}
                  onChange={(e) => setOrderFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                >
                  <option value="">Semua Status</option>
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 space-y-2.5">
                  {filteredOrders.length === 0 ? (
                    <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-xs text-[#737373]">
                      Belum ada pesanan yang sesuai filter.
                    </div>
                  ) : (
                    filteredOrders.map((o) => {
                      const num = o.order_number || o.orderNumber;
                      const cname = o.customer_name || o.customerName;
                      const st = o.order_status || o.orderStatus;
                      const paySt = o.payment_status || o.paymentStatus;
                      const tot = o.total_amount ?? o.totalAmount;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setActiveOrder(o);
                            setStatusUpdate({
                              orderStatus: st,
                              note: '',
                              courierName: o.shipment?.courier_name || '',
                              serviceName: o.shipment?.service_name || '',
                              trackingNumber: o.shipment?.tracking_number || '',
                              shippingCost: String(o.shipping_cost ?? o.shippingCost ?? 0),
                            });
                          }}
                          className={`w-full text-left p-4 rounded-xl border cursor-pointer ${
                            activeOrder?.id === o.id ? 'bg-white border-[#54280F]' : 'bg-white border-neutral-200'
                          }`}
                        >
                          <div className="flex justify-between text-xs">
                            <span className="font-mono-num font-bold text-[#54280F]">{num}</span>
                            <span className="font-semibold text-[#7A3E16]">{st}</span>
                          </div>
                          <div className="flex justify-between text-xs text-[#737373] mt-1">
                            <span>{cname}</span>
                            <span className="font-mono-num font-bold text-[#111111]">{formatRupiah(tot)}</span>
                          </div>
                          <div className="text-[11px] text-[#737373] mt-1">Pembayaran: {paySt}</div>
                        </button>
                      );
                    })
                  )}
                </div>

                {activeOrder && (
                  <div className="lg:col-span-7 bg-white border border-neutral-200 rounded-xl p-6 space-y-5">
                    <div className="flex justify-between items-start border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="font-mono-num text-lg font-bold text-[#54280F]">
                          {activeOrder.order_number || activeOrder.orderNumber}
                        </h3>
                        <p className="text-xs text-[#737373]">
                          {activeOrder.customer_name || activeOrder.customerName} ·{' '}
                          {activeOrder.customer_email || activeOrder.customerEmail} ·{' '}
                          {activeOrder.customer_phone || activeOrder.customerPhone}
                        </p>
                      </div>
                      <span className="text-xs font-bold text-[#54280F]">
                        {activeOrder.order_status || activeOrder.orderStatus}
                      </span>
                    </div>

                    <div className="text-xs text-[#111111]">
                      <strong>Alamat Pengiriman:</strong> {activeOrder.shippingAddress.addressLine},{' '}
                      {activeOrder.shippingAddress.district}, {activeOrder.shippingAddress.city},{' '}
                      {activeOrder.shippingAddress.province} {activeOrder.shippingAddress.postalCode}
                    </div>

                    {/* Verifikasi Bukti Pembayaran */}
                    <div className="p-4 rounded-xl bg-[#FAF6F1] border border-neutral-200 space-y-3">
                      <div className="text-xs font-bold text-[#54280F]">
                        Verifikasi Pembayaran ({activeOrder.payment_status || activeOrder.paymentStatus})
                      </div>
                      {activeOrder.payment?.proofUrl ? (
                        <a
                          href={activeOrder.payment.proofUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          <img
                            src={activeOrder.payment.proofUrl}
                            alt="Bukti transfer pelanggan"
                            className="max-h-56 rounded-lg border border-neutral-300 object-contain"
                          />
                        </a>
                      ) : (
                        <p className="text-xs text-[#737373]">Pelanggan belum mengunggah bukti transfer.</p>
                      )}
                      <input
                        type="text"
                        value={verifyNote}
                        onChange={(e) => setVerifyNote(e.target.value)}
                        placeholder="Catatan verifikasi admin..."
                        className="w-full px-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleVerifyPayment(activeOrder.id, 'Dibayar')}
                          className="inline-flex items-center gap-1 px-3.5 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verifikasi Dibayar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVerifyPayment(activeOrder.id, 'Ditolak')}
                          className="inline-flex items-center gap-1 px-3.5 py-2 bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Tolak Bukti
                        </button>
                      </div>
                    </div>

                    {/* Update Status & Pengiriman */}
                    <form onSubmit={handleUpdateOrderStatus} className="space-y-3 border-t border-neutral-200 pt-4">
                      <h4 className="text-xs font-bold text-[#54280F]">Perbarui Status & Pengiriman</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          value={statusUpdate.orderStatus}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, orderStatus: e.target.value })}
                          className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          placeholder="Ongkos Kirim (Rp)"
                          value={statusUpdate.shippingCost}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, shippingCost: e.target.value })}
                          className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                        />
                        <input
                          placeholder="Nama Kurir (JNE / J&T / Pos)"
                          value={statusUpdate.courierName}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, courierName: e.target.value })}
                          className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                        />
                        <input
                          placeholder="Nomor Resi"
                          value={statusUpdate.trackingNumber}
                          onChange={(e) => setStatusUpdate({ ...statusUpdate, trackingNumber: e.target.value })}
                          className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                        />
                      </div>
                      <input
                        placeholder="Catatan perubahan / alasan pembatalan..."
                        value={statusUpdate.note}
                        onChange={(e) => setStatusUpdate({ ...statusUpdate, note: e.target.value })}
                        className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Simpan Pembaruan Pesanan
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: CUSTOMERS & COUPONS */}
          {tab === 'customers' && (
            <div className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
                <div className="px-5 py-3.5 border-b border-neutral-200 font-bold text-sm text-[#54280F]">
                  Pelanggan Terdaftar ({customers.length})
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#FAF6F1] border-b border-neutral-200 text-left text-[#54280F]">
                      <th className="p-3">Nama</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">WhatsApp</th>
                      <th className="p-3">Tgl Daftar</th>
                      <th className="p-3 text-right">Pesanan</th>
                      <th className="p-3 text-right">Total Belanja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={String(c.id)} className="border-b border-neutral-100">
                        <td className="p-3 font-semibold">{String(c.name)}</td>
                        <td className="p-3">{String(c.email)}</td>
                        <td className="p-3 font-mono-num">{String(c.phone || '-')}</td>
                        <td className="p-3">{formatShortDateId(String(c.created_at))}</td>
                        <td className="p-3 text-right font-mono-num">{String(c.order_count)}</td>
                        <td className="p-3 text-right font-mono-num">{formatRupiah(Number(c.total_spent))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <form onSubmit={handleCreateCoupon} className="lg:col-span-4 bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[#54280F]">Buat Kupon Diskon</h3>
                  <input
                    required
                    placeholder="Kode Kupon (misal: ACEH15)"
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg uppercase"
                  />
                  <input
                    placeholder="Deskripsi"
                    value={couponForm.description}
                    onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={couponForm.discountType}
                      onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value })}
                      className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    >
                      <option value="percentage">Persen (%)</option>
                      <option value="fixed">Nominal (Rp)</option>
                    </select>
                    <input
                      type="number"
                      required
                      min={1}
                      value={couponForm.discountValue}
                      onChange={(e) => setCouponForm({ ...couponForm, discountValue: e.target.value })}
                      className="px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <button type="submit" className="w-full py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer">
                    Simpan Kupon
                  </button>
                </form>

                <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#FAF6F1] border-b border-neutral-200 text-left text-[#54280F]">
                        <th className="p-3">Kode</th>
                        <th className="p-3">Deskripsi</th>
                        <th className="p-3 text-right">Nilai</th>
                        <th className="p-3 text-right">Dipakai</th>
                      </tr>
                    </thead>
                    <tbody>
                      {coupons.map((cp) => (
                        <tr key={String(cp.id)} className="border-b border-neutral-100">
                          <td className="p-3 font-mono-num font-bold text-[#54280F]">{String(cp.code)}</td>
                          <td className="p-3">{String(cp.description)}</td>
                          <td className="p-3 text-right font-mono-num">
                            {cp.discount_type === 'percentage'
                              ? `${cp.discount_value}%`
                              : formatRupiah(Number(cp.discount_value))}
                          </td>
                          <td className="p-3 text-right font-mono-num">{String(cp.used_count)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: STORE SETTINGS & SECURITY AUDIT LOGS */}
          {tab === 'settings' && storeSettings && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <form onSubmit={handleSaveSettings} className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-3.5">
                <h2 className="text-sm font-bold text-[#54280F]">Pengaturan Identitas & Rekening Toko</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Toko</label>
                    <input
                      required
                      value={storeSettings.storeName}
                      onChange={(e) => setStoreSettings({ ...storeSettings, storeName: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">Email Resmi</label>
                    <input
                      required
                      type="email"
                      value={storeSettings.email}
                      onChange={(e) => setStoreSettings({ ...storeSettings, email: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#54280F] mb-1">Tagline</label>
                  <input
                    required
                    value={storeSettings.tagline}
                    onChange={(e) => setStoreSettings({ ...storeSettings, tagline: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">Instagram</label>
                    <input
                      value={storeSettings.instagram}
                      onChange={(e) => setStoreSettings({ ...storeSettings, instagram: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">TikTok</label>
                    <input
                      value={storeSettings.tiktok}
                      onChange={(e) => setStoreSettings({ ...storeSettings, tiktok: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#54280F] mb-1">Nomor WhatsApp</label>
                    <input
                      value={storeSettings.whatsapp}
                      onChange={(e) => setStoreSettings({ ...storeSettings, whatsapp: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#54280F] mb-1">Informasi Rekening Bank</label>
                  <textarea
                    rows={2}
                    value={storeSettings.bankInformation}
                    onChange={(e) => setStoreSettings({ ...storeSettings, bankInformation: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#54280F] mb-1">Alamat Toko</label>
                  <input
                    value={storeSettings.storeAddress}
                    onChange={(e) => setStoreSettings({ ...storeSettings, storeAddress: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#54280F] mb-1">Kebijakan Pengiriman</label>
                  <textarea
                    rows={2}
                    value={storeSettings.shippingPolicy}
                    onChange={(e) => setStoreSettings({ ...storeSettings, shippingPolicy: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#54280F] mb-1">Kebijakan Pengembalian</label>
                  <textarea
                    rows={2}
                    value={storeSettings.returnPolicy}
                    onChange={(e) => setStoreSettings({ ...storeSettings, returnPolicy: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
                <button type="submit" className="px-5 py-2.5 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer">
                  Simpan Pengaturan Toko
                </button>
              </form>

              <div className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 space-y-3">
                <h2 className="text-sm font-bold text-[#54280F] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#C99A45]" />
                  Security & Audit Logs ({auditLogs.length})
                </h2>
                <div className="max-h-[540px] overflow-y-auto space-y-2.5">
                  {auditLogs.map((log) => (
                    <div key={String(log.id)} className="p-3 rounded-lg bg-[#FAF6F1] border border-neutral-200 text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono-num font-bold text-[#54280F]">{String(log.action)}</span>
                        <span className="text-[11px] text-[#737373]">{formatDateId(String(log.created_at))}</span>
                      </div>
                      <p className="text-[#111111] mt-1">{String(log.description)}</p>
                      <div className="text-[11px] text-[#737373] mt-1">
                        Aktor: {String(log.actor_email || 'Sistem')} · IP: {String(log.ip_address || '-')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
