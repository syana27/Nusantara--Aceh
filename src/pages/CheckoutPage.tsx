import React, { useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Lock, UploadCloud } from 'lucide-react';
import type { Address, CartState, OrderRecord, StoreSettings, User } from '../types';
import type { RoutePath } from '../components/Navbar';
import { apiRequest, buildWhatsAppLink, formatRupiah } from '../lib/api';

interface CheckoutPageProps {
  user: User | null;
  cart: CartState;
  settings: StoreSettings | null;
  onRefreshCart: () => Promise<void>;
  onNavigate: (r: RoutePath) => void;
  onOpenAuth: () => void;
}

export const CheckoutPage: React.FC<CheckoutPageProps> = ({
  user,
  cart,
  settings,
  onRefreshCart,
  onNavigate,
  onOpenAuth,
}) => {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [recipientName, setRecipientName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [addressLine, setAddressLine] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'transfer_manual' | 'whatsapp_confirm'>('transfer_manual');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number; message: string } | null>(null);
  const [couponError, setCouponError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [createdOrder, setCreatedOrder] = useState<OrderRecord | null>(null);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofMsg, setProofMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    setRecipientName((v) => v || user.name);
    setEmail((v) => v || user.email);
    setPhone((v) => v || user.phone);
    apiRequest<{ addresses: Address[] }>('/api/account/addresses')
      .then((res) => {
        setAddresses(res.addresses);
        const def = res.addresses.find((a) => a.is_default) || res.addresses[0];
        if (def && !addressLine) {
          setRecipientName(def.recipient_name);
          setPhone(def.phone);
          setAddressLine(def.address_line);
          setProvince(def.province);
          setCity(def.city);
          setDistrict(def.district);
          setPostalCode(def.postal_code);
        }
      })
      .catch(() => {});
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <Lock className="w-10 h-10 text-[#54280F] mx-auto" />
        <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">
          Masuk untuk Melanjutkan Checkout
        </h1>
        <p className="text-sm text-[#7A3E16]">
          Transaksi aman Nusantara mengharuskan akun pelanggan terverifikasi agar pesanan dan bukti transfer terlindungi.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-6 py-3 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
        >
          Masuk / Daftar Sekarang
        </button>
      </div>
    );
  }

  if (createdOrder) {
    const waText = `Halo Nusantara, saya telah membuat pesanan ${createdOrder.orderNumber} atas nama ${createdOrder.customerName} senilai ${formatRupiah(createdOrder.totalAmount)}.`;
    const waUrl = buildWhatsAppLink(settings?.whatsapp || '', waText);

    const handleUploadProof = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!proofFile) return;
      setUploadingProof(true);
      setProofMsg('');
      try {
        const fd = new FormData();
        fd.append('proof', proofFile);
        fd.append('paymentReference', paymentReference);
        const res = await apiRequest<{ order: OrderRecord }>(
          `/api/orders/${encodeURIComponent(createdOrder.orderNumber)}/payment-proof`,
          { method: 'POST', body: fd }
        );
        setCreatedOrder(res.order);
        setProofMsg('Bukti transfer berhasil diunggah dan menunggu verifikasi admin.');
      } catch (err) {
        setProofMsg(err instanceof Error ? err.message : 'Gagal mengunggah bukti transfer.');
      } finally {
        setUploadingProof(false);
      }
    };

    return (
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="bg-white border border-[#54280F]/15 rounded-2xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3 text-emerald-700">
            <CheckCircle2 className="w-7 h-7 shrink-0" />
            <div>
              <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">
                Pesanan Berhasil Dibuat
              </h1>
              <p className="text-sm text-[#7A3E16]">
                Nomor Pesanan:{' '}
                <span className="font-mono-num font-bold text-[#111111]">{createdOrder.orderNumber}</span>
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#FFF4E8] border border-[#54280F]/15 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#54280F]/80">Total Pembayaran (terhitung di server)</span>
              <span className="font-mono-num font-bold text-[#54280F]">
                {formatRupiah(createdOrder.totalAmount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#54280F]/80">Status Pembayaran</span>
              <span className="font-semibold text-[#7A3E16]">{createdOrder.paymentStatus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#54280F]/80">Status Pesanan</span>
              <span className="font-semibold text-[#54280F]">{createdOrder.orderStatus}</span>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-[#54280F]/15 space-y-2 text-sm">
            <h2 className="font-bold text-[#54280F]">Instruksi Pembayaran Manual</h2>
            <p className="text-xs text-[#737373]">
              Pembayaran gateway otomatis belum aktif. Silakan lakukan transfer bank manual atau konfirmasi ke admin:
            </p>
            <p className="text-sm font-medium text-[#111111] whitespace-pre-line">
              {settings?.bankInformation}
            </p>
            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg mt-2"
              >
                Konfirmasi via WhatsApp
              </a>
            ) : (
              <p className="text-xs text-amber-800">
                Nomor WhatsApp toko belum dikonfigurasi oleh admin. Silakan unggah bukti transfer di bawah.
              </p>
            )}
          </div>

          <form onSubmit={handleUploadProof} className="p-4 rounded-xl bg-[#FFF4E8]/50 border border-[#54280F]/15 space-y-3">
            <h2 className="text-sm font-bold text-[#54280F] flex items-center gap-2">
              <UploadCloud className="w-4 h-4" />
              Unggah Bukti Transfer (JPG/PNG/WEBP, maks. 5MB)
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Pengirim / Referensi Bank</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Contoh: Transfer BCA a.n. Siti Rahmah"
                className="w-full px-3 py-2 text-sm bg-white border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-[#54280F] file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-[#54280F] file:text-white file:font-semibold cursor-pointer"
              />
            </div>
            <button
              type="submit"
              disabled={uploadingProof || !proofFile}
              className="px-5 py-2.5 bg-[#7A3E16] text-white text-xs font-semibold rounded-lg disabled:opacity-50 cursor-pointer"
            >
              {uploadingProof ? 'Mengunggah...' : 'Kirim Bukti Transfer'}
            </button>
            {proofMsg && <p className="text-xs font-medium text-[#54280F]">{proofMsg}</p>}
          </form>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigate({ page: 'orders', orderNumber: createdOrder.orderNumber })}
              className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Lacak Pesanan Ini
            </button>
            <button
              type="button"
              onClick={() => onNavigate({ page: 'catalog' })}
              className="px-5 py-2.5 border border-[#54280F]/25 text-[#54280F] text-sm font-semibold rounded-lg cursor-pointer"
            >
              Belanja Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleApplyCoupon = async () => {
    setCouponError('');
    setAppliedCoupon(null);
    if (!couponInput.trim()) return;
    try {
      const res = await apiRequest<{ valid: boolean; discount: number; message: string }>('/api/coupons/validate', {
        method: 'POST',
        body: JSON.stringify({ code: couponInput.trim() }),
      });
      setAppliedCoupon({ code: couponInput.trim().toUpperCase(), discount: res.discount, message: res.message });
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Kupon tidak valid.');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiRequest<{ orderNumber: string }>('/api/checkout', {
        method: 'POST',
        body: JSON.stringify({
          recipientName,
          email,
          phone,
          addressLine,
          province,
          city,
          district,
          postalCode,
          customerNote,
          couponCode: appliedCoupon?.code || '',
          paymentMethod,
          saveAddress,
        }),
      });
      await onRefreshCart();
      const orderRes = await apiRequest<{ order: OrderRecord }>(`/api/orders/${encodeURIComponent(res.orderNumber)}`);
      setCreatedOrder(orderRes.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout gagal diproses.');
    } finally {
      setSubmitting(false);
    }
  };

  const discount = appliedCoupon?.discount || 0;
  const estimatedTotal = Math.max(0, cart.subtotal - discount);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="font-serif-display text-3xl font-bold text-[#54280F] mb-6">Checkout Pesanan</h1>

      {cart.items.length === 0 ? (
        <div className="bg-white border border-[#54280F]/15 rounded-2xl p-10 text-center space-y-3">
          <p className="text-sm text-[#7A3E16]">Keranjang Anda masih kosong.</p>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'catalog' })}
            className="px-5 py-2.5 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            Lihat Katalog
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form onSubmit={handleCheckout} className="lg:col-span-7 bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-5">
            {addresses.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-[#54280F] mb-1.5">
                  Pilih dari Alamat Tersimpan
                </label>
                <div className="flex flex-wrap gap-2">
                  {addresses.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setRecipientName(a.recipient_name);
                        setPhone(a.phone);
                        setAddressLine(a.address_line);
                        setProvince(a.province);
                        setCity(a.city);
                        setDistrict(a.district);
                        setPostalCode(a.postal_code);
                      }}
                      className="px-3 py-1.5 text-xs border border-[#54280F]/25 rounded-lg hover:bg-[#FFF4E8] text-[#54280F] cursor-pointer"
                    >
                      {a.recipient_name} · {a.city}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Penerima</label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nomor WhatsApp Aktif</label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Alamat Lengkap</label>
              <textarea
                rows={2}
                required
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Nama jalan, nomor rumah, RT/RW, patokan..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Provinsi</label>
                <input
                  type="text"
                  required
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  placeholder="Aceh"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Kota / Kabupaten</label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Banda Aceh"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Kecamatan</label>
                <input
                  type="text"
                  required
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder="Syiah Kuala"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1">Kode Pos</label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="23111"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Catatan Pesanan (opsional)</label>
              <textarea
                rows={2}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Permintaan ukuran atau catatan pengiriman..."
                className="w-full px-3.5 py-2.5 text-sm bg-[#FFF4E8]/35 border border-[#54280F]/20 rounded-lg"
              />
            </div>

            <div className="space-y-2 pt-2">
              <span className="block text-xs font-bold text-[#54280F]">Metode Pembayaran</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer_manual')}
                  className={`p-3 rounded-xl border text-left text-xs cursor-pointer ${
                    paymentMethod === 'transfer_manual'
                      ? 'border-[#54280F] bg-[#FFF4E8]'
                      : 'border-[#54280F]/20 bg-white'
                  }`}
                >
                  <div className="font-bold text-[#54280F] flex items-center gap-1.5">
                    <CreditCard className="w-4 h-4" />
                    Transfer Bank Manual
                  </div>
                  <div className="text-[#737373] mt-1">Unggah bukti transfer & diverifikasi admin</div>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('whatsapp_confirm')}
                  className={`p-3 rounded-xl border text-left text-xs cursor-pointer ${
                    paymentMethod === 'whatsapp_confirm'
                      ? 'border-[#54280F] bg-[#FFF4E8]'
                      : 'border-[#54280F]/20 bg-white'
                  }`}
                >
                  <div className="font-bold text-[#54280F]">Konfirmasi via WhatsApp</div>
                  <div className="text-[#737373] mt-1">Koordinasi ongkos kirim & transfer langsung</div>
                </button>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-[#54280F] cursor-pointer">
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
                className="accent-[#54280F]"
              />
              Simpan alamat ini ke buku alamat akun saya
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 px-6 bg-[#54280F] text-white text-sm font-semibold rounded-xl hover:bg-[#7A3E16] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Memvalidasi Stok & Membuat Pesanan...' : 'Buat Pesanan Sekarang'}
            </button>
          </form>

          {/* Summary */}
          <aside className="lg:col-span-5 bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-5">
            <h2 className="font-serif-display text-xl font-bold text-[#54280F]">Ringkasan Belanja</h2>

            <div className="space-y-3 divide-y divide-[#54280F]/10">
              {cart.items.map((item) => (
                <div key={item.id} className="pt-3 first:pt-0 flex justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-[#111111] truncate">{item.productName}</div>
                    <div className="text-xs text-[#7A3E16]">
                      {item.variantLabel} · {item.quantity} × {formatRupiah(item.unitPrice)}
                    </div>
                  </div>
                  <div className="font-mono-num font-bold text-[#54280F] shrink-0">
                    {formatRupiah(item.subtotal)}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#54280F]/15 space-y-2">
              <label className="block text-xs font-semibold text-[#54280F]">Kode Kupon (Opsional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Contoh: NUSANTARA10"
                  className="flex-1 px-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg uppercase"
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="px-4 py-2 bg-[#7A3E16] text-white text-xs font-semibold rounded-lg cursor-pointer"
                >
                  Pakai
                </button>
              </div>
              {couponError && <p className="text-xs text-red-700">{couponError}</p>}
              {appliedCoupon && <p className="text-xs text-emerald-700 font-medium">{appliedCoupon.message}</p>}
            </div>

            <div className="pt-4 border-t border-[#54280F]/15 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#54280F]/80">Subtotal</span>
                <span className="font-mono-num font-semibold">{formatRupiah(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#54280F]/80">Ongkos Kirim</span>
                <span className="text-xs text-[#737373]">Dikonfirmasi admin sesuai tujuan</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon Kupon</span>
                  <span className="font-mono-num font-semibold">-{formatRupiah(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#54280F] pt-2 border-t border-[#54280F]/15">
                <span>Total Sementara</span>
                <span className="font-mono-num">{formatRupiah(estimatedTotal)}</span>
              </div>
            </div>

            <p className="text-xs text-[#737373] leading-relaxed">
              Total akhir, validasi kupon, dan pengurangan stok dihitung ulang secara atomik di server saat Anda menekan tombol buat pesanan.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
};
