import React, { Component, useEffect, useState } from 'react';
import { Navbar, type RoutePath } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { CartDrawer } from './components/CartDrawer';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { OrdersPage } from './pages/OrdersPage';
import { AboutPage, ContactPage } from './pages/InfoPages';
import { AdminDashboard } from './pages/AdminDashboard';
import { apiRequest } from './lib/api';
import type { CartState, Category, Product, StoreSettings, User } from './types';

function parseLocation(): RoutePath {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);

  if (path === '/admin' || path.startsWith('/admin/')) {
    return { page: 'admin' };
  }
  if (path === '/katalog') {
    return {
      page: 'catalog',
      query: params.get('q') || undefined,
      category: params.get('kategori') || undefined,
    };
  }
  if (path.startsWith('/produk/')) {
    const slug = decodeURIComponent(path.slice('/produk/'.length));
    if (slug) return { page: 'product', slug };
  }
  if (path === '/checkout') {
    return { page: 'checkout' };
  }
  if (path === '/lacak') {
    return { page: 'orders', orderNumber: params.get('nomor') || undefined };
  }
  if (path === '/tentang') {
    return { page: 'about' };
  }
  if (path === '/kontak') {
    return { page: 'contact' };
  }
  return { page: 'home' };
}

function buildUrl(r: RoutePath): string {
  switch (r.page) {
    case 'admin':
      return '/admin';
    case 'catalog': {
      const p = new URLSearchParams();
      if (r.query) p.set('q', r.query);
      if (r.category) p.set('kategori', r.category);
      const qs = p.toString();
      return qs ? `/katalog?${qs}` : '/katalog';
    }
    case 'product':
      return `/produk/${encodeURIComponent(r.slug)}`;
    case 'checkout':
      return '/checkout';
    case 'orders':
      return r.orderNumber ? `/lacak?nomor=${encodeURIComponent(r.orderNumber)}` : '/lacak';
    case 'about':
      return '/tentang';
    case 'contact':
      return '/kontak';
    default:
      return '/';
  }
}

class AppErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FFF4E8] flex items-center justify-center p-6">
          <div className="max-w-md bg-white border border-[#54280F]/20 rounded-2xl p-6 text-center space-y-3">
            <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">Terjadi Kesalahan Tampilan</h1>
            <p className="text-sm text-[#7A3E16]">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const EMPTY_CART: CartState = { items: [], subtotal: 0, totalQuantity: 0 };

function AppContent() {
  const [route, setRoute] = useState<RoutePath>(() => parseLocation());
  const [user, setUser] = useState<User | null>(null);
  const [hasAdmin, setHasAdmin] = useState<boolean>(true);
  const [requiresBootstrapSecret, setRequiresBootstrapSecret] = useState<boolean>(false);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartState>(EMPTY_CART);

  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const navigate = (next: RoutePath) => {
    const nextUrl = buildUrl(next);
    if (window.location.pathname + window.location.search !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const onPop = () => setRoute(parseLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshStoreMetadata = async () => {
    const [meRes, setRes, catRes] = await Promise.all([
      apiRequest<{ user: User | null; hasAdmin: boolean; requiresBootstrapSecret: boolean }>('/api/auth/me'),
      apiRequest<{ settings: StoreSettings }>('/api/store/settings'),
      apiRequest<{ categories: Category[] }>('/api/categories'),
    ]);
    setUser(meRes.user);
    setHasAdmin(meRes.hasAdmin);
    setRequiresBootstrapSecret(meRes.requiresBootstrapSecret);
    setSettings(setRes.settings);
    setCategories(catRes.categories);
  };

  const refreshCart = async () => {
    try {
      const res = await apiRequest<CartState>('/api/cart');
      setCart(res);
    } catch {
      setCart(EMPTY_CART);
    }
  };

  useEffect(() => {
    refreshStoreMetadata().catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      refreshCart();
    } else {
      setCart(EMPTY_CART);
    }
  }, [user?.id]);

  const handleAddToCart = async (productId: string, variantId: string | null, quantity: number) => {
    if (!user) {
      setAuthOpen(true);
      showToast('Silakan masuk atau daftar akun untuk menambahkan produk ke keranjang.');
      return;
    }
    setAddingId(productId);
    try {
      const res = await apiRequest<CartState>('/api/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, variantId, quantity }),
      });
      setCart(res);
      showToast('Produk berhasil ditambahkan ke keranjang.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menambahkan produk.');
    } finally {
      setAddingId(null);
    }
  };

  const handleQuickAdd = async (product: Product) => {
    const defaultVariant = product.variants.find((v) => v.stock > 0) || product.variants[0] || null;
    await handleAddToCart(product.id, defaultVariant ? defaultVariant.id : null, 1);
  };

  const handleUpdateQty = async (itemId: string, qty: number) => {
    try {
      const res = await apiRequest<CartState>(`/api/cart/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify({ quantity: qty }),
      });
      setCart(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah jumlah produk.');
    }
  };

  const handleRemoveCartItem = async (itemId: string) => {
    try {
      const res = await apiRequest<CartState>(`/api/cart/items/${itemId}`, {
        method: 'DELETE',
      });
      setCart(res);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus produk.');
    }
  };

  if (route.page === 'admin') {
    return (
      <AdminDashboard
        user={user}
        hasAdmin={hasAdmin}
        requiresBootstrapSecret={requiresBootstrapSecret}
        onUserChange={(u) => {
          setUser(u);
          if (u?.role === 'admin') setHasAdmin(true);
        }}
        onRefreshStore={refreshStoreMetadata}
        onNavigate={navigate}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FFF4E8] text-[#111111]">
      <Navbar
        route={route}
        onNavigate={navigate}
        user={user}
        cartCount={cart.totalQuantity}
        settings={settings}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenCart={() => setCartOpen(true)}
      />

      <main className="flex-1">
        {route.page === 'home' && (
          <HomePage
            categories={categories}
            settings={settings}
            onNavigate={navigate}
            onQuickAdd={handleQuickAdd}
            addingId={addingId}
          />
        )}
        {route.page === 'catalog' && (
          <CatalogPage
            categories={categories}
            initialQuery={route.query}
            initialCategory={route.category}
            onNavigate={navigate}
            onQuickAdd={handleQuickAdd}
            addingId={addingId}
          />
        )}
        {route.page === 'product' && (
          <ProductDetailPage
            slug={route.slug}
            user={user}
            onNavigate={navigate}
            onAddToCart={handleAddToCart}
            onOpenAuth={() => setAuthOpen(true)}
          />
        )}
        {route.page === 'checkout' && (
          <CheckoutPage
            user={user}
            cart={cart}
            settings={settings}
            onRefreshCart={refreshCart}
            onNavigate={navigate}
            onOpenAuth={() => setAuthOpen(true)}
          />
        )}
        {route.page === 'orders' && (
          <OrdersPage
            user={user}
            initialOrderNumber={route.orderNumber}
            onUserChange={setUser}
            onOpenAuth={() => setAuthOpen(true)}
          />
        )}
        {route.page === 'about' && <AboutPage settings={settings} />}
        {route.page === 'contact' && <ContactPage settings={settings} />}
      </main>

      <Footer settings={settings} onNavigate={navigate} />

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          showToast(`Selamat datang, ${u.name}!`);
        }}
      />

      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        cart={cart}
        user={user}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveCartItem}
        onCheckout={() => navigate({ page: 'checkout' })}
        onOpenAuth={() => setAuthOpen(true)}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-[#54280F] text-white text-xs sm:text-sm font-medium px-5 py-3 rounded-xl shadow-lg border border-[#C99A45]/40"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}
