# King Skor

Arkadaş grubu için reklamsız, sunucusuz King skor tablosu. iPhone ve Android'de ana ekrana
eklenen bir web uygulaması (PWA); çevrimdışı çalışır, veriler telefonda kalır.

## Telefona kurma

1. Adresi Safari'de açın: `https://okavak.github.io/king-skor/`
2. Paylaş düğmesi → **Ana Ekrana Ekle** → Ekle.
3. Ana ekrandaki "King" simgesinden açın. Tam ekran ve internetsiz çalışır.

Android: Chrome menüsü → "Ana ekrana ekle" / "Uygulamayı yükle".

## Kullanım

- **Yeni oyun**: listeden dört oyuncuya oturma sırasıyla dokunun (1–4 rozetleri koltuk sırası), gerekirse
  "Yeni oyuncu ekle"; ilk dağıtanı seçin.
- **El ekle**: dağıtan otomatik gelir; listede yalnızca seçilebilecek türler görünür (her ceza en fazla
  2 kez, oyuncu başına 3 ceza + 2 koz). Sayıları −/+ ile girin, "Kalanı ver" ile tamamlayın.
- **Oyun bitti**: sonucu paylaşın, aynı oyuncularla yeni oyun açın ya da "Son eli düzelt" ile son eli değiştirin.
- **Yanlış kaydı düzeltme**: kaydettikten hemen sonra bildirimdeki "Geri al"; Basit görünümde "Düzenle";
  Detaylı görünümde satıra dokunun; sayı girerken değere dokununca 0–13 hızlı seçim şeridi açılır; menüde
  "Dağıtan sırasını düzelt" ile oyun ortasında dağıtan düzeltilir; bitişte "Son eli düzelt".
- **Menü (⋯)**: son eli sil, skoru sesli oku, metin ya da görsel (PNG) olarak paylaş, dağıtan sırasını düzelt,
  oyunu bitir.
- **Ekran**: tablo açıkken telefon kararmaz (Ayarlar'dan kapatılabilir).
- **Ayarlar**: puanlar, kural anahtarları, yedek al / geri yükle.
- **Not**: Veriler telefonda saklanır. Uygulamayı önce ana ekrana kurun, oyuncuları sonra ekleyin; Safari'de
  girilen veriler kurulu uygulamaya geçmez.

## Kurallar (varsayılan)

| Tür | Birim | Puan |
|---|---|---|
| El Almaz | el (13) | −50 |
| Kupa Almaz | kupa (13) | −30 |
| Erkek Almaz | papaz+vale (8) | −60 |
| Kız Almaz | kız (4) | −100 |
| Rıfkı | kupa papazı | −320 |
| Son İki | son iki el | −180 |
| Koz | el (13) | +50 |

20 el sonunda toplam 0 olmalıdır; uygulama bunu kontrol eder. Oyun bitince toplamı 0 ve üstü olanlar
**çıkar**, altında kalanlar **batar**. Koz elinde eşiği (varsayılan 10 el) aşan oyuncu **King yapar**: oyun o anda
biter, o çıkar, diğer üçü batar. Eşik ve bu kural Ayarlar'dan değiştirilebilir.

## Geliştirme

```bash
npm test                      # puanlama ve kalıcılık testleri
python3 -m http.server 8080   # yerel çalıştır → http://localhost:8080
python3 tools/make-icons.py   # ikonları yeniden üret
node tools/bundle.mjs         # tek dosyalık önizleme → dist/king-skor.html
./deploy.sh                   # GitHub Pages'e yayınla (gh auth login gerekir)
```

Derleme adımı ve bağımlılık yok. Tasarım: `docs/superpowers/specs/`, plan: `docs/superpowers/plans/`.
