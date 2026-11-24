import React from 'react';
import { Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { CartState, User } from '../types';
import { formatRupiah } from '../lib/api';

interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
  cart: CartState;
  user: User | null;
  onUpdateQty: (itemId: string, qty: number) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onCheckout: () => void;
  onOpenAuth: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  open,
  onClose,
  cart,
  user,
  onUpdateQty,
  onRemoveItem,
  onCheckout,
  onOpenAuth,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" role="dialog" aria-modal="true" aria-label="Keranjang Belanja">
      <div className="w-full max-w-md bg-[#FFF4E8] h-full flex flex-col shadow-2xl border-l border-[#54280F]/15">
        <div className="px-6 py-4 border-b border-[#54280F]/15 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#54280F]" />
            <h2 className="font-serif-display text-xl font-bold text-[#54280F]">Keranjang Belanja</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup keranjang"
            className="p-1.5 rounded-lg text-[#54280F] hover:bg-[#FFF4E8] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!user ? (
            <div className="bg-white border border-[#54280F]/15 rounded-xl p-6 text-center space-y-3">
              <p className="text-sm text-[#54280F] leading-relaxed">
                Silakan masuk atau daftar akun untuk menyimpan keranjang belanja Anda secara permanen di database.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAuth();
                }}
                className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] cursor-pointer"
              >
                Masuk / Daftar
              </button>
            </div>
          ) : cart.items.length === 0 ? (
            <div className="bg-white border border-[#54280F]/15 rounded-xl p-8 text-center">
              <p className="text-sm text-[#54280F]/75">Keranjang belanja Anda masih kosong.</p>
            </div>
          ) : (
            cart.items.map((item) => (
              <div
                key={item.id}
                className="bg-white border border-[#54280F]/12 rounded-xl p-3.5 flex gap-3.5 items-start"
              >
                <div className="w-20 h-20 rounded-lg bg-[#FFF4E8] overflow-hidden shrink-0 border border-[#54280F]/10">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.productName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[#C99A45]">❋</div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#111111] truncate">{item.productName}</h3>
                  <p className="text-xs text-[#7A3E16] mt-0.5">{item.variantLabel}</p>
                  <p className="font-mono-num text-xs font-semibold text-[#54280F] mt-1">
                    {formatRupiah(item.unitPrice)} × {item.quantity} = {formatRupiah(item.subtotal)}
                  </p>
                  {!item.isAvailable && (
                    <p className="text-xs text-red-700 font-medium mt-1">
                      Stok tersisa hanya {item.availableStock}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2.5">
                    <div className="inline-flex items-center border border-[#54280F]/20 rounded-lg bg-[#FFF4E8]/50">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(item.id, item.quantity - 1)}
                        aria-label="Kurangi jumlah"
                        className="p-1.5 text-[#54280F] hover:bg-[#54280F]/10 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-xs font-mono-num font-bold text-[#111111]">{item.quantity}</span>
                      <button
                        type="button"
                        disabled={item.quantity >= item.availableStock}
                        onClick={() => onUpdateQty(item.id, item.quantity + 1)}
                        aria-label="Tambah jumlah"
                        className="p-1.5 text-[#54280F] hover:bg-[#54280F]/10 disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      aria-label="Hapus item"
                      className="p-1.5 text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {user && cart.items.length > 0 && (
          <div className="p-5 bg-white border-t border-[#54280F]/15 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#54280F]/80">Total Sementara ({cart.totalQuantity} item)</span>
              <span className="font-mono-num text-lg font-bold text-[#54280F]">
                {formatRupiah(cart.subtotal)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onCheckout();
              }}
              className="w-full py-3 px-4 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] transition-colors cursor-pointer"
            >
              Lanjut ke Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
