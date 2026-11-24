import React, { useEffect, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import type { Category, Product } from '../types';
import type { RoutePath } from '../components/Navbar';
import { ProductCard } from '../components/ProductCard';
import { apiRequest } from '../lib/api';

interface CatalogPageProps {
  categories: Category[];
  initialQuery?: string;
  initialCategory?: string;
  onNavigate: (r: RoutePath) => void;
  onQuickAdd: (p: Product) => Promise<void>;
  addingId: string | null;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({
  categories,
  initialQuery = '',
  initialCategory = '',
  onNavigate,
  onQuickAdd,
  addingId,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setQuery(initialQuery);
    setCategory(initialCategory);
    setPage(1);
  }, [initialQuery, initialCategory]);

  useEffect(() => {
    let active = true;
    async function fetchCatalog() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        if (category) params.set('category', category);
        if (minPrice) params.set('minPrice', minPrice);
        if (maxPrice) params.set('maxPrice', maxPrice);
        if (inStockOnly) params.set('inStock', 'true');
        params.set('sort', sort);
        params.set('page', String(page));
        params.set('limit', '12');

        const res = await apiRequest<{
          products: Product[];
          pagination: { total: number; totalPages: number };
        }>(`/api/products?${params.toString()}`);

        if (!active) return;
        setProducts(res.products);
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.totalPages);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Gagal memuat katalog.');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchCatalog();
    return () => {
      active = false;
    };
  }, [query, category, minPrice, maxPrice, inStockOnly, sort, page]);

  const handleReset = () => {
    setQuery('');
    setCategory('');
    setMinPrice('');
    setMaxPrice('');
    setInStockOnly(false);
    setSort('newest');
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-8">
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#54280F]">
          Katalog Nusantara
        </h1>
        <p className="text-sm text-[#7A3E16] mt-1.5">
          Temukan busana batik, kain, selendang, tas sulam, dan kerajinan Aceh langsung dari persediaan toko.
        </p>
      </div>

      {/* Category Quick Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          type="button"
          onClick={() => {
            setCategory('');
            setPage(1);
          }}
          className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
            category === ''
              ? 'bg-[#54280F] text-white border-[#54280F]'
              : 'bg-white text-[#54280F] border-[#54280F]/20 hover:bg-[#FFF4E8]'
          }`}
        >
          Semua Kategori
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setCategory(cat.slug);
              setPage(1);
            }}
            className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
              category === cat.slug
                ? 'bg-[#54280F] text-white border-[#54280F]'
                : 'bg-white text-[#54280F] border-[#54280F]/20 hover:bg-[#FFF4E8]'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-[#54280F]/12 rounded-xl p-4 mb-6 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label className="block text-xs font-semibold text-[#54280F] mb-1">Pencarian Produk</label>
          <div className="relative">
            <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Cari baju, rok, Bungong Jeumpa..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
            />
          </div>
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-[#54280F] mb-1">Harga Min (Rp)</label>
          <input
            type="number"
            min={0}
            value={minPrice}
            onChange={(e) => {
              setMinPrice(e.target.value);
              setPage(1);
            }}
            placeholder="0"
            className="w-full px-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-[#54280F] mb-1">Harga Maks (Rp)</label>
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => {
              setMaxPrice(e.target.value);
              setPage(1);
            }}
            placeholder="1000000"
            className="w-full px-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-xs font-semibold text-[#54280F] mb-1">Urutkan</label>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
          >
            <option value="newest">Terbaru</option>
            <option value="bestseller">Terlaris</option>
            <option value="price_asc">Harga Terendah</option>
            <option value="price_desc">Harga Tertinggi</option>
            <option value="az">Nama A–Z</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center justify-between gap-2">
          <label className="inline-flex items-center gap-2 text-xs font-medium text-[#54280F] cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-[#54280F]/30 accent-[#54280F]"
            />
            Stok tersedia
          </label>
          {(query || category || minPrice || maxPrice || inStockOnly) && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#7A3E16] hover:text-[#54280F] cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-4 text-xs text-[#7A3E16]">
        <span className="font-mono-num">Menampilkan {products.length} dari {total} produk</span>
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="underline font-semibold cursor-pointer"
          >
            Hapus pencarian “{query}”
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-80 rounded-xl bg-white border border-[#54280F]/10 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-dashed border-[#54280F]/25 rounded-2xl p-12 text-center space-y-3">
          <p className="font-serif-display text-xl font-bold text-[#54280F]">Produk tidak ditemukan</p>
          <p className="text-sm text-[#7A3E16]/80">
            Coba kata kunci lain seperti “Baju”, “Rok”, atau “Bungong Jeumpa”, atau kembalikan seluruh katalog.
          </p>
          <button
            type="button"
            onClick={handleReset}
            className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] cursor-pointer"
          >
            Tampilkan Semua Produk
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onSelect={(slug) => onNavigate({ page: 'product', slug })}
                onQuickAdd={onQuickAdd}
                adding={addingId === p.id}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 text-xs font-semibold bg-white border border-[#54280F]/20 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Sebelumnya
              </button>
              <span className="px-3 text-xs font-mono-num text-[#54280F]">
                Halaman {page} dari {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 text-xs font-semibold bg-white border border-[#54280F]/20 rounded-lg disabled:opacity-40 cursor-pointer"
              >
                Berikutnya
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
