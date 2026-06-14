# Cadastrum Site

Cadastrum tanıtım, fiyatlandırma ve yasal sayfalar — Astro + Tailwind.

## Yapı

```
site/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/   Header, Footer, PricingCard, Step, Row
│   ├── layouts/      Base.astro (meta + head)
│   ├── pages/        index, fiyat, sss, gizlilik, kullanim-sartlari
│   └── styles/       global.css (Tailwind + components)
├── astro.config.mjs
├── tailwind.config.mjs
└── tsconfig.json
```

## Geliştirme

```bash
cd site
npm install
npm run dev      # localhost:4321
npm run build    # dist/ klasörü
npm run preview  # build sonrası önizleme
```

## Deploy (Vercel önerisi)

1. Vercel'de "Import Project" → bu repo
2. **Root directory**: `site`
3. **Framework**: Astro (otomatik tespit)
4. Domain: `cadastrum.com` (veya seçilen)
5. Deploy ettiğinde her push otomatik build

Alternatif: Cloudflare Pages, Netlify — aynı setup.

## Roadmap (Site v1 sonrası)

- [ ] Hero görseli (extension screenshot mock)
- [ ] Demo video (Loom embed) `/demo` sayfası
- [ ] Blog (Astro Content Collections) — TR yatırım/arsa içerikleri için SEO
- [ ] LemonSqueezy buy butonları gerçek URL'lerle (`PROCEED` placeholder'ı değiştir)
- [ ] OG image generation (`/og.png`)
- [ ] Analytics (Plausible/Umami — KVKK dostu)
- [ ] i18n: EN sürüm yatırımcı segmenti için

## ENV (gelecek)

`.env` dosyası eklenecek:

```
PUBLIC_LEMON_SQUEEZY_BIREYSEL=https://...
PUBLIC_LEMON_SQUEEZY_PROFESYONEL=https://...
PUBLIC_CWS_URL=https://chromewebstore.google.com/detail/...
```

`PricingCard.astro` ve `Header.astro` bu değerleri okuyacak.
