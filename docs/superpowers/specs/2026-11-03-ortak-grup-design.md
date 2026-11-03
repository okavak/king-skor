# Ortak Grup Kaydı ve Kişisel Analiz — Tasarım

Tarih: 2026-11-03 · Durum: kullanıcıyla konuşuldu. Geri kalan soruları kullanıcı "Hadi başlayalım" diyerek atladı.
"Kararım" ile işaretli maddeleri ben seçtim, kullanıcı değiştirebilir.

## 1. Neden

- Skorları kim tutarsa onun telefonunda kalıyor, grubun ortak bir kaydı yok.
- Kullanıcının sözleri: "Toplu skoru kimse aramıyor, ancak eğer ki herkesin toplu olarak skorlarının tutulduğu bir yer olursa,
  güzel bir rekabet olur. İnsanlar sadece ne kadar kazandığını değil, kazanma yüzdesini, hangi cezalarda en çok sıkıntı
  yaşadığını vb de görür. Böylece kendini geliştirme fırsatı olur."
- Kullanıcının eklediği iki istek: (1) telefonlarda farklı karakterlerle yazılmış isimler sistemce birleştirilmeli,
  gerekirse eşleştirmeyi birlikte yaparız; (2) kişisel analiz yeteneği internete yüklenen skorların durduğu yerde olmalı.
- Bu tasarım ilk tasarımdaki iki kararı değiştiriyor: "çoklu cihaz senkronu ve ortak tablolar kapsam dışı" ve
  A4 "veri skor tutan telefonda".

## 2. Hedefler, değişmeyenler, kapsam dışı

Hedefler:
1. Grubun bütün telefonlarındaki biten oyunlar tek bir ortak kayıtta birikir. Gruba kodla katılınır; hesap ya da şifre yok.
2. Analiz ortak kayıtta yapılır. Sıralama kazanma yüzdesine göredir. Her oyuncunun kişisel karnesinde şunlar var: oyun sayısı,
   çıkma sayısı, ortalama, en iyi ve en kötü skor, King sayısı, her cezada adil paya göre durumu, en çok zorlandığı ve
   en iyi olduğu ceza.
3. İsimler birleştirilir. Büyük/küçük harf, Türkçe karakter, boşluk ve noktalama farkları kendiliğinden eşleşir. Geri kalanlar
   (ör. lakaplar) elle birleştirilir ve bu birleştirme bütün telefonlarda geçerli olur.
4. Telefonlarda zaten duran eski oyunlar, gruba katılırken onay alınarak ortak kayda aktarılır.

Değişmeyenler (bunlar bozulursa iş başarısız sayılır):
- İnternet yokken skor tutmak bugünkü gibi çalışır. Açılış ağı beklemez (2026-11-03'teki siyah ekran düzeltmesi korunur).
  Gönderilemeyen oyunlar telefonda sırada bekler.
- Masa başındaki skor girme akışına yeni adım eklenmez.
- Hesap, giriş ve reklam yok.
- Gruba katılmamış bir telefon bugünkü gibi yalnızca kendi verisiyle çalışır.

Kapsam dışı (şimdilik):
- Oyun sırasında canlı ortak tablo, devam eden oyunu paylaşma.
- Diğer telefonların oyun listesini görmek. Analiz var, ortak oyun listesi yok.
- Birden fazla grup, grup yönetimi ve yetkiler.
- Uygulama dışından açılan bir analiz web sayfası. Sunucudaki analiz uç noktası buna hazır, sayfanın kendisi yapılmayacak.

## 3. Mimari

- **Barındırma (Kararım):** Cloudflare Worker ve D1 (SQLite), ücretsiz planda. Uygulama yine GitHub Pages'ten yayınlanır.
  Gerekçe: analiz sunucuda çalışabiliyor ve ücretsiz plan kullanılmadığında durmuyor. Supabase'in ücretsiz planı 7 gün
  kullanılmayınca duruyor; Firebase'in ücretsiz planında sunucu kodu çalıştırılamıyor.
- **Saklanan veri:** Sunucu her oyunun tam kaydını (JSON) ve analiz için çıkarılmış küçük bir özetini saklar. Analiz bu
  özetlerden hesaplanır, çünkü Worker'ın ücretsiz planda istek başına CPU sınırı 10 ms. Özetin bir şema sürümü var
  (`SUMMARY_VERSION`). Analiz değişirse sunucu özetleri tam kayıttan yeniden üretir; böylece sonradan yeni analizler eklenebilir.
- **Ortak kod:** `rules.js`, `names.js`, `analysis.js` ve `groupcode.js` saf modüller. Uygulamada ve Worker'da aynı kod çalışır.
- **Grup kodu (Kararım):** 8 karakter Crockford base32 (yaklaşık 40 bit), "ABCD-2345" biçiminde gösterilir. Kodu bilen gruba
  erişir; ayrı bir şifre yok. Küçük harf, tire ya da boşluk ve O/0, I/L/1 karışıklığı tolere edilir. Davet metni
  yapıştırılırsa içindeki tireli kod bulunur.
- **Uygulama gruptayken:**
  - Bir oyun bittiğinde ya da "Son eli düzelt" sonrası yeniden bittiğinde gönderim sırasına girer ve gönderilir. Aynı oyun
    kimliği güncellenir, ikinci kayıt oluşmaz.
  - Oyun geçmişten silinirse ortak kayıttan da silinir. Silme yumuşaktır: satır işaretlenir, veri kaybolmaz.
  - "Oyunu sil" (örneğin yeniden açılmış bir oyun için) ortak kayıttan silme gönderir.
  - Yedekten geri yüklemede "Yedekteki N oyun X grubuna da eklensin mi?" diye sorulur; evet denirse oyunlar gönderilir.
    Aynı kimlik olduğu için tekrar kayıt oluşmaz.
  - "Tüm verileri sil" yalnızca telefondakini siler, gruptan da çıkar. Ortak kayda dokunmaz.
- **Analiz ekranı:** Gruptayken sunucudan gelen analizi gösterir. Son analiz telefonda saklanır, böylece internetsiz de görünür;
  ekranda "son güncelleme" zamanı yazar. Grupta değilken aynı analiz telefondaki geçmişten hesaplanır.

## 4. İsim anahtarı

`nameKey` adımları:
1. Baştaki ve sondaki boşlukları at.
2. tr-TR kurallarıyla küçük harfe çevir.
3. Türkçe harfleri düzleştir: ı→i, ş→s, ğ→g, ü→u, ö→o, ç→c, â→a, î→i, û→u.
4. NFD ile ayrıştır ve birleşik işaretleri at.
5. Harf ve rakam dışındaki her karakteri at.
6. Sonuç boş kalırsa 2. adımdaki hali kullan.

Örnekler: "Çağrı", "cagri", " ÇAĞRI ", "Cagrı" → `cagri`. "Işıl", "ISIL" → `isil`. "Hayrullah Abi" → `hayrullahabi`.

- **Görünen ad:** Birleşen yazımlardan en sık kullanılanı. Eşitlikte en son oyundaki yazım.
- **Elle birleştirme:** `from → to` biçiminde grupta saklanır ve bütün telefonlarda geçerlidir.
  - Zincirler köke çözülür; hedef her zaman köke çözüldüğü için döngü oluşamaz. Zaten aynı kişi olan iki ad yeniden
    birleştirilirse hiçbir şey değişmez.
  - Aynı oyunda birlikte oynamış iki isim birleştirilemez, çünkü farklı kişilerdir.
  - Birleştirme "Ayır" ile geri alınır.
- **Telefonun oyuncu listesi:** Bu anahtarla tekilleşir. Listede "Çağrı" varken "Cagri" eklenmek istenirse "Bu isim zaten listede" uyarısı çıkar.

## 5. Analiz tanımları

- **Oyun:** Geçmişe kaydedilmiş her oyun; bitmiş ya da erken bitirilmiş olabilir. Bugünkü istatistik ekranıyla aynı tanım.
- **Kazanma:** Çıkmak ya da King yapmak, yani `outcomes()` sonucu `'sunk'` olmayan oyun. Kazanma yüzdesi = kazanma / oyun.
- **Sıralama:**
  - Sıralamaya girmek için en az 3 oyun gerekir (`MIN_RANKED_GAMES`).
  - Sıra ölçütleri: kazanma yüzdesi (büyükten küçüğe), sonra ortalama (büyükten küçüğe), sonra oyun sayısı (çoktan aza), en son ad.
  - Kazanma yüzdesi ve ortalaması aynı olanlar aynı sırayı paylaşır.
  - 3'ten az oyunu olanlar listenin altında, sırasız görünür.
- **Ceza karnesi:**
  - Her el türü için tutulanlar: oynanan el sayısı, alınan birim, toplam puan.
  - Pay = alınan birim / (el sayısı × türün toplam birimi). Adil pay %25.
  - Ceza türlerinde %25'in üstü kötü (kırmızı), altı iyi (yeşil). Kozda tersi.
  - En çok zorlandığı ceza: en az 3 elde oynanmış (`MIN_TYPE_HANDS`) cezalar içinde payı %25'in üstünde olan en yüksek paylı ceza.
  - En iyi olduğu ceza: aynı koşulla payı %25'in altında olan en düşük paylı ceza. Koşulu sağlayan ceza yoksa ikisi de boş kalır.
- **King sayısı:** Koz elinde oyunun `kingThreshold` eşiğine ulaştığı el sayısı. Bugünkü istatistikle aynı tanım.
- **Ortalama, en iyi, en kötü:** Oyun sonu toplamları üzerinden.

## 6. Sunucu API'si

| İstek | Gövde | Yanıt |
|---|---|---|
| `POST /groups` | `{ name }` (1–40 karakter) | 201 `{ code, name }` |
| `GET /groups/:code` | | 200 `{ code, name, games }`, yoksa 404 |
| `PUT /groups/:code/games/:id` | oyun JSON'u | 200 `{ ok: true }`; 400 geçersiz; 404 grup yok; 413 > 64 KB |
| `DELETE /groups/:code/games/:id` | | 200 `{ ok: true }`; yumuşak silme, tekrarı zararsız |
| `GET /groups/:code/analysis` | | 200 `{ group, analysis, aliases, at }` |
| `PUT /groups/:code/aliases` | `{ from, to }` | 200 `{ aliases }`; 400 döngü ya da boş ad; 409 aynı oyunda oynamışlar |
| `DELETE /groups/:code/aliases/:from` | | 200 `{ aliases }` |

- **Hatalar:** Gövde `{ error: "<Türkçe mesaj>" }` biçimindedir.
- **CORS:** Yalnızca şu kökenlere izin verilir: `https://okavak.github.io`, `http://localhost:8080`, `http://127.0.0.1:8080`.
- **Oyun doğrulaması:** Gövde en fazla 64 KB. Oyun `isValidGame` kontrolünden geçmeli. URL'deki kimlik oyunun kimliğiyle aynı olmalı
  ve `/^[a-z0-9]{6,40}$/` biçimine uymalı. `finishedAt` bir dizgi olmalı. Her isim en fazla 40 karakter.

## 7. Arayüz

- **Ayarlar → "Grup" bölümü:**
  - Grupta değilken: "Grup kur" (grup adı sorulur) ve "Gruba katıl" (kod sorulur).
  - Gruptayken: grup adı, kod, "Davet et", gönderilmeyi bekleyen oyun sayısı ve "Gruptan çık".
  - Davet metninde şunlar var: grup adı, kod, nereden katılınacağı ve uygulamanın adresi.
- **Katılırken:** Uygulama "Bu telefondaki N oyun da gruba eklensin mi?" diye sorar. Seçenekler: "Katıl ve oyunları ekle" ya da
  "Katıl, sadece yeni oyunlar".
- **Ana ekran:** "İstatistikler" düğmesinin adı "Analiz ve sıralama" olur. Gruptaysa yanında grup adı ve bekleyen gönderim sayısı görünür.
- **Analiz ekranı:**
  - Üstte kaynak cümlesi yer alır: gruptayken "Cuma Kingcileri grubunun 48 oyunu, bugün 18:38 itibarıyla.", grupta değilken
    "Bu telefondaki N oyun." Grupta olup analiz henüz inmemişse telefondaki oyunlar gösterilir ve bu söylenir.
  - Altında sıralama listesi var. Bir oyuncuya dokununca kişisel karnesi açılır.
- **Kişisel karne:**
  - Kazanma yüzdesi, oyun ve çıkma sayısı, ortalama, en iyi ve en kötü skor, King sayısı.
  - "En çok zorlandığı" ve "En iyi olduğu" vurguları (üçüncü kişi: karneyi başkaları da açar).
  - Ceza satırları: kart, ad, pay çubuğu (%25 çizgisiyle), pay yüzdesi ve el sayısı. Koz da ayrı bir satır.
  - Birleşen yazımlar.
  - Gruptayken "Başka bir isimle birleştir" düğmesi ve elle birleştirilmiş isimler için "Ayır".
- **Grupta değilken:** Analiz ekranında "Grubun ortak analizi için grup kurun ya da katılın" kartı görünür.
- **Renk ve kontrast:** 2026-10-17 kuralları geçerli. Çıkan ve iyi yeşil, batan ve kötü kırmızı. Yazılar arka planına karşı ≥4.5:1.

## 8. Kurulum ve yayın

- **Bir kerelik:**
  1. Cloudflare hesabıyla `npx wrangler login`.
  2. `wrangler d1 create king-skor`; çıkan `database_id` `worker/wrangler.jsonc`'ye yazılır.
  3. Uzak veritabanına göçler uygulanır.
  4. `wrangler deploy`; Worker adresi `config.js`'teki `API_BASE`'e yazılır.
- **Sonrası:** Uygulama `./deploy.sh` ile yayınlanır. Sunucu değişirse `npm run worker:deploy`.

## 9. Test

- **node:test:** `names`, `groupcode`, `analysis`, grup istemcisi (sahte fetch ile), Worker (node:sqlite üstünde sahte D1 ile)
  ve service worker önbellek listesi.
- **Uçtan uca:**
  - `wrangler dev` yerel D1 ile çalışır. İki farklı köken (localhost ve 127.0.0.1) iki ayrı telefon yerine geçer.
  - Playwright ile denenenler: grup kurma, katılma, oyun gönderme, analiz, isim birleştirme ve internetsiz açılış.

## 10. Uygulama sırasında verilen kararlar ve ertelenen küçük konular (2026-11-03)

Kararlar:
- Davet metni kodla başlar. Yapıştırılan metindeki her `xxxx-xxxx` parçası sırayla denenir, çünkü grup adı da kod gibi
  görünebilir ("Aile-King").
- Tür adları ve takma ad anahtarları yalnızca nesnenin kendi alanlarından okunur. "__proto__", "constructor" gibi adlar
  doğrulamayı geçemez ve ortak nesneye yazamaz.
- Zaten aynı kişi olan iki adı yeniden birleştirmek hiçbir şeyi değiştirmez ve hata vermez.
- Gruptan silme onayı ortak kayıttan da silineceğini önceden söyler.
- Grup bölümü Ayarlar'ın en üstündedir.
- Karne metinleri üçüncü kişidir. Kaynak satırı orta nokta yerine cümle olarak yazılır. Pay çubuğunun ortası adil paydır;
  ±1,5 puanlık fark nötr gri gösterilir.
- Grup kodu 8 karakterde kaldı. Tahminler sunucunun günlük ücretsiz kotasından geçmek zorunda olduğu için deneyerek kod
  bulmak pratikte imkânsız. İstenirse 12 karaktere çıkarılabilir.

Ertelenen küçük konular (bağımsız incelemeden):
- Birleştirilmiş iki ad sonradan aynı masada görünürse o oyunda kişi iki kez sayılır.
- Sunucunun reddettiği oyunlar (ör. 40 karakterden uzun isim) sessizce düşer. Oyuncu adı alanında karakter sınırı yok.
- Diyalogda Escape tuşu `choose()`'u `false` ile kapatıyor. Etkisi yalnızca klavye kullananlara.
- Analiz ekranı her yenilemede yeniden çiziliyor. İlk açılışta satırlar parmağın altında yer değiştirebilir.
- `group.js`'te iki küçük yarış durumu var:
  - Çıkış yapıldıktan sonra biten bir yenileme.
  - Sıra numarasının yeniden 1'den başlaması.
- Sunucunun her seferinde 5xx döndürdüğü bir kayıt sırayı tıkar. Düzenli yeniden deneme yok.
- "Ayır", iki birleşik grubu birleştirdikten sonra tam geri alma yapmaz.
- Ufak notlar:
  - Davet panoya kopyalanınca "Sonuç panoya kopyalandı" yazıyor.
  - Hiç gönderilmemiş bir oyunu silmek de silme isteğini sıraya koyuyor.
  - `.playwright-mcp/` klasörü `.gitignore`'da değil.
- Gelecek için: özet şeması değişirse özetleri parça parça yeniden üret. 2xx gelip gövdesi JSON olmayan yanıtı hata say.

## 11. Meşe Park King ile açılış (2026-11-03, kullanıcıyla)

- Uygulamayı bugün yalnızca Meşe Park'tan tanıdıklar kullanıyor. Tek bir topluluk grubu var: **Meşe Park King**. Grubu
  yönetici sunucuda bir kez kurdu; uygulamadan "Grup kur" kaldırıldı, böylece yanlışlıkla ikinci grup açılmaz.
- Sıra:
  1. Kullanıcının iPhone'u kodla katılır ve oyunlarını ekler (davet kapalı yayın).
  2. Kullanıcının verdiği isim listesiyle adlar birleştirilir.
  3. `config.js`'te `INVITE` açılır.
  4. Açılışta gelen "Meşe Park King grubu açıldı!" davetinde **Katıl** tek dokunuşla katılır ve telefondaki oyunları ekler.
     **Şimdi değil** 3 gün sonra yeniden sorar; ana ekran kartı ve Ayarlar katılmayı her zaman sunar. Oyun sürerken davet araya
     girmez.
- Birleştirilen adlarda hedef adın yazımı görünür ("Memo" → "Mehmet" ise sıralamada "Mehmet").
- Davet uygulamanın içinde olduğundan uygulamayı kuran herkes katılabilir. Bugün kullanıcılar yalnızca Meşe Park'tan.
- Sunucu: kişisel Cloudflare hesabı (Airox Labs hesabı değil), adres `https://king-skor.okavak.workers.dev`.
