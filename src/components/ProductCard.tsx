import React, { useState } from 'react';
import { Eye, ShoppingCart } from 'lucide-react';
import type { Product } from '../types';
import { formatRupiah } from '../lib/api';

interface ProductCardProps {
  product: Product;
  onSelect: (slug: string) => void;
  onQuickAdd: (product: Product) => void;
  adding?: boolean;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onQuickAdd,
  adding = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const effectivePrice = product.discountPrice ?? product.price;
  const hasDiscount = product.discountPrice !== null && product.discountPrice < product.price;
  const outOfStock = product.stock <= 0;

  return (
    <article className="group bg-white border border-[#54280F]/12 rounded-xl overflow-hidden flex flex-col transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onSelect(product.slug)}
        className="relative w-full aspect-[4/3] bg-[#FFF4E8] overflow-hidden text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#C99A45]"
      >
        {product.primaryImageUrl && !imgError ? (
          <img
            src={product.primaryImageUrl}
            alt={product.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-[#FFF4E8] to-[#F1D8BC] text-[#54280F]">
            <span className="text-3xl mb-2" aria-hidden="true">
              ❋
            </span>
            <span className="text-xs font-medium text-center line-clamp-2">{product.name}</span>
          </div>
        )}
      </button>

      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Clean unboxed metadata (zero-pill rule) */}
        <div className="flex items-center gap-1.5 text-xs text-[#7A3E16] truncate">
          <span className="font-medium truncate">{product.categoryName}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate text-[#7A3E16]/80">{product.motif}</span>
        </div>

        <h3 className="font-serif-display text-base font-bold text-[#111111] leading-snug line-clamp-2 min-h-[2.75rem]">
          <button
            type="button"
            onClick={() => onSelect(product.slug)}
            className="text-left hover:text-[#7A3E16] transition-colors cursor-pointer"
          >
            {product.name}
          </button>
        </h3>

        <div className="flex items-baseline gap-2 mt-auto pt-1">
          <span className="font-mono-num text-base font-bold text-[#54280F]">
            {formatRupiah(effectivePrice)}
          </span>
          {hasDiscount && (
            <span className="font-mono-num text-xs text-[#737373] line-through">
              {formatRupiah(product.price)}
            </span>
          )}
        </div>

        <div className="text-xs text-[#54280F]/75 tabular-nums">
          {outOfStock ? (
            <span className="text-red-700 font-medium">Stok habis</span>
          ) : (
            <span>Stok tersedia: {product.stock}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => onSelect(product.slug)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold border border-[#54280F]/25 text-[#54280F] rounded-lg hover:bg-[#FFF4E8] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            Detail
          </button>
          <button
            type="button"
            disabled={outOfStock || adding}
            onClick={() => onQuickAdd(product)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#54280F] text-white rounded-lg hover:bg-[#7A3E16] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            {adding ? 'Menambah...' : 'Keranjang'}
          </button>
        </div>
      </div>
    </article>
  );
};
