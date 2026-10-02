# King Skor — Tasarım Dokümanı

Tarih: 2026-10-02 · Durum: otonom modda yazıldı; "Varsayım" olarak işaretli kararlar kullanıcı tarafından değiştirilebilir.

## 1. Amaç ve bağlam

Arkadaş grubu kendi arasında King (Türk iskambil oyunu, 4 kişi) oynuyor ve skor tutmak için
reklamlı bir mağaza uygulaması kullanıyor. İstenen: reklamsız, sunucusuz, App Store'a
girmeden iPhone'a kurulabilen (ileride Android), sadece grubun kullanacağı bir skor uygulaması.

**Başarı ölçütü:** Masa başında tek telefonla 20 el boyunca skor girmek kağıt-kalemden hızlı ve
hatasız olsun; uygulama kapanınca oyun kaybolmasın; biten oyunlar geçmişte dursun; arkadaşlar
bir link ile kurabilsin.

## 2. Dağıtım kararı: PWA (Progressive Web App) + GitHub Pages

Değerlendirilen üç yol:

| Yol | App Store bypass | Sunucu | Arkadaşlara kurulum | Android | Karar |
|---|---|---|---|---|---|
| **PWA, statik barındırma (GitHub Pages)** | Evet, inceleme yok | Yok (statik dosya) | Link → Safari → Paylaş → Ana Ekrana Ekle | Aynı link, Chrome "Yükle" | **Seçildi** |
| Native sideload (Xcode / AltStore) | Evet | Yok | Ücretsiz hesapta 7 günde bir yeniden imza; ücretli hesapta UDID toplama + manuel kurulum | Ayrı APK | Reddedildi: sürdürülemez |
| TestFlight (Expo/React Native) | Hayır (Apple altyapısı, beta inceleme) | Yok | TestFlight uygulaması, 90 günde build yenileme | Ayrı Play Internal | Reddedildi: bypass değil, bakım yükü |

PWA gerekçesi: tek kod tabanı, offline çalışır, ana ekranda tam ekran ikonlu uygulama gibi
görünür, veri telefonda kalır, güncelleme = repoya push. Sunucu-tarafı mantık yok;
GitHub Pages ücretsiz statik barındırma (hesap: `okavak`). Hedef adres:
`https://okavak.github.io/king-skor/`.

Kısıt: `gh` CLI bu makinede oturum açmamış. Repo yerelde hazır olacak; yayın için tek seferlik
`gh auth login` ve `./deploy.sh` yeterli. Hemen denemek için ayrıca tek dosyalık önizleme
Claude Artifact olarak yayınlanır (PWA özellikleri olmadan, sadece arayüzü görmek için).

## 3. Oyun kuralları (Varsayım A1–A2, kaynaklardan teyitli)

Standart bireysel King, 4 oyuncu, 20 el. Dağıtan oyuncu eli seçer. Her oyuncu 5 el dağıtır:
3 ceza + 2 koz. Her ceza türü toplamda en fazla 2 kez oynanır (6 tür × 2 = 12 ceza, 4 × 2 = 8 koz).

| Tür | Birim | Toplam birim | Puan/birim |
|---|---|---|---|
| El Almaz | el | 13 | −50 |
| Kupa Almaz | kupa | 13 | −30 |
| Erkek Almaz | papaz+vale | 8 | −60 |
| Kız Almaz | kız | 4 | −100 |
| Rıfkı (K♥) | rıfkı | 1 | −320 |
| Son İki | el (12. ve 13.) | 2 | −180 |
| Koz | el | 13 | +50 |

Ceza toplamı 2 × 2600 = 5200, koz toplamı 8 × 650 = 5200 → oyun sonunda genel toplam 0 olmalı
(uygulama bunu tutarlılık kontrolü olarak gösterir).

Oyun akışı notu: ilk eli karo ikilisi olan oyuncu başlatır (skoru etkilemez; uygulama bunu
sadece yeni oyun ekranında kısa ipucu olarak gösterir).

Ayarlanabilir: puan/birim değerleri, kota zorunluluğu (açık/kapalı), "ilk 4 elde koz seçilemez"
ev kuralı (varsayılan kapalı), "King eşiği" (koz elinde bu kadar ve üstü el alan "King yapmış"
sayılır, varsayılan 10; sadece istatistik). Değişiklikler yeni oyunlara uygulanır; devam eden
oyun kurallarının anlık görüntüsünü taşır.

Kapsam dışı (YAGNI): eşli King, ihaleli koz, çoklu cihaz senkronu, hesap/giriş, İngilizce arayüz.

## 4. Mimari

Derleme adımı yok, bağımlılık yok, vanilla HTML/CSS/JS (ES modülleri). Dosyalar:

```
index.html            uygulama kabuğu ve görünüm şablonları
app.css               stiller (CSS değişkenleri, açık/koyu tema, iOS güvenli alanlar)
app.js                arayüz durumu, görünümler, olaylar (rules.js + store.js kullanır)
rules.js              saf puanlama motoru (yan etkisiz, node ile test edilir)
store.js              kalıcılık katmanı (localStorage, şema sürümü, dışa/içe aktarma)
sw.js                 service worker (uygulama kabuğunu önbelleğe alır, offline)
manifest.webmanifest  PWA bildirimi (ad, ikonlar, standalone)
icons/                180/192/512 PNG (+ maskable)
tests/rules.test.js   node:test birim testleri
tests/store.test.js   sahte localStorage ile store testleri
tools/make-icons.py   PIL ile ikon üretimi
tools/bundle.mjs      tek dosyalık önizleme (artifact) üretir
deploy.sh             gh repo create + Pages açma
README.md             Türkçe kurulum ve kullanım
```

### 4.1 Veri modeli

```js
Game {
  id: string, createdAt: ISO, finishedAt: ISO|null,
  players: [string × 4],          // koltuk sırası, saat yönünde
  firstDealer: 0..3,
  rules: RulesConfig,             // oyun başında anlık görüntü
  hands: Hand[]
}
Hand {
  type: 'el'|'kupa'|'erkek'|'kiz'|'rifki'|'soniki'|'koz',
  dealer: 0..3,
  counts: [int × 4],              // birim sayısı; puan değil
  trumpSuit?: 's'|'h'|'d'|'c'     // koz için isteğe bağlı, sadece gösterim
}
RulesConfig {
  pointsPer: { el:-50, kupa:-30, erkek:-60, kiz:-100, rifki:-320, soniki:-180, koz:50 },
  cezaPerPlayer: 3, kozPerPlayer: 2, maxPerCezaType: 2, enforceQuotas: true,
  noKozFirstRound: false,         // ev kuralı: ilk 4 elde koz seçilemez
  kingThreshold: 10               // istatistik: koz elinde >= bu kadar el = "King"
}
```

Gerçek kaynak `counts`'tur; puanlar türetilir (`counts[i] × pointsPer[type]`). Böylece düzenleme,
doğrulama ve kural değişikliği temiz kalır.

### 4.2 rules.js (saf fonksiyonlar)

- `HAND_TYPES`: tür meta verisi (id, Türkçe ad, kısa ad, birim adı, toplam birim, ceza mı)
- `DEFAULT_RULES`
- `handScores(hand, rules) → number[4]`
- `validateCounts(type, counts) → { ok, error }` (tam sayı, 0..toplam, toplam eşit)
- `gameTotals(game) → number[4]`
- `dealerForHand(game, index) → 0..3` = `(firstDealer + index) % 4`
- `quotaState(game) → { cezaLeft[4], kozLeft[4], typeLeft{...}, handsLeft }`
- `availableTypes(game, dealer) → { type, enabled, reason, left }[]` (kota kapalıysa hepsi açık;
  `noKozFirstRound` açıkken ilk 4 elde koz pasif)
- `playerStats(games) → [{ name, games, wins, avgTotal, best, worst, kings }]` (biten oyunlardan)
- `isFinished(game)`
- `standings(game) → [{ seat, total, rank }]` (eşitlikte aynı sıra)
- `summaryText(game) → string` (paylaşım metni)

### 4.3 store.js

localStorage anahtarları: `king:v1:current`, `king:v1:history`, `king:v1:settings`,
`king:v1:names`. Bozuk JSON → güvenli varsayılan + uyarı. `exportAll()`/`importAll(json)` tam yedek.

### 4.4 app.js görünümleri

1. **Ana ekran**: devam eden oyun kartı (oyuncular, el X/20, "Devam et"), "Yeni oyun",
   geçmiş oyunlar listesi (tarih, kazanan, tıkla → salt okunur tablo), ayarlar; standalone
   değilse kapatılabilir "Ana Ekrana Ekle" ipucu.
2. **Yeni oyun**: 4 isim (son oyundan ön dolu, son kullanılan isimler çip olarak), ilk dağıtan
   seçimi veya rastgele, başlat.
3. **Oyun tablosu** (rakip uygulamalarla ortak dil): başlık (el sayacı "7/20", dağıtan rozeti),
   "Basit | Detaylı" geçişi. **Basit**: oyuncu başına satır → 2 daire (koz hakkı) + 3 üçgen (ceza
   hakkı; kullanılanlar dolu), ad, büyük toplam (işarete göre renkli), sıradaki dağıtan vurgulu.
   **Detaylı**: sütun = oyuncu, satır = el ("3. El · Rıfkı" + puanlar, sıfır "–"), dağıtanın
   hücresi vurgulu, altta yapışkan toplam satırı. Her iki görünümde altta "Kalanlar: El (1) ·
   Kupa (2) · … · Koz (6)" şeridi. Başparmak erişiminde "El Ekle"; menüde "Son eli sil", "Skoru oku"
   (Web Speech, tr-TR), "Paylaş"; satıra dokun → düzenle/sil.
4. **El Ekle (alt panel)**: başlık "{Dağıtan} konuşuyor · kalan hakkı: 2 ceza, 1 koz".
   Adım 1 tür seçimi: 7 satır (kart simgesi + ad + "kalan 1"); seçilemeyenler pasif ve nedeni yazılı
   ("Kupa Almaz 2 kez oynandı", "Ali'nin koz hakkı bitti", "İlk 4 elde koz seçilemez").
   Adım 2 sayım girişi: oyuncu başına −/+ stepper, canlı "Kalan N", "kalanı ver" kısayolu,
   Rıfkı için tek dokunuş, Koz için isteğe bağlı renk; puan ön izlemesi; toplam tutmadan kaydet pasif.
5. **Oyun bitti**: sıralama, kazanan vurgusu, toplam=0 kontrolü, "Paylaş" (Web Share metin),
   "Aynı oyuncularla yeni oyun", "Ana ekran". Oyun geçmişe taşınır.
6. **Ayarlar**: puan değerleri (varsayılana dön), kota zorunluluğu, ilk 4 elde koz yasağı,
   King eşiği, yedek al / geri yükle, sürüm bilgisi.
7. **İstatistikler** (ana ekrandan): biten oyunlardan oyuncu başına oyun, galibiyet, ortalama,
   en iyi/en kötü, King sayısı; basit tablo (grafik yok).

### 4.5 PWA ve iOS detayları

- `manifest.webmanifest`: `display: standalone`, `start_url: "./"`, `scope: "./"` (alt dizin
  barındırmaya uyumlu), 192/512 + maskable ikonlar.
- iOS: `apple-mobile-web-app-capable`, `black-translucent` durum çubuğu, 180px
  `apple-touch-icon`, `viewport-fit=cover` + `env(safe-area-inset-*)`, girişlerde ≥16px yazı
  (odakta yakınlaşmayı önler), `touch-action: manipulation`, `100dvh`.
- `sw.js`: sürümlü önbellek adı, kurulumda kabuğu önbelleğe al, etkinleşince eski önbellekleri sil,
  istekte önbellek-önce + arka planda yenile; yeni sürüm hazır olunca uygulamada "Yenile" bildirimi.
- Yazı tipi: sistem yığını (iPhone'da SF Pro) → dış bağımlılık yok, offline tam.

### 4.6 Hata yönetimi

- Geçersiz sayım kaydedilemez (buton pasif + açıklama).
- Yanlış kayıt → satırdan düzenle/sil; son el için "Geri al".
- Yıkıcı işlemler (oyunu sil, verileri sıfırla, içe aktarma) onay ister.
- localStorage okunamazsa uygulama boş durumla açılır ve uyarır; private mod farkı belirtilir.

## 5. Test stratejisi

- `node --test tests/`: puanlama, doğrulama, kota, dağıtan rotasyonu, sıralama, 20 elde sıfır toplam,
  store dışa/içe aktarma ve bozuk veri toleransı.
- Arayüz: Playwright ile iPhone ölçüsünde akış (yeni oyun → 20 el → bitiş) ve ekran görüntüsü;
  iOS Simülatörü Safari'de gerçek işleme kontrolü.
- Lighthouse benzeri PWA kontrol listesi elle: manifest, SW kaydı, offline yeniden yükleme.

## 6. Varsayımlar (kullanıcı değiştirebilir)

- A1 Standart bireysel King puanları (bölüm 3).
- A2 Dağıtan seçer; 3 ceza + 2 koz; her ceza türü ≤2; varsayılan zorunlu, ayardan kapatılabilir.
- A3 Yalnızca Türkçe arayüz.
- A4 Veri skor tutan telefonda; geçmiş yerel; JSON yedek.
- A5 Barındırma GitHub Pages `okavak/king-skor`; önizleme Claude Artifact.
- A6 Açık/koyu tema sistem tercihine göre; görsel yön koyu ağırlıklı.

## 7. Rakip inceleme notları (2026-10-02)

İncelenenler: King Skor Tablosu (Ufukcan Akkaya, 2017'den beri, reklam + abonelik), King Tablosu
(kingtablosu.com, hesap/arkadaş sistemi, abonelik), King Skor (sedattokay, grup/hesap, sesli skor).

Ortak ve benimsenen kalıplar: 2 daire + 3 üçgen hak göstergesi; Basit/Detaylı geçişi; kalan türler
satırı; dağıtan vurgusu; "X konuşuyor" el seçimi ve yalnızca seçilebilir türler; son eli sil;
ayarlanabilir puanlar; "ilk 4 el koz seçilmesin" ev kuralı; "King" istatistiği; sesli skor.

Bilinçli olarak alınmayanlar: hesap/giriş, arkadaş davet ve ortak tablolar (sunucu gerektirir),
radar grafikler, abonelik/paywall, reklam.
