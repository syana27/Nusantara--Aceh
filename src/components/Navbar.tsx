import React, { useState } from 'react';
import { Menu, Search, ShoppingBag, ShieldCheck, User as UserIcon, X } from 'lucide-react';
import type { StoreSettings, User } from '../types';

export type RoutePath =
  | { page: 'home' }
  | { page: 'catalog'; query?: string; category?: string }
  | { page: 'product'; slug: string }
  | { page: 'checkout' }
  | { page: 'orders'; orderNumber?: string }
  | { page: 'about' }
  | { page: 'contact' }
  | { page: 'admin' };

interface NavbarProps {
  route: RoutePath;
  onNavigate: (r: RoutePath) => void;
  user: User | null;
  cartCount: number;
  settings: StoreSettings | null;
  onOpenAuth: () => void;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  route,
  onNavigate,
  user,
  cartCount,
  settings,
  onOpenAuth,
  onOpenCart,
}) => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInput.trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    onNavigate({ page: 'catalog', query: q });
  };

  const navItems: Array<{ label: string; target: RoutePath; active: boolean }> = [
    { label: 'Beranda', target: { page: 'home' }, active: route.page === 'home' },
    {
      label: 'Kategori',
      target: { page: 'catalog' },
      active: route.page === 'catalog' && Boolean(route.category),
    },
    {
      label: 'Katalog',
      target: { page: 'catalog' },
      active: route.page === 'catalog' && !route.category,
    },
    { label: 'Tentang Kami', target: { page: 'about' }, active: route.page === 'about' },
    { label: 'Kontak', target: { page: 'contact' }, active: route.page === 'contact' },
    { label: 'Lacak Pesanan', target: { page: 'orders' }, active: route.page === 'orders' },
  ];

  const handleNavClick = (target: RoutePath, label: string) => {
    setMobileMenuOpen(false);
    if (label === 'Kategori' && route.page === 'home') {
      const el = document.getElementById('kategori-unggulan');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    onNavigate(target);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFF4E8]/95 backdrop-blur-sm border-b border-[#54280F]/12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4 lg:gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => onNavigate({ page: 'home' })}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C99A45] rounded"
        >
          {settings?.logoUrl ? (
            <img
              src={settings.logoUrl}
              alt={settings.storeName || 'Nusantara'}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded object-cover border border-[#54280F]/15"
            />
          ) : (
            <span className="text-2xl leading-none text-[#C99A45]" aria-hidden="true">
              ❋
            </span>
          )}
          <span className="font-serif-display text-2xl font-bold tracking-tight text-[#54280F]">
            {settings?.storeName || 'Nusantara'}
          </span>
        </button>

        {/* Zone 2: Primary Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6" aria-label="Navigasi Utama">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavClick(item.target, item.label)}
              className={`text-sm font-medium whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors cursor-pointer ${
                item.active
                  ? 'text-[#54280F] border-[#C99A45]'
                  : 'text-[#54280F]/75 border-transparent hover:text-[#54280F] hover:border-[#C99A45]/50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Action Cluster */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((prev) => !prev)}
            aria-label="Cari produk"
            className="p-2.5 rounded-lg text-[#54280F] hover:bg-[#54280F]/8 transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              onClick={() => onNavigate({ page: 'admin' })}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#C99A45]/20 text-[#54280F] hover:bg-[#C99A45]/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Admin
            </button>
          )}

          <button
            type="button"
            onClick={() => (user ? onNavigate({ page: 'orders' }) : onOpenAuth())}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-[#54280F] hover:bg-[#54280F]/8 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserIcon className="w-4 h-4" />
            <span className="max-w-[90px] truncate">{user ? user.name.split(' ')[0] : 'Masuk'}</span>
          </button>

          <button
            type="button"
            onClick={onOpenCart}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-[#54280F] text-white hover:bg-[#7A3E16] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Keranjang</span>
            <span className="font-mono-num text-xs bg-[#C99A45] text-[#111111] px-1.5 py-0.5 rounded">
              {cartCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Menu navigasi"
            className="lg:hidden p-2 rounded-lg text-[#54280F] hover:bg-[#54280F]/8 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expandable Search Bar */}
      {searchOpen && (
        <div className="border-t border-[#54280F]/10 bg-white px-4 sm:px-6 py-3">
          <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari baju, rok, batik tulis, atau motif Bungong Jeumpa..."
              autoFocus
              className="flex-1 px-4 py-2.5 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
            />
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Cari
            </button>
          </form>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-[#54280F]/10 bg-[#FFF4E8] px-4 py-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => handleNavClick(item.target, item.label)}
              className={`block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer ${
                item.active ? 'bg-[#54280F] text-white' : 'text-[#54280F] hover:bg-[#54280F]/8'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setMobileMenuOpen(false);
              onNavigate({ page: 'admin' });
            }}
            className="block w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#7A3E16] hover:bg-[#54280F]/8 cursor-pointer"
          >
            Portal Admin
          </button>
        </div>
      )}
    </header>
  );
};
