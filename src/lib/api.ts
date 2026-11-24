// Token sesi disimpan hanya di memori JS (tidak pernah di localStorage)
let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');

  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatDateId(isoString: string): string {
  if (!isoString) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatShortDateId(isoString: string): string {
  if (!isoString) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function buildWhatsAppLink(whatsappNumber: string, text: string): string | null {
  const digits = (whatsappNumber || '').replace(/[^0-9]/g, '');
  if (!digits || digits.length < 9 || whatsappNumber.includes('BELUM_DIKONFIGURASI')) {
    return null;
  }
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
