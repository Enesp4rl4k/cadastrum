# 🚀 Cadastrum Lansman Günü Kit — Tek Tıkla Hazır

Chrome Web Store onayı geldiği anda bu sırayla yap. Toplam 30 dakika.

---

## ADIM 1 — Site CTA'larını Aç (2 dk)

`site/src/config/launch.ts` dosyasında **tek satır** değiştir:

```ts
export const LAUNCHED = true;  // false → true
```

Deploy:
```cmd
cd C:\Users\parlak\Downloads\arsa-tkgm-extension\site
npm run build
npx wrangler pages deploy dist --project-name=cadastrum-site --branch=main --commit-dirty=true
```

✅ Hero "Erken erişim al" → "Chrome'a ekle" olur
✅ /fiyat sayfası Free CTA → Chrome Store URL
✅ Tüm sayfalardaki kütle CTA + bento grid + footer otomatik güncellenir

---

## ADIM 2 — Newsletter Blast (3 dk)

Admin paneline gir → POST endpoint hazır: `/v1/admin/newsletter-blast`

### Önce TEST: kendine gönder
```bash
curl -X POST https://api.cadastrum.com.tr/v1/admin/newsletter-blast \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d @launch-email.json
```

Test=true ile sadece sana gider. Tamam görünürse:

### Sonra gerçek blast (waitlist'in tümüne)
Aynı isteği `"test": false` ile gönder → tüm aboneler alır.

### `launch-email.json` içeriği:
```json
{
  "konu": "🚀 Cadastrum Chrome Web Store'da — ERKEN100 ile %40 indirim",
  "test": true,
  "metin": "Cadastrum bugün Chrome Web Store'da canlıya çıktı! İlk 100 üyeye 6 ay %40 indirim. Kod: ERKEN100. Yükle: https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej",
  "html": "<see HTML below>"
}
```

### HTML email (kopyala-yapıştır)

```html
<!DOCTYPE html>
<html><body style="margin:0;font-family:Inter,sans-serif;background:#F8FAFC;">
  <table align="center" width="600" cellpadding="0" cellspacing="0" style="background:#FFF;border-radius:12px;overflow:hidden;margin:40px auto;box-shadow:0 4px 24px rgba(15,26,51,.08);">
    <tr><td style="background:linear-gradient(135deg,#1B2A4A,#0F1A33);padding:48px 40px;text-align:center;">
      <h1 style="color:#FFF;font-family:Georgia,serif;font-size:32px;margin:0 0 12px;">🚀 Cadastrum Canlıda!</h1>
      <p style="color:#C9A86A;font-size:14px;letter-spacing:2px;margin:0;">CHROME WEB STORE'DA YAYINDA</p>
    </td></tr>
    <tr><td style="padding:40px;">
      <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">Merhaba,</p>
      <p style="color:#334155;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Erken erişim listesine katıldığın için teşekkürler — <strong>Cadastrum bugün Chrome Web Store'da yayınlandı</strong>.
        Sahibinden ve Hepsiemlak ilanlarını TKGM ile doğrulayan, e-Plan imar çeken ve AI fiyat tahmini sunan Chrome eklentisi artık herkese açık.
      </p>
      <table align="center" cellpadding="0" cellspacing="0" style="margin:32px auto;">
        <tr><td style="background:#1B2A4A;border-radius:8px;padding:16px 32px;">
          <a href="https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej" style="color:#FFF;text-decoration:none;font-weight:600;font-size:15px;">Chrome'a Ekle, Ücretsiz →</a>
        </td></tr>
      </table>
      <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin:24px 0;text-align:center;">
        <p style="color:#92400E;font-size:14px;margin:0;font-weight:500;">
          🎁 İlk 100 üyeye özel: <code style="background:#FFF;padding:2px 8px;border-radius:4px;font-weight:700;">ERKEN100</code> kodu ile <strong>6 ay %40 indirim</strong>
        </p>
      </div>
      <hr style="border:0;border-top:1px solid #E2E8F0;margin:32px 0;">
      <p style="color:#64748B;font-size:14px;line-height:1.6;margin:0 0 12px;"><strong>Ne yapıyor?</strong></p>
      <ul style="color:#64748B;font-size:14px;line-height:1.8;margin:0;padding-left:20px;">
        <li>🗺️ TKGM resmi parsel doğrulama (sahte ilan tespiti)</li>
        <li>📐 e-Plan imar otomatik (TAKS, Emsal, kullanım kararı)</li>
        <li>🤖 65.000 mahalle AI fiyat baseline</li>
        <li>📊 Sahibinden + Hepsiemlak canlı emsal medyanı</li>
        <li>⚠️ AFAD deprem + taşkın risk analizi</li>
      </ul>
      <p style="color:#334155;font-size:14px;line-height:1.6;margin:32px 0 0;">
        Geri bildirim için: <a href="mailto:iletisim@cadastrum.com.tr" style="color:#1B2A4A;">iletisim@cadastrum.com.tr</a>
      </p>
      <p style="color:#334155;font-size:14px;margin:24px 0 0;">— Enes Parlak<br><span style="color:#94A3B8;">Cadastrum kurucusu</span></p>
    </td></tr>
    <tr><td style="background:#C9A86A;padding:12px;text-align:center;">
      <p style="color:#1B2A4A;font-size:12px;margin:0;font-weight:600;">cadastrum.com.tr</p>
    </td></tr>
  </table>
</body></html>
```

---

## ADIM 3 — Twitter Launch Thread (5 dk)

@cadastrum hesabından sırayla bu 6 tweet'i at (1-2 dakika ara ile, thread olarak — reply chain):

### Tweet 1 (Ana tweet — pinned yap)
```
🚀 Cadastrum bugün Chrome Web Store'da canlıya çıktı.

Türkiye gayrimenkul yatırımcısı için Chrome eklentisi:
✓ TKGM resmi parsel doğrulama
✓ e-Plan imar otomatik
✓ AI fiyat tahmini (65k mahalle)
✓ Sahibinden + Hepsiemlak akışında

İlk 100 üyeye ERKEN100 ile %40 indirim 👇

https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej
```

### Tweet 2 (Problem — reply)
```
Türkiye'de arsa alacaksanız 5 farklı sekme açıp 10 dakika harcıyorsunuz:

1️⃣ TKGM Parsel Sorgu (sahte mi?)
2️⃣ e-Plan İmar (TAKS/Emsal?)
3️⃣ Sahibinden mahalle emsali
4️⃣ Hepsiemlak ilan karşılaştırma
5️⃣ Hesap makinesi

Her ilan için tekrar.

Bu işin tek tıkla olması lazım. 🧵
```

### Tweet 3 (Çözüm)
```
Cadastrum açıkken Sahibinden ilanına girersin.

Yan panelde otomatik:
✅ TKGM kayıt + ada/parsel/alan/nitelik
✅ e-Plan imar (TAKS, Emsal, kullanım)
✅ Mahalle medyan (canlı ilan verisi)
✅ AI fiyat aralığı
✅ Deprem zonu + taşkın risk

Saniyeler içinde. Yan panel kapansa bile veriler kaybolmaz.
```

### Tweet 4 (Veri şeffaflığı)
```
Her şeyin temeli VERİ:

📊 65.000 mahalle AI baseline (Gemini 2.5 Flash + KNN)
📈 TCMB Konut Endeksi (planlı)
🗺️ AFAD deprem zon haritası
🌊 Çevre Bakanlığı taşkın riski
🚀 Lojistik skor (devlet yolu/havalimanı)

Hepsi resmi kaynaklar. Hiçbiri black box değil — metodoloji açık.
```

### Tweet 5 (Fiyat)
```
Free plan:
✓ TKGM doğrulama sınırsız
✓ e-Plan imar
✓ 5 il (İstanbul/Ankara/İzmir/Antalya/Muğla)
✓ Günde 3 AI sorgu

Pro: ₺499/ay
✓ Tüm 81 il (957 ilçe, 65k mahalle)
✓ Sınırsız AI
✓ PDF rapor
✓ Mahalle profili + trend

ERKEN100 → 6 ay %40 indirim (ilk 100 kişiye)
```

### Tweet 6 (CTA + topluluk)
```
Chrome eklenti:
👉 https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej

Web sitesi:
👉 cadastrum.com.tr

Bu projeyi tek başıma yaptım. Türkiye gayrimenkul piyasasına şeffaflık getirmek için. Geri bildirim için DM açık.

🇹🇷 Beraber Türkiye gayrimenkulüne şeffaflık getirelim.
```

---

## ADIM 4 — LinkedIn Post (3 dk)

LinkedIn'e (kişisel profil) yapıştır:

```
🚀 Bir yıllık çalışmanın sonucu — Cadastrum bugün Chrome Web Store'da canlıya çıktı.

Türkiye'de arsa/konut yatırımı yapacak herkes için Chrome eklentisi.

Sahibinden veya Hepsiemlak'ta bir ilan açtığınızda otomatik olarak:

✅ TKGM resmi parsel doğrulama (sahte ilan tespiti)
✅ e-Plan imar sorgusu (TAKS, Emsal, kullanım kararı)
✅ AI fiyat tahmini (65.000 mahalle baseline)
✅ Mahalle bazlı emsal (canlı ilan medyanı)
✅ AFAD deprem + Çevre Bakanlığı taşkın risk

Eskiden 5 sekme açıp 15 dakika harcadığım iş, ilan açar açmaz yan panelde otomatik tamamlanıyor. Karar verme süresi saniyelere indi.

Türkiye gayrimenkul sektörüne şeffaflık getirmek için solo geliştirildi.

🔗 cadastrum.com.tr
🎁 ERKEN100 ile 6 ay %40 indirim — ilk 100 üye için
👇 Chrome'a ekle: https://chromewebstore.google.com/detail/cadastrum-arsa-tkgm-parsel-zekasi/aelbnillaapmecnopkoojcolecbdhiej

Yorum + paylaşımlarınızla destek olmanız çok kıymetli. Geri bildirimi DM ile alabilirim.

#gayrimenkul #emlak #TKGM #parsel #yatırım #PropTech #ChromeExtension #Türkiye #SaaS
```

---

## ADIM 5 — Site Pinned Bildirimi (1 dk)

İsteğe bağlı — site'de tepe banner: "🚀 Cadastrum Chrome Web Store'da. ERKEN100 ile %40 indirim."

`site/src/components/Header.astro` üstüne ekle (zaten dogrulama-band var, benzeri).

---

## ADIM 6 — Sosyal Medya Hesaplar (5 dk)

- Twitter `@cadastrum` profilini güncelle: pinned tweet'i değiştir (yeni launch tweet)
- Bio'da "🚀 Chrome Web Store'da yayında" sat satır ekle
- LinkedIn kişisel profil bio güncelle: "Cadastrum kurucusu — Chrome Web Store'da yayında"
- Github profili: README'de Cadastrum mention + link

---

## ADIM 7 — Yakın Çevre (10 dk)

WhatsApp gruplarına bilgi at:
```
Selam, son bir yıldır üzerinde çalıştığım proje bugün Chrome Web Store'da
canlıya çıktı. Cadastrum — Sahibinden/Hepsiemlak ilanlarını TKGM ile
doğrulayan eklenti.

Yüklerseniz ve 5 dakika denerseniz çok kıymetli geri bildirim olur 🙏

cadastrum.com.tr
```

Aile + arkadaş + iş çevresi gruplarına. ~20-50 kişi minimum sosyal kanıt.

---

## ADIM 8 — Reddit (10 dk)

r/Turkce ve r/Turkey'de **"Show TR"** tarzı post:

```
[Show TR] Türkiye gayrimenkul yatırımcısı için Chrome eklentisi yaptım

Selamlar! Solo geliştirici olarak son bir yıldır üzerinde çalıştığım
projeyi paylaşmak istedim.

Cadastrum — Sahibinden/Hepsiemlak ilanlarını otomatik:
• TKGM ile doğrular (sahte ilan tespiti)
• e-Plan'dan imar çeker (TAKS, Emsal, kullanım)
• Mahalle medyan fiyatı gösterir (65k mahalle baseline)
• AI ile fiyat aralığı tahmin eder

cadastrum.com.tr — ücretsiz versiyon var, Pro %40 indirimli.

Geri bildirim için DM/yorum açık.
```

Spam değil çünkü gerçekten yararlı + "Show" tag legitim.

---

## ✅ TOPLAM ZAMAN: 30 DAKİKA

Bu kit ile lansman günü çok organize geçecek. Her şey hazır, sadece **LAUNCHED = true** yapmaya kalıyor.
