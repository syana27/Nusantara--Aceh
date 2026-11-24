import React from 'react';
import { Mail, MapPin, MessageCircle } from 'lucide-react';
import type { StoreSettings } from '../types';
import { buildWhatsAppLink } from '../lib/api';

export const AboutPage: React.FC<{ settings: StoreSettings | null }> = ({ settings }) => (
  <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
    <div className="bg-white border border-[#54280F]/12 rounded-2xl p-8 sm:p-10 space-y-5">
      <p className="text-xs font-semibold text-[#C99A45]">Profil & Nilai Budaya</p>
      <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#54280F]">
        Tentang {settings?.storeName || 'Nusantara'}
      </h1>
      <p className="text-base text-[#111111]/85 leading-relaxed">
        <strong>Nusantara – Kerajinan & Batik Aceh untuk Dunia</strong> lahir dari tekad memperkenalkan kekayaan wastra, motif klasik, dan kriya khas Tanah Rencong ke panggung nasional maupun internasional dalam wujud busana serta aksesori modern.
      </p>
      <p className="text-base text-[#111111]/85 leading-relaxed">
        Setiap helai motif seperti <em>Bungong Jeumpa</em> (lambang keanggunan dan kesucian), <em>Pintu Aceh</em> (simbol keterbukaan dan kerendahan hati), <em>Pucuk Rebung</em> (pertumbuhan yang berakar kuat), serta <em>Rencong</em> membawa cerita budaya Aceh yang diadaptasi agar nyaman dikenakan pada aktivitas keseharian maupun acara resmi.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="p-4 rounded-xl bg-[#FFF4E8] border border-[#54280F]/10">
          <h2 className="font-serif-display text-lg font-bold text-[#54280F] mb-1">Misi Budaya</h2>
          <p className="text-xs text-[#54280F]/85 leading-relaxed">
            Melestarikan ragam motif Aceh agar dikenal lintas generasi dan masyarakat di luar Aceh.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#FFF4E8] border border-[#54280F]/10">
          <h2 className="font-serif-display text-lg font-bold text-[#54280F] mb-1">Kualitas & Transparansi</h2>
          <p className="text-xs text-[#54280F]/85 leading-relaxed">
            Menyediakan informasi bahan, perawatan, stok nyata, dan alur pemesanan yang jujur serta aman.
          </p>
        </div>
        <div className="p-4 rounded-xl bg-[#FFF4E8] border border-[#54280F]/10">
          <h2 className="font-serif-display text-lg font-bold text-[#54280F] mb-1">Siap Mendunia</h2>
          <p className="text-xs text-[#54280F]/85 leading-relaxed">
            Mendukung pemesanan bagi pelanggan lokal, wisatawan, dan pecinta batik tradisional di mana saja.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export const ContactPage: React.FC<{ settings: StoreSettings | null }> = ({ settings }) => {
  const email = settings?.email || 'syaharaninajwa01@gmail.com';
  const ig = settings?.instagram || '@syana.lbs';
  const tiktok = settings?.tiktok || '@syana.lbs';
  const waNumber = settings?.whatsapp || 'BELUM_DIKONFIGURASI';
  const waUrl = buildWhatsAppLink(waNumber, 'Halo Nusantara, saya ingin berkonsultasi mengenai produk.');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div>
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#54280F]">
          Kontak & FAQ Nusantara
        </h1>
        <p className="text-sm text-[#7A3E16] mt-1">
          Hubungi kami melalui kanal resmi atau baca panduan pemesanan sebelum bertransaksi.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-3">
          <h2 className="font-serif-display text-xl font-bold text-[#54280F]">Kanal Resmi</h2>
          <div className="space-y-2 text-sm text-[#111111]">
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#7A3E16]" />
              <a href={`mailto:${email}`} className="underline text-[#54280F]">
                {email}
              </a>
            </p>
            <p>
              Instagram:{' '}
              <a
                href="https://www.instagram.com/syana.lbs/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#54280F] font-semibold"
              >
                {ig}
              </a>
            </p>
            <p>
              TikTok:{' '}
              <a
                href="https://www.tiktok.com/@syana.lbs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#54280F] font-semibold"
              >
                {tiktok}
              </a>
            </p>
            <p className="flex items-start gap-2 pt-1 text-xs text-[#737373]">
              <MapPin className="w-4 h-4 shrink-0 text-[#7A3E16]" />
              <span>{settings?.storeAddress}</span>
            </p>
          </div>

          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#54280F] text-white text-xs font-semibold rounded-lg"
            >
              <MessageCircle className="w-4 h-4" />
              Chat WhatsApp ({waNumber})
            </a>
          ) : (
            <div className="p-3 rounded-lg bg-[#FFF4E8] border border-[#54280F]/15 text-xs text-[#7A3E16]">
              Nomor WhatsApp toko belum dikonfigurasi oleh admin melalui Pengaturan Toko.
            </div>
          )}
        </div>

        <div className="bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-3">
          <h2 className="font-serif-display text-xl font-bold text-[#54280F]">Kebijakan Pengiriman</h2>
          <p className="text-sm text-[#111111]/85 leading-relaxed">{settings?.shippingPolicy}</p>
        </div>

        <div className="bg-white border border-[#54280F]/12 rounded-2xl p-6 space-y-3">
          <h2 className="font-serif-display text-xl font-bold text-[#54280F]">Pembatalan & Retur</h2>
          <p className="text-sm text-[#111111]/85 leading-relaxed">{settings?.returnPolicy}</p>
        </div>
      </div>

      <div className="bg-white border border-[#54280F]/12 rounded-2xl p-6 sm:p-8 space-y-4">
        <h2 className="font-serif-display text-2xl font-bold text-[#54280F]">Panduan Lengkap (FAQ)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          <div>
            <h3 className="font-bold text-[#54280F]">1. Cara Membeli Produk</h3>
            <p className="text-[#111111]/80 mt-1">
              Masuk atau daftar akun, pilih produk dan varian ukuran, masukkan ke keranjang, lalu lengkapi alamat pengiriman saat checkout.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-[#54280F]">2. Cara Melakukan Pembayaran</h3>
            <p className="text-[#111111]/80 mt-1">
              Lakukan transfer manual sesuai informasi rekening resmi toko di halaman checkout, lalu unggah foto bukti transfer untuk diverifikasi admin.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-[#54280F]">3. Pilihan Pengiriman</h3>
            <p className="text-[#111111]/80 mt-1">
              Pengiriman melayani seluruh wilayah Indonesia maupun luar negeri. Admin akan menginput jasa kurir, ongkos kirim, dan nomor resi resmi.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-[#54280F]">4. Melacak & Membatalkan Pesanan</h3>
            <p className="text-[#111111]/80 mt-1">
              Buka menu Lacak Pesanan dari akun Anda untuk memantau status terkini. Untuk pembatalan sebelum barang dikirim, hubungi admin via email atau WhatsApp.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
