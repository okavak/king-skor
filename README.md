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
- **Not**: Veriler telefonda saklanır (gruba katıldıysanız biten oyunlar grubun ortak kaydına da gider). Uygulamayı önce ana ekrana kurun, oyuncuları sonra ekleyin; Safari'de
  girilen veriler kurulu uygulamaya geçmez.

## Grup: ortak kayıt ve analiz

- **Grup:** Uygulamada tek bir topluluk grubu var: **Meşe Park King**. Grubu yönetici bir kez kurar (aşağıda "Yeni grup kurmak");
  uygulamada grup kurma düğmesi yoktur, böylece yanlışlıkla ikinci bir grup açılmaz.
- **Katılmak:** `config.js`'te `INVITE` doluysa gruba katılmamış telefonlar açılışta davet edilir: **Katıl** tek dokunuşla
  katılır ve telefondaki eski oyunları ekler. **Şimdi değil** 3 gün sonra yeniden sorar; ana ekrandaki kart ve Ayarlar → Grup
  her zaman katılmayı sunar. Kodla katılmak için Ayarlar → Grup → **Kodla katıl**: küçük harf, tiresiz yazım ya da davet
  mesajının tamamını yapıştırmak olur. Gruptakiler **Davet et** ile kodu paylaşabilir.
- **Gönderim:** Biten her oyun ortak kayda gider. İnternet yoksa sırada bekler, bağlantı gelince kendiliğinden gönderilir.
  Skor tutmak internetsiz çalışmaya devam eder.
- **Analiz ve sıralama:**
  - Kazanma yüzdesi sıralaması grubun bütün oyunlarından çıkar. Sıralamaya girmek için en az 3 oyun gerekir.
  - Bir oyuncuya dokununca ceza karnesi açılır. Her ceza ve kozda oyuncunun payı adil paya (%25) göre gösterilir;
    en çok zorlandığı ve en iyi olduğu ceza ayrıca belirtilir.
- **İsimler:**
  - Büyük/küçük harf ve Türkçe karakter farkı kendiliğinden birleşir ("Çağrı" = "Cagri").
  - Lakaplar için oyuncunun karnesinde **Başka bir isimle birleştir** kullanılır. Birleştirme bütün telefonlarda geçerlidir,
    **Ayır** ile geri alınır.
  - Aynı oyunda birlikte oynamış iki isim birleştirilemez.
- **Veri:**
  - Gruptayken biten oyunlar (isimler ve eller) grubun Cloudflare'deki ortak kaydına da gider.
  - Grup kodunu bilen grubu görür ve oyun ekleyebilir; kodu grup dışına vermeyin.
  - Geçmişten silinen oyun ortak kayıttan da silinir. "Gruptan çık" ve "Tüm verileri sil" ortak kayda dokunmaz.

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
./deploy.sh                   # GitHub Pages'e yayınla (git kimliğiyle; gh yalnızca ilk kurulumda)
npm run worker:dev            # grup sunucusu yerelde, yerel D1 ile → http://127.0.0.1:8787
npm run worker:deploy         # testler + D1 göçleri + Cloudflare'e yayın
```

Geliştirmede uygulamayı yerel grup sunucusuna bağlamak için tarayıcı konsolunda
`localStorage.setItem('king:v1:apiBase', 'http://127.0.0.1:8787')` yazın. Bunu yalnızca bu tarayıcı kullanır.

### Grup sunucusu: bir kerelik kurulum

1. `cd worker && npx --yes wrangler@4.151.2 login` ile Cloudflare hesabına giriş yapın (ücretsiz plan yeterli).
2. `npx --yes wrangler@4.151.2 d1 create king-skor` çalıştırın; çıkan `database_id`'yi `worker/wrangler.jsonc`'ye yazın.
3. `npm run worker:deploy` çalıştırın (hesap `worker/wrangler.jsonc`'deki `account_id` ile sabit: kişisel hesap). Çıkan `https://king-skor.<hesap>.workers.dev` adresini `config.js`'teki `API_BASE`'e
   yazın, ardından `./deploy.sh` ile uygulamayı yayınlayın. `API_BASE` boşken uygulamada grup özellikleri görünmez.

Derleme adımı ve bağımlılık yok. Tasarım: `docs/superpowers/specs/`, plan: `docs/superpowers/plans/`.

### Yeni grup kurmak (yönetici)

```bash
curl -s -X POST -H 'Content-Type: application/json' -d '{"name":"Meşe Park King"}' https://king-skor.okavak.workers.dev/groups
```

Yanıttaki `code` gruba katılma kodudur. Herkesi açılışta bu gruba davet etmek için `config.js`'te
`INVITE = { code: '<kod>', name: '<ad>' }` yazıp `./deploy.sh` ile yayınlayın.
