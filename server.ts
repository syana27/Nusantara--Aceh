import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase } from './server/db.ts';
import { securityHeaders } from './server/security.ts';
import authRouter from './server/routes/auth.ts';
import storefrontRouter from './server/routes/storefront.ts';
import shopRouter from './server/routes/shop.ts';
import adminRouter from './server/routes/admin.ts';

initDatabase();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);
app.use(securityHeaders);
app.use(express.json({ limit: '2mb' }));

// SEO routes
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/admin'].join('\n'));
});

app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host') || 'localhost:3000'}`;
  const products = db.prepare('SELECT slug, updated_at FROM products WHERE is_active = 1').all() as Array<{
    slug: string;
    updated_at: string;
  }>;
  const categories = db.prepare('SELECT slug, updated_at FROM categories WHERE is_active = 1').all() as Array<{
    slug: string;
    updated_at: string;
  }>;

  const urls = [
    `<url><loc>${baseUrl}/</loc><priority>1.0</priority></url>`,
    `<url><loc>${baseUrl}/katalog</loc><priority>0.9</priority></url>`,
    `<url><loc>${baseUrl}/tentang</loc><priority>0.6</priority></url>`,
    `<url><loc>${baseUrl}/kontak</loc><priority>0.6</priority></url>`,
    ...categories.map(
      (c) => `<url><loc>${baseUrl}/katalog?kategori=${encodeURIComponent(c.slug)}</loc><lastmod>${c.updated_at.slice(0, 10)}</lastmod></url>`
    ),
    ...products.map(
      (p) => `<url><loc>${baseUrl}/produk/${encodeURIComponent(p.slug)}</loc><lastmod>${p.updated_at.slice(0, 10)}</lastmod></url>`
    ),
  ];

  res
    .type('application/xml')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});

// API Routes
app.use('/api', authRouter);
app.use('/api', storefrontRouter);
app.use('/api', shopRouter);
app.use('/api/admin', adminRouter);

// API error handler
app.use('/api', (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Ukuran file maksimal 5 MB.' });
    return;
  }
  console.error('[API Error]', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba kembali.' });
});

async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Nusantara full-stack server berjalan di http://${HOST}:${PORT}`);
  });
}

startServer();
