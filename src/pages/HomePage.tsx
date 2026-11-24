import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, ShieldCheck, Sparkles, Star, Truck } from 'lucide-react';
import type { Category, Product, ProductReview, StoreSettings } from '../types';
import type { RoutePath } from '../components/Navbar';
import { ProductCard } from '../components/ProductCard';
import { apiRequest } from '../lib/api';

interface HomePageProps {
  categories: Category[];
  settings: StoreSettings | null;
  onNavigate: (r: RoutePath) => void;
  onQuickAdd: (p: Product) => Promise<void>;
  addingId: string | null;
}

const FAQS = [
  {
    q: 'Bagaimana cara membeli produk di Nusantara?',
    a: 'Pilih produk dan varian ukuran yang diinginkan, tambahkan ke keranjang, lalu lanjutkan ke halaman Checkout. Setelah pesanan tercatat di sistem, unggah bukti transfer atau konfirmasi via WhatsApp resmi toko.',
  },
  {
    q: 'Apakah sistem pembayaran sudah otomatis atau transfer manual?',
    a: 'Saat ini pembayaran menggunakan transfer bank manual dan verifikasi resmi oleh admin toko agar keamanan transaksi terjaga. Arsitektur pembayaran juga telah disiapkan untuk integrasi payment gateway di masa mendatang.',
  },
  {
    q: 'Bagaimana cara melacak status pesanan saya?',
    a: 'Masuk ke akun Anda lalu buka halaman Lacak Pesanan untuk melihat riwayat status, verifikasi pembayaran, kurir pengiriman, dan nomor resi secara real-time.',
  },
  {
    q: 'Apakah motif dan produk Nusantara terjamin kualitasnya?',
    a: 'Kami menghadirkan busana dan kerajinan bernuansa motif khas Aceh seperti Pintu Aceh, Bungong Jeumpa, Pucuk Rebung, dan Rencong dengan informasi bahan serta perawatan yang transparan.',
  },
];

export const HomePage: React.FC<HomePageProps> = ({
  categories,
  settings,
  onNavigate,
  onQuickAdd,
  addingId,
}) => {
  const [newest, setNewest] = useState<Product[]>([]);
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [newRes, bestRes, revRes] = await Promise.all([
          apiRequest<{ products: Product[] }>('/api/products?sort=newest&limit=4'),
          apiRequest<{ products: Product[] }>('/api/products?sort=bestseller&limit=4'),
          apiRequest<{ reviews: ProductReview[] }>('/api/reviews/featured'),
        ]);
        if (!active) return;
        setNewest(newRes.products);
        setBestsellers(bestRes.products);
        setReviews(revRes.reviews);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  const heroImage = settings?.bannerUrl || '/api/storage/files/seed-hero-nusantara';

  return (
    <div>
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-[#54280F] text-white">
        <img
          src={heroImage}
          alt="Koleksi Batik dan Kerajinan Nusantara khas Aceh"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-45"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#54280F]/95 via-[#54280F]/80 to-[#54280F]/45"
          aria-hidden="true"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="max-w-2xl space-y-5">
            <p className="text-xs sm:text-sm font-medium tracking-wide text-[#C99A45]">
              {settings?.tagline || 'Kerajinan & Batik Aceh untuk Dunia'}
            </p>
            <h1 className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] text-white text-balance">
              Pesona Batik Aceh untuk Dunia
            </h1>
            <p className="text-base sm:text-lg text-[#FFF4E8]/90 leading-relaxed max-w-xl">
              Menghadirkan keindahan motif Pintu Aceh, Bungong Jeumpa, Pucuk Rebung, dan karya kerajinan tradisional dalam busana serta aksesori elegan.
            </p>
            <div className="pt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate({ page: 'catalog' })}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#C99A45] text-[#111111] font-bold text-sm rounded-lg hover:bg-[#d8ab59] transition-colors cursor-pointer"
              >
                Jelajahi Koleksi
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate({ page: 'about' })}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-white/10 text-white border border-white/25 font-semibold text-sm rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
              >
                Kisah Nusantara
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Kategori Unggulan */}
      <section id="kategori-unggulan" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#54280F]">
              Kategori Pilihan
            </h2>
            <p className="text-sm text-[#7A3E16]/85 mt-1">
              Telusuri 7 kategori busana, kain, dan kerajinan bernuansa Aceh.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'catalog' })}
            className="text-sm font-semibold text-[#7A3E16] hover:text-[#54280F] inline-flex items-center gap-1 cursor-pointer"
          >
            Lihat seluruh katalog
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => onNavigate({ page: 'catalog', category: cat.slug })}
              className="group bg-white border border-[#54280F]/12 rounded-xl p-4 text-center flex flex-col items-center justify-center gap-2 hover:border-[#C99A45] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              <span className="text-2xl" aria-hidden="true">
                {cat.symbol || '❋'}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-[#54280F] group-hover:text-[#7A3E16] leading-snug">
                {cat.name}
              </span>
              <span className="text-[11px] text-[#737373] font-mono-num">
                {cat.productCount} produk
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Produk Terbaru */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#54280F]">
              Koleksi Terbaru
            </h2>
            <p className="text-sm text-[#7A3E16]/85 mt-1">
              Karya terbaru dengan stok terpantau langsung dari database toko.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'catalog' })}
            className="text-sm font-semibold text-[#7A3E16] hover:text-[#54280F] cursor-pointer"
          >
            Semua produk
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 rounded-xl bg-white/70 border border-[#54280F]/10 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {newest.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onSelect={(slug) => onNavigate({ page: 'product', slug })}
                onQuickAdd={onQuickAdd}
                adding={addingId === p.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Produk Terlaris */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#54280F]">
              Produk Terlaris
            </h2>
            <p className="text-sm text-[#7A3E16]/85 mt-1">
              Pilihan favorit pelanggan untuk acara formal maupun keseharian.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {bestsellers.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onSelect={(slug) => onNavigate({ page: 'product', slug })}
              onQuickAdd={onQuickAdd}
              adding={addingId === p.id}
            />
          ))}
        </div>
      </section>

      {/* Keunggulan & Tentang */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-12">
          <div className="bg-white border border-[#54280F]/12 rounded-xl p-6 space-y-2">
            <Sparkles className="w-6 h-6 text-[#C99A45]" />
            <h3 className="font-serif-display text-lg font-bold text-[#54280F]">
              Motif Autentik Bernuansa Aceh
            </h3>
            <p className="text-sm text-[#54280F]/80 leading-relaxed">
              Mengangkat filosofi motif Bungong Jeumpa, Pintu Aceh, Pucuk Rebung, dan Rencong dalam desain modern.
            </p>
          </div>
          <div className="bg-white border border-[#54280F]/12 rounded-xl p-6 space-y-2">
            <ShieldCheck className="w-6 h-6 text-[#C99A45]" />
            <h3 className="font-serif-display text-lg font-bold text-[#54280F]">
              Transaksi & Stok Terproteksi
            </h3>
            <p className="text-sm text-[#54280F]/80 leading-relaxed">
              Perhitungan harga, validasi kupon, verifikasi pembayaran, dan pengurangan stok dilakukan aman di server.
            </p>
          </div>
          <div className="bg-white border border-[#54280F]/12 rounded-xl p-6 space-y-2">
            <Truck className="w-6 h-6 text-[#C99A45]" />
            <h3 className="font-serif-display text-lg font-bold text-[#54280F]">
              Pengiriman Terlacak
            </h3>
            <p className="text-sm text-[#54280F]/80 leading-relaxed">
              Pantau setiap tahapan konfirmasi, verifikasi pembayaran, hingga nomor resi pengiriman dari akun Anda.
            </p>
          </div>
        </div>

        {/* Testimoni Nyata */}
        <div className="bg-white border border-[#54280F]/12 rounded-2xl p-6 sm:p-8 mb-12">
          <h2 className="font-serif-display text-2xl font-bold text-[#54280F] mb-2">
            Ulasan Pelanggan Terverifikasi
          </h2>
          <p className="text-sm text-[#7A3E16]/80 mb-6">
            Ulasan di bawah hanya berasal dari pelanggan yang telah menyelesaikan pembelian terverifikasi.
          </p>

          {reviews.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#FFF4E8]/60 border border-[#54280F]/10 text-sm text-[#54280F]/80">
              Belum ada ulasan pembeli yang dipublikasikan. Pelanggan yang telah menyelesaikan transaksi dapat menuliskan ulasan langsung pada halaman detail produk.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {reviews.map((rev) => (
                <div key={rev.id} className="p-5 rounded-xl bg-[#FFF4E8]/50 border border-[#54280F]/12 space-y-2">
                  <div className="flex items-center gap-1 text-[#C99A45]">
                    {Array.from({ length: rev.rating }).map((_, idx) => (
                      <Star key={idx} className="w-4 h-4 fill-current" />
                    ))}
                  </div>
                  <p className="text-sm text-[#111111] leading-relaxed">“{rev.comment}”</p>
                  <div className="text-xs text-[#7A3E16] pt-1">
                    <span className="font-semibold">{rev.author_name}</span>
                    {rev.product_name && <span> · {rev.product_name}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FAQ Singkat */}
        <div className="max-w-3xl mx-auto">
          <h2 className="font-serif-display text-2xl font-bold text-[#54280F] text-center mb-6">
            Pertanyaan Umum
          </h2>
          <div className="space-y-3">
            {FAQS.map((item, idx) => (
              <div key={idx} className="bg-white border border-[#54280F]/12 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left text-sm font-semibold text-[#54280F] cursor-pointer"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform ${openFaq === idx ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-4 text-sm text-[#111111]/80 leading-relaxed border-t border-[#54280F]/10 pt-3">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
