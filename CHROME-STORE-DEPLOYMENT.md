# Chrome Web Store v0.4.0 Deployment Checklist

**Status:** Ready for submission ✅  
**Date:** 2026-08-03  
**Version:** 0.4.0

---

## Pre-Submission Verification ✅

- [x] **LISTING.md** updated to v0.4
- [x] **Screenshots** (4×): 1280×800 PNG format
  - `chrome-store/screenshot-1-tkgm.png`
  - `chrome-store/screenshot-2-eplan.png`
  - `chrome-store/screenshot-3-ai.png`
  - `chrome-store/screenshot-4-emsal.png`
- [x] **Promo tiles** (2×):
  - `chrome-store/promo-tile-440x280.png`
  - `chrome-store/promo-tile-1400x560.png`
- [x] **Icon-128**: `public/icon-128.png`
- [x] **Manifest.json** v3 compliant
  - `scripting` permission: admin build only (VITE_SCRAPING_ENABLED=false for store)
  - All host permissions justified
- [x] **Privacy Policy URL**: https://cadastrum.com.tr/gizlilik
- [x] **Support URL**: https://cadastrum.com.tr/iletisim
- [x] **Homepage**: https://cadastrum.com.tr

---

## Local Build & ZIP Creation

**Prerequisite:** Node.js + npm installed

```bash
cd c:/Users/eparl/Downloads/cadastrum

# Step 1: Build for Chrome Web Store (excludes scripting permission)
npm run build:store

# Step 2: Create ZIP file
npm run zip:store

# Output: chrome-store/cadastrum-v0.4.0-store.zip
```

**Expected output:**
```
✓ Store zip hazır: C:\Users\eparl\Downloads\cadastrum\chrome-store\cadastrum-v0.4.0-store.zip
```

---

## Chrome Web Store Submission

### 1. Developer Dashboard Login
- URL: https://chrome.google.com/webstore/devconsole
- Email: cadastrum.dev@gmail.com (or registered developer account)

### 2. Upload Extension

**Dashboard Steps:**
1. Click "New Item" → Upload ZIP
2. Select: `cadastrum-v0.4.0-store.zip`
3. Wait for validation (usually instant)

### 3. Fill Store Listing

**Item name (max 75 char):**
```
Cadastrum — Arsa & TKGM Parsel Zekâsı
```

**Summary (max 132 char):**
```
TKGM resmi parsel doğrulama, e-Plan imar sorgusu ve AI fiyat tahmini — Sahibinden ve Hepsiemlak ilanları için tek tıkla.
```

**Category:** Productivity

**Language:** Turkish (primary)

**Detailed Description:** Use LISTING.md content (lines 37–143)

**Privacy Policy URL:**
```
https://cadastrum.com.tr/gizlilik
```

**Support URL:**
```
https://cadastrum.com.tr/iletisim
```

**Homepage:**
```
https://cadastrum.com.tr
```

### 4. Upload Assets

**Icon (128×128):**
- File: `public/icon-128.png`

**Promo Tiles:**
- Small (440×280): `chrome-store/promo-tile-440x280.png`
- Marquee (1400×560): `chrome-store/promo-tile-1400x560.png` (optional)

**Screenshots (1280×800, max 5):**
1. `chrome-store/screenshot-1-tkgm.png`
2. `chrome-store/screenshot-2-eplan.png`
3. `chrome-store/screenshot-3-ai.png`
4. `chrome-store/screenshot-4-emsal.png`

### 5. Permissions Justification

**Single Purpose:**
```
Türkiye gayrimenkul ilanlarını (Sahibinden, Hepsiemlak) TKGM resmi parsel
verisi ve e-Plan imar bilgisi ile zenginleştirip AI destekli fiyat tahmini
sunan side panel uzantısı.
```

**sidePanel:** Analiz sonuçlarını yan panelde göstermek için.

**storage:** Kullanıcı ayarları ve cache (24 saat) için.

**contextMenus:** Sağ tık menüsünden parsel sorgusu başlatmak için.

**alarms:** Periyodik veri yenileme (24 saatte bir).

**declarativeNetRequest:** TKGM API'si cross-origin header düzenlemesi.

**Host permissions:** TKGM, e-Plan, Sahibinden, Hepsiemlak, OpenStreetMap, TCMB, Open-Meteo, AFAD, Cadastrum API.

**Remote code:** NO

### 6. Pricing & Distribution

**Distribution:** Public

**Pricing:** Free (+ optional Pro/Pro+ in-app subscription via LemonSqueezy)

---

## Review Timeline

| Phase | Duration | Notes |
|-------|----------|-------|
| Automated validation | Instant | ZIP format, manifest check |
| Manual review | 1-3 days | First submission (longer) |
| Subsequent updates | 1-24 hours | Faster for existing listings |

---

## Post-Submission

### After Approval (1-3 days)

1. **Check CWS Dashboard** for approval notification
2. **Copy extension URL** (e.g., `https://chrome.google.com/webstore/detail/cadastrum-arsa-tkgm-pars...`)
3. **Update marketing:**
   - Add to site footer
   - Add to README
   - Social media announcement

### Monitoring

- **CWS Dashboard** → Reviews & ratings section
- **Sentry** → Error tracking
- **Backend logs** → API usage metrics

---

## Rollback / Updates

**If rejection occurs:**
- Fix issues per feedback
- Increment version in `package.json` (e.g., 0.4.1)
- Rebuild: `npm run build:store`
- Rezip: `npm run zip:store`
- Resubmit via dashboard

**For future updates:**
1. Update version in `package.json`
2. Run `npm run release:store`
3. Upload new ZIP via dashboard
4. Review process repeats (1-24 hours)

---

## Success Criteria ✅

- [ ] ZIP successfully created
- [ ] CWS submission accepted (validation pass)
- [ ] Manual review completed
- [ ] Extension published & public
- [ ] URL added to marketing
- [ ] First user feedback received

---

## Contact

**Issues/Questions:**
- Email: iletisim@cadastrum.com.tr
- Site: https://cadastrum.com.tr
- Dashboard: https://chrome.google.com/webstore/devconsole

**Version:** 0.4.0  
**Last Updated:** 2026-08-03 08:30 UTC+3
