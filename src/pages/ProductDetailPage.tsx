import React, { useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, ShoppingBag, Star } from 'lucide-react';
import type { OrderRecord, Product, User } from '../types';
import type { RoutePath } from '../components/Navbar';
import { apiRequest, formatRupiah, formatShortDateId } from '../lib/api';

interface ProductDetailPageProps {
  slug: string;
  user: User | null;
  onNavigate: (r: RoutePath) => void;
  onAddToCart: (productId: string, variantId: string | null, quantity: number) => Promise<void>;
  onOpenAuth: () => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  slug,
  user,
  onNavigate,
  onAddToCart,
  onOpenAuth,
}) => {
  const [product, setProduct] = useState<Product | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const [eligibleOrders, setEligibleOrders] = useState<OrderRecord[]>([]);
  const [reviewOrderId, setReviewOrderId] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewMsg, setReviewMsg] = useState('');

  const loadProduct = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiRequest<{ product: Product }>(`/api/products/${encodeURIComponent(slug)}`);
      setProduct(res.product);
      setActiveImage(res.product.images?.[0]?.url || res.product.primaryImageUrl);
      const firstAvail = res.product.variants.find((v) => v.stock > 0) || res.product.variants[0] || null;
      setSelectedVariantId(firstAvail ? firstAvail.id : null);
      setQuantity(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Produk tidak ditemukan.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProduct();
  }, [slug]);

  useEffect(() => {
    if (!user || !product) {
      setEligibleOrders([]);
      return;
    }
    apiRequest<{ orders: OrderRecord[] }>('/api/orders')
      .then((res) => {
        const matching = res.orders.filter(
          (o) =>
            (o.orderStatus === 'Pesanan selesai' || o.paymentStatus === 'Dibayar') &&
            o.items.some((it) => it.product_id === product.id)
        );
        setEligibleOrders(matching);
        if (matching[0]) setReviewOrderId(matching[0].id);
      })
      .catch(() => {});
  }, [user, product?.id]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="h-96 bg-white rounded-2xl border border-[#54280F]/10 animate-pulse" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">Produk Tidak Ditemukan</h1>
        <p className="text-sm text-[#7A3E16]">{error}</p>
        <button
          type="button"
          onClick={() => onNavigate({ page: 'catalog' })}
          className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
        >
          Kembali ke Katalog
        </button>
      </div>
    );
  }

  const activeVariant = product.variants.find((v) => v.id === selectedVariantId) || null;
  const maxStock = activeVariant ? Math.min(product.stock, activeVariant.stock) : product.stock;
  const basePrice = product.discountPrice ?? product.price;
  const effectivePrice = Math.max(0, basePrice + (activeVariant?.price_adjustment || 0));
  const hasDiscount = product.discountPrice !== null && product.discountPrice < product.price;

  const handleAdd = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    setAdding(true);
    try {
      await onAddToCart(product.id, selectedVariantId, quantity);
    } finally {
      setAdding(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setReviewMsg('');
    try {
      await apiRequest(`/api/products/${product.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          orderId: reviewOrderId,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      setReviewComment('');
      setReviewMsg('Terima kasih! Ulasan terverifikasi Anda telah diterbitkan.');
      await loadProduct();
    } catch (err) {
      setReviewMsg(err instanceof Error ? err.message : 'Gagal mengirim ulasan.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <button
        type="button"
        onClick={() => onNavigate({ page: 'catalog' })}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7A3E16] hover:text-[#54280F] mb-6 cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Katalog
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sticky Gallery */}
        <div className="lg:col-span-6 space-y-3 lg:sticky lg:top-24">
          <div className="aspect-[4/3] bg-white border border-[#54280F]/12 rounded-2xl overflow-hidden">
            {activeImage ? (
              <img
                src={activeImage}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#C99A45] text-4xl">❋</div>
            )}
          </div>

          {product.images && product.images.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {product.images.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImage(img.url)}
                  className={`aspect-[4/3] rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    activeImage === img.url ? 'border-[#54280F]' : 'border-transparent opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={img.altText}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Contiguous Purchase Module */}
        <div className="lg:col-span-6 bg-white border border-[#54280F]/12 rounded-2xl p-6 sm:p-8 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#7A3E16] mb-2">
              <span className="font-semibold">{product.categoryName}</span>
              <span aria-hidden="true">·</span>
              <span>{product.motif}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">SKU: {activeVariant?.sku || product.sku}</span>
            </div>
            <h1 className="font-serif-display text-2xl sm:text-3xl font-bold text-[#111111] leading-tight">
              {product.name}
            </h1>
          </div>

          <div className="flex items-baseline gap-3 pb-4 border-b border-[#54280F]/10">
            <span className="font-mono-num text-2xl sm:text-3xl font-bold text-[#54280F]">
              {formatRupiah(effectivePrice)}
            </span>
            {hasDiscount && (
              <span className="font-mono-num text-base text-[#737373] line-through">
                {formatRupiah(product.price + (activeVariant?.price_adjustment || 0))}
              </span>
            )}
          </div>

          <p className="text-sm text-[#111111]/85 leading-relaxed">{product.description}</p>

          {/* Variant Picker */}
          {product.variants.length > 0 && (
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-[#54280F]">
                Pilihan Ukuran & Warna
              </label>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={v.stock <= 0}
                    onClick={() => {
                      setSelectedVariantId(v.id);
                      setQuantity(1);
                    }}
                    className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                      selectedVariantId === v.id
                        ? 'bg-[#54280F] text-white border-[#54280F]'
                        : 'bg-[#FFF4E8]/50 text-[#54280F] border-[#54280F]/20 hover:border-[#54280F]'
                    }`}
                  >
                    {v.size} · {v.color} ({v.stock})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity & Stock */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div>
              <span className="block text-xs font-bold text-[#54280F] mb-1.5">Jumlah Pembelian</span>
              <div className="inline-flex items-center border border-[#54280F]/25 rounded-lg bg-[#FFF4E8]/40">
                <button
                  type="button"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="p-2.5 text-[#54280F] disabled:opacity-40 cursor-pointer"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-4 text-sm font-mono-num font-bold text-[#111111]">{quantity}</span>
                <button
                  type="button"
                  disabled={quantity >= maxStock}
                  onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                  className="p-2.5 text-[#54280F] disabled:opacity-40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="text-right">
              <span className="block text-xs text-[#7A3E16]">Ketersediaan</span>
              <span className="font-mono-num text-sm font-bold text-[#54280F]">
                {maxStock > 0 ? `${maxStock} unit tersedia` : 'Stok habis'}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={maxStock <= 0 || adding}
            onClick={handleAdd}
            className="w-full py-3.5 px-6 bg-[#54280F] text-white font-semibold text-sm rounded-xl hover:bg-[#7A3E16] disabled:opacity-45 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            {adding ? 'Menambahkan ke Keranjang...' : 'Tambah ke Keranjang'}
          </button>

          <div className="pt-4 border-t border-[#54280F]/10 space-y-3 text-xs text-[#54280F]/85">
            <div>
              <span className="font-bold text-[#54280F]">Bahan: </span>
              <span>{product.material}</span>
            </div>
            <div>
              <span className="font-bold text-[#54280F]">Perawatan: </span>
              <span>{product.careInstructions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Reviews */}
      <section className="mt-14 bg-white border border-[#54280F]/12 rounded-2xl p-6 sm:p-8">
        <h2 className="font-serif-display text-2xl font-bold text-[#54280F] mb-4">
          Ulasan Pembeli ({product.reviews?.length || 0})
        </h2>

        {eligibleOrders.length > 0 && (
          <form onSubmit={handleReviewSubmit} className="mb-8 p-5 rounded-xl bg-[#FFF4E8]/60 border border-[#54280F]/15 space-y-3">
            <h3 className="text-sm font-bold text-[#54280F]">Tulis Ulasan Pembeli Terverifikasi</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Pesanan Terkait</label>
                <select
                  value={reviewOrderId}
                  onChange={(e) => setReviewOrderId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#54280F]/20 rounded-lg"
                >
                  {eligibleOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNumber} ({formatShortDateId(o.createdAt)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Penilaian</label>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#54280F]/20 rounded-lg"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>
                      {n} Bintang
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Komentar Ulasan</label>
              <textarea
                rows={2}
                required
                minLength={5}
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="Ceritakan pengalaman kualitas bahan, motif, dan pengiriman..."
                className="w-full px-3 py-2 text-sm bg-white border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Kirim Ulasan
            </button>
            {reviewMsg && <p className="text-xs font-medium text-[#7A3E16]">{reviewMsg}</p>}
          </form>
        )}

        {!product.reviews || product.reviews.length === 0 ? (
          <p className="text-sm text-[#7A3E16]/80">Belum ada ulasan untuk produk ini.</p>
        ) : (
          <div className="space-y-4">
            {product.reviews.map((rev) => (
              <div key={rev.id} className="pb-4 border-b border-[#54280F]/10 last:border-b-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-sm font-semibold text-[#111111]">{rev.author_name}</span>
                  <span className="text-xs text-[#737373]">{formatShortDateId(rev.created_at)}</span>
                </div>
                <div className="flex items-center gap-1 text-[#C99A45] mb-1.5">
                  {Array.from({ length: rev.rating }).map((_, idx) => (
                    <Star key={idx} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-sm text-[#111111]/85">{rev.comment}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Related Products */}
      {product.related && product.related.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif-display text-2xl font-bold text-[#54280F] mb-6">
            Produk Terkait
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {product.related.map((rel) => (
              <button
                key={rel.id}
                type="button"
                onClick={() => onNavigate({ page: 'product', slug: rel.slug })}
                className="bg-white border border-[#54280F]/12 rounded-xl overflow-hidden text-left hover:-translate-y-0.5 transition-transform cursor-pointer"
              >
                <div className="aspect-[4/3] bg-[#FFF4E8]">
                  {rel.primaryImageUrl && (
                    <img
                      src={rel.primaryImageUrl}
                      alt={rel.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-3.5">
                  <div className="text-xs text-[#7A3E16]">{rel.motif}</div>
                  <div className="font-serif-display text-sm font-bold text-[#111111] mt-0.5 line-clamp-1">
                    {rel.name}
                  </div>
                  <div className="font-mono-num text-sm font-bold text-[#54280F] mt-1">
                    {formatRupiah(rel.discountPrice ?? rel.price)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
