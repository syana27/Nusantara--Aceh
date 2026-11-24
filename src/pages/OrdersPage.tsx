import React, { useEffect, useState } from 'react';
import { LogOut, MapPin, Package, Search, Trash2, UploadCloud, User as UserIcon } from 'lucide-react';
import type { Address, OrderRecord, User } from '../types';
import { apiRequest, formatDateId, formatRupiah, setAuthToken } from '../lib/api';

interface OrdersPageProps {
  user: User | null;
  initialOrderNumber?: string;
  onUserChange: (u: User | null) => void;
  onOpenAuth: () => void;
}

export const OrdersPage: React.FC<OrdersPageProps> = ({
  user,
  initialOrderNumber = '',
  onUserChange,
  onOpenAuth,
}) => {
  const [tab, setTab] = useState<'orders' | 'profile'>('orders');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [searchNum, setSearchNum] = useState(initialOrderNumber);
  const [searchErr, setSearchErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofRef, setProofRef] = useState('');
  const [proofStatus, setProofStatus] = useState('');

  const [profileName, setProfileName] = useState(user?.name || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [profileMsg, setProfileMsg] = useState('');

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [newAddr, setNewAddr] = useState({
    recipientName: '',
    phone: '',
    addressLine: '',
    province: '',
    city: '',
    district: '',
    postalCode: '',
  });

  const loadAccountData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [ordRes, addrRes] = await Promise.all([
        apiRequest<{ orders: OrderRecord[] }>('/api/orders'),
        apiRequest<{ addresses: Address[] }>('/api/account/addresses'),
      ]);
      setOrders(ordRes.orders);
      setAddresses(addrRes.addresses);
      if (initialOrderNumber) {
        const match = ordRes.orders.find(
          (o) => o.orderNumber.toUpperCase() === initialOrderNumber.toUpperCase()
        );
        if (match) setSelectedOrder(match);
      } else if (ordRes.orders[0] && !selectedOrder) {
        setSelectedOrder(ordRes.orders[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      setProfileName(user.name);
      setProfilePhone(user.phone);
      loadAccountData();
    }
  }, [user]);

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center space-y-4">
        <Package className="w-10 h-10 text-[#54280F] mx-auto" />
        <h1 className="font-serif-display text-2xl font-bold text-[#54280F]">
          Masuk untuk Melacak Pesanan
        </h1>
        <p className="text-sm text-[#7A3E16]">
          Demi keamanan privasi Anda, detail pesanan dan riwayat transaksi hanya dapat dilihat oleh pemilik akun atau admin terverifikasi.
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="px-6 py-3 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
        >
          Masuk ke Akun
        </button>
      </div>
    );
  }

  const handleTrackSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchErr('');
    if (!searchNum.trim()) return;
    try {
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/orders/${encodeURIComponent(searchNum.trim())}`
      );
      setSelectedOrder(res.order);
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : 'Pesanan tidak ditemukan.');
    }
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !proofFile) return;
    setProofStatus('');
    try {
      const fd = new FormData();
      fd.append('proof', proofFile);
      fd.append('paymentReference', proofRef);
      const res = await apiRequest<{ order: OrderRecord }>(
        `/api/orders/${encodeURIComponent(selectedOrder.orderNumber)}/payment-proof`,
        { method: 'POST', body: fd }
      );
      setSelectedOrder(res.order);
      setProofFile(null);
      setProofRef('');
      setProofStatus('Bukti transfer berhasil diunggah.');
      await loadAccountData();
    } catch (err) {
      setProofStatus(err instanceof Error ? err.message : 'Gagal mengunggah bukti.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    try {
      const res = await apiRequest<{ user: User }>('/api/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: profileName, phone: profilePhone }),
      });
      onUserChange(res.user);
      setProfileMsg('Profil berhasil diperbarui.');
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Gagal memperbarui profil.');
    }
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/account/addresses', {
        method: 'POST',
        body: JSON.stringify(newAddr),
      });
      setNewAddr({
        recipientName: '',
        phone: '',
        addressLine: '',
        province: '',
        city: '',
        district: '',
        postalCode: '',
      });
      await loadAccountData();
    } catch {}
  };

  const handleDeleteAddress = async (id: string) => {
    await apiRequest(`/api/account/addresses/${id}`, { method: 'DELETE' });
    await loadAccountData();
  };

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' });
    setAuthToken(null);
    onUserChange(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-3xl font-bold text-[#54280F]">
            Akun & Lacak Pesanan
          </h1>
          <p className="text-sm text-[#7A3E16] mt-1">
            Masuk sebagai <span className="font-semibold">{user.name}</span> ({user.email})
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('orders')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
              tab === 'orders' ? 'bg-[#54280F] text-white border-[#54280F]' : 'bg-white text-[#54280F] border-[#54280F]/20'
            }`}
          >
            Pesanan Saya ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg border cursor-pointer ${
              tab === 'profile' ? 'bg-[#54280F] text-white border-[#54280F]' : 'bg-white text-[#54280F] border-[#54280F]/20'
            }`}
          >
            Profil & Alamat
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </div>

      {tab === 'orders' ? (
        <div className="space-y-6">
          <form onSubmit={handleTrackSearch} className="bg-white border border-[#54280F]/12 rounded-xl p-4 flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#737373] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchNum}
                onChange={(e) => setSearchNum(e.target.value)}
                placeholder="Masukkan nomor pesanan (misal: NS-261124-...)"
                className="w-full pl-9 pr-3 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2 bg-[#54280F] text-white text-sm font-semibold rounded-lg cursor-pointer"
            >
              Lacak Pesanan
            </button>
            {searchErr && <p className="w-full text-xs text-red-700 font-medium">{searchErr}</p>}
          </form>

          {loading ? (
            <div className="h-48 bg-white rounded-xl animate-pulse" />
          ) : orders.length === 0 ? (
            <div className="bg-white border border-[#54280F]/12 rounded-2xl p-10 text-center text-sm text-[#7A3E16]">
              Anda belum memiliki riwayat pesanan.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5 space-y-3">
                {orders.map((ord) => (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => setSelectedOrder(ord)}
                    className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                      selectedOrder?.id === ord.id
                        ? 'bg-white border-[#54280F] shadow-sm'
                        : 'bg-white/75 border-[#54280F]/12 hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-num text-sm font-bold text-[#54280F]">{ord.orderNumber}</span>
                      <span className="text-xs font-semibold text-[#7A3E16]">{ord.orderStatus}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#737373] mt-1.5">
                      <span>{formatDateId(ord.createdAt)}</span>
                      <span className="font-mono-num font-bold text-[#111111]">
                        {formatRupiah(ord.totalAmount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {selectedOrder && (
                <div className="lg:col-span-7 bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-[#54280F]/10">
                    <div>
                      <span className="text-xs text-[#7A3E16]">Detail Transaksi</span>
                      <h2 className="font-mono-num text-xl font-bold text-[#54280F]">
                        {selectedOrder.orderNumber}
                      </h2>
                      <p className="text-xs text-[#737373] mt-0.5">{formatDateId(selectedOrder.createdAt)}</p>
                    </div>
                    <div className="text-right text-xs space-y-1">
                      <div>
                        Status Pesanan:{' '}
                        <span className="font-bold text-[#54280F]">{selectedOrder.orderStatus}</span>
                      </div>
                      <div>
                        Pembayaran:{' '}
                        <span className="font-bold text-[#7A3E16]">{selectedOrder.paymentStatus}</span>
                      </div>
                    </div>
                  </div>

                  {/* Produk */}
                  <div className="space-y-2.5">
                    {selectedOrder.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between gap-3 text-sm">
                        <div>
                          <div className="font-semibold text-[#111111]">{it.product_name_snapshot}</div>
                          <div className="text-xs text-[#7A3E16]">
                            {it.variant_snapshot} · {it.quantity} × {formatRupiah(it.unit_price)}
                          </div>
                        </div>
                        <div className="font-mono-num font-bold text-[#54280F]">{formatRupiah(it.subtotal)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl bg-[#FFF4E8]/60 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Subtotal Produk</span>
                      <span className="font-mono-num font-semibold">{formatRupiah(selectedOrder.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Ongkos Kirim</span>
                      <span className="font-mono-num font-semibold">{formatRupiah(selectedOrder.shippingCost)}</span>
                    </div>
                    {selectedOrder.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Diskon Kupon</span>
                        <span className="font-mono-num font-semibold">-{formatRupiah(selectedOrder.discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-bold text-[#54280F] pt-1.5 border-t border-[#54280F]/15">
                      <span>Total Pembayaran</span>
                      <span className="font-mono-num">{formatRupiah(selectedOrder.totalAmount)}</span>
                    </div>
                  </div>

                  {/* Pengiriman & Resi */}
                  {selectedOrder.shipment && (
                    <div className="p-4 rounded-xl border border-[#54280F]/15 text-xs space-y-1">
                      <div className="font-bold text-[#54280F]">Informasi Pengiriman</div>
                      <div>
                        Kurir: {selectedOrder.shipment.courier_name || 'Menunggu konfirmasi'}{' '}
                        {selectedOrder.shipment.service_name ? `(${selectedOrder.shipment.service_name})` : ''}
                      </div>
                      <div>
                        Nomor Resi:{' '}
                        <span className="font-mono-num font-bold">
                          {selectedOrder.shipment.tracking_number || 'Belum tersedia'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Upload bukti jika belum dibayar */}
                  {selectedOrder.paymentStatus !== 'Dibayar' && selectedOrder.orderStatus !== 'Pesanan dibatalkan' && (
                    <form onSubmit={handleUploadProof} className="p-4 rounded-xl border border-[#54280F]/15 space-y-2.5">
                      <div className="text-xs font-bold text-[#54280F] flex items-center gap-1.5">
                        <UploadCloud className="w-4 h-4" />
                        Unggah / Perbarui Bukti Transfer
                      </div>
                      <input
                        type="text"
                        value={proofRef}
                        onChange={(e) => setProofRef(e.target.value)}
                        placeholder="Catatan referensi transfer..."
                        className="w-full px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                      />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        className="block w-full text-xs text-[#54280F]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
                      >
                        Kirim Bukti Transfer
                      </button>
                      {proofStatus && <p className="text-xs text-[#7A3E16] font-medium">{proofStatus}</p>}
                    </form>
                  )}

                  {/* Riwayat Status */}
                  <div>
                    <h3 className="text-xs font-bold text-[#54280F] mb-2">Riwayat Status Pesanan</h3>
                    <div className="space-y-2">
                      {selectedOrder.history.map((h) => (
                        <div key={h.id} className="text-xs flex justify-between gap-2 pb-2 border-b border-[#54280F]/8">
                          <div>
                            <span className="font-semibold text-[#54280F]">{h.new_status}</span>
                            {h.note && <p className="text-[#737373] mt-0.5">{h.note}</p>}
                          </div>
                          <span className="text-[#737373] shrink-0">{formatDateId(h.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveProfile} className="lg:col-span-5 bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-4">
            <h2 className="font-serif-display text-xl font-bold text-[#54280F] flex items-center gap-2">
              <UserIcon className="w-5 h-5" />
              Profil Pelanggan
            </h2>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nama Lengkap</label>
              <input
                type="text"
                required
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Nomor WhatsApp</label>
              <input
                type="tel"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#54280F] mb-1">Email</label>
              <input
                type="email"
                disabled
                value={user.email}
                className="w-full px-3.5 py-2 text-sm bg-gray-100 border border-[#54280F]/15 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#54280F] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              Simpan Perubahan
            </button>
            {profileMsg && <p className="text-xs text-emerald-700 font-medium">{profileMsg}</p>}
          </form>

          <div className="lg:col-span-7 bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-5">
            <h2 className="font-serif-display text-xl font-bold text-[#54280F] flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Daftar Alamat Pengiriman
            </h2>

            {addresses.length === 0 ? (
              <p className="text-xs text-[#737373]">Belum ada alamat tersimpan.</p>
            ) : (
              <div className="space-y-3">
                {addresses.map((a) => (
                  <div key={a.id} className="p-3.5 rounded-xl border border-[#54280F]/15 flex justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-[#111111]">
                        {a.recipient_name} · {a.phone}
                      </div>
                      <div className="text-[#54280F]/80 mt-0.5">
                        {a.address_line}, {a.district}, {a.city}, {a.province} {a.postal_code}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteAddress(a.id)}
                      className="text-red-700 p-1.5 hover:bg-red-50 rounded cursor-pointer self-start"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddAddress} className="pt-4 border-t border-[#54280F]/10 space-y-3">
              <h3 className="text-xs font-bold text-[#54280F]">Tambah Alamat Baru</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  required
                  placeholder="Nama penerima"
                  value={newAddr.recipientName}
                  onChange={(e) => setNewAddr({ ...newAddr, recipientName: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
                <input
                  required
                  placeholder="Nomor WhatsApp"
                  value={newAddr.phone}
                  onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
                <input
                  required
                  placeholder="Provinsi"
                  value={newAddr.province}
                  onChange={(e) => setNewAddr({ ...newAddr, province: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
                <input
                  required
                  placeholder="Kota / Kabupaten"
                  value={newAddr.city}
                  onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
                <input
                  required
                  placeholder="Kecamatan"
                  value={newAddr.district}
                  onChange={(e) => setNewAddr({ ...newAddr, district: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
                <input
                  required
                  placeholder="Kode Pos"
                  value={newAddr.postalCode}
                  onChange={(e) => setNewAddr({ ...newAddr, postalCode: e.target.value })}
                  className="px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
                />
              </div>
              <textarea
                required
                rows={2}
                placeholder="Alamat lengkap (jalan, nomor rumah, RT/RW)"
                value={newAddr.addressLine}
                onChange={(e) => setNewAddr({ ...newAddr, addressLine: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#FFF4E8]/40 border border-[#54280F]/20 rounded-lg"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#7A3E16] text-white text-xs font-semibold rounded-lg cursor-pointer"
              >
                Simpan Alamat
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
