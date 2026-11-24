import React from 'react';
import type { StoreSettings } from '../types';
import type { RoutePath } from './Navbar';
import { buildWhatsAppLink } from '../lib/api';

interface FooterProps {
  settings: StoreSettings | null;
  onNavigate: (r: RoutePath) => void;
}

export const Footer: React.FC<FooterProps> = ({ settings, onNavigate }) => {
  const waNumber = settings?.whatsapp || 'BELUM_DIKONFIGURASI';
  const waUrl = buildWhatsAppLink(waNumber, 'Halo Nusantara, saya ingin bertanya tentang koleksi batik & kerajinan Aceh.');
  const email = settings?.email || 'syaharaninajwa01@gmail.com';
  const ig = settings?.instagram || '@syana.lbs';
  const tiktok = settings?.tiktok || '@syana.lbs';

  return (
    <footer className="bg-[#54280F] text-[#FFF4E8] mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <h3 className="font-serif-display text-xl font-bold text-[#C99A45] mb-3">
            ❋ {settings?.storeName || 'Nusantara'}
          </h3>
          <p className="text-sm text-[#FFF4E8]/85 leading-relaxed mb-3">
            {settings?.tagline || 'Kerajinan & Batik Aceh untuk Dunia.'}
          </p>
          <p className="text-xs text-[#FFF4E8]/70 leading-relaxed">
            {settings?.storeAddress || 'Banda Aceh, Aceh — Indonesia'}
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-[#C99A45] mb-3">Navigasi</h4>
          <ul className="space-y-2 text-sm text-[#FFF4E8]/85">
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'home' })} className="hover:text-white cursor-pointer">
                Beranda
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'catalog' })} className="hover:text-white cursor-pointer">
                Katalog Produk
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'about' })} className="hover:text-white cursor-pointer">
                Tentang Kami
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'orders' })} className="hover:text-white cursor-pointer">
                Lacak Pesanan
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-[#C99A45] mb-3">Bantuan & Kebijakan</h4>
          <ul className="space-y-2 text-sm text-[#FFF4E8]/85">
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'contact' })} className="hover:text-white cursor-pointer">
                Kontak & FAQ
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'checkout' })} className="hover:text-white cursor-pointer">
                Pembayaran & Pengiriman
              </button>
            </li>
            <li>
              <button type="button" onClick={() => onNavigate({ page: 'admin' })} className="hover:text-white cursor-pointer">
                Portal Admin
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-[#C99A45] mb-3">Hubungi Kami</h4>
          <ul className="space-y-2 text-sm text-[#FFF4E8]/85">
            <li>
              Email:{' '}
              <a href={`mailto:${email}`} className="underline hover:text-white">
                {email}
              </a>
            </li>
            <li>
              Instagram:{' '}
              <a
                href="https://www.instagram.com/syana.lbs/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                {ig}
              </a>
            </li>
            <li>
              TikTok:{' '}
              <a
                href="https://www.tiktok.com/@syana.lbs"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white"
              >
                {tiktok}
              </a>
            </li>
            <li>
              WhatsApp:{' '}
              {waUrl ? (
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                  {waNumber}
                </a>
              ) : (
                <span className="text-[#FFF4E8]/65">Belum dikonfigurasi admin</span>
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/15 py-4 px-4 text-center text-xs text-[#FFF4E8]/70">
        © {new Date().getFullYear()} {settings?.storeName || 'Nusantara'}. Kerajinan & Batik Aceh untuk Dunia.
      </div>
    </footer>
  );
};
