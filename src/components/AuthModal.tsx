import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import type { User } from '../types';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onClose, onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email: email.trim(), password }
          : { name: name.trim(), email: email.trim(), phone: phone.trim(), password };

      const res = await apiRequest<{ token: string; user: User }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setAuthToken(res.token);
      onSuccess(res.user);
      onClose();
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Autentikasi gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="bg-[#FFF4E8] border border-[#54280F]/20 rounded-2xl w-full max-w-md p-6 relative shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup dialog"
          className="absolute right-4 top-4 p-1.5 rounded-lg text-[#54280F] hover:bg-[#54280F]/10 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 text-[#7A3E16] text-xs font-medium mb-1">
          <Lock className="w-3.5 h-3.5" />
          <span>Autentikasi Terenkripsi</span>
        </div>
        <h2 id="auth-modal-title" className="font-serif-display text-2xl font-bold text-[#54280F] mb-5">
          {mode === 'login' ? 'Masuk ke Nusantara' : 'Daftar Akun Pelanggan'}
        </h2>

        <div className="grid grid-cols-2 gap-1 p-1 bg-white border border-[#54280F]/15 rounded-lg mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError('');
            }}
            className={`py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'login' ? 'bg-[#54280F] text-white' : 'text-[#54280F] hover:bg-[#FFF4E8]'
            }`}
          >
            Masuk
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError('');
            }}
            className={`py-2 text-sm font-semibold rounded-md transition-colors cursor-pointer ${
              mode === 'register' ? 'bg-[#54280F] text-white' : 'text-[#54280F] hover:bg-[#FFF4E8]'
            }`}
          >
            Daftar
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1.5">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Siti Rahmah"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#54280F] mb-1.5">Nomor WhatsApp</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0812xxxxxxxx"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#54280F] mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#54280F] mb-1.5">
              Kata Sandi {mode === 'register' ? '(minimal 8 karakter)' : ''}
            </label>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#54280F]/20 rounded-lg focus:outline-none focus:border-[#7A3E16]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-[#54280F] text-white text-sm font-semibold rounded-lg hover:bg-[#7A3E16] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk ke Akun' : 'Buat Akun Pelanggan'}
          </button>
        </form>

        <p className="mt-4 text-xs text-[#54280F]/75 leading-relaxed">
          Akun Anda disimpan aman di database server dengan hashing kata sandi scrypt dan sesi terverifikasi.
        </p>
      </div>
    </div>
  );
};
