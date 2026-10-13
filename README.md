# Hedef Önce — gerçek veri başlangıcı

Bu sürüm, seçilen **Karar Odaklı** arayüzü API anahtarı istemeyen gerçek piyasa veri toplayıcısına bağlar. Emir göndermez; canlı araştırma skoru üretir.
Canlı prediction motoru sabit kurallı araştırma skoru üretir; walk-forward kalibrasyonu tamamlanana kadar kazanma olasılığı üretmez ve bütün adayları paper araştırmasıyla sınırlar.

Arayüzde her teknik verinin yanında günlük Türkçe karşılığı bulunur. Üstteki **“Şimdi ne yapmalıyım?”** kartı kararı `İşlem açma`, `Şimdilik bekle` veya `Sadece paper takip et` olarak söyler ve değişmesi beklenen şartları listeler. Bu metinler sinyal kaydına da yazıldığı için ileride aynı açıklamalar bildirimlerde kullanılabilir.

En üstteki **Sistem Güvencesi** kartı dört ayrı kontrolü gösterir: 19 piyasa serisinin güncelliği, haber/SEC/takvim bağlantıları, karar motorunun son çalışması ve canlı motor ile Zaman Makinesi'nin aynı kod ve strateji sürümünü kullanması. Normal seans dışındayken sarı `Sinyal bekleme`, bütün katmanlar hazır ve seans açıkken yeşil `Motor karar arıyor`, herhangi bir katman eski veya eksikken kırmızı `Sinyale güvenme` görünür. Motor kimliği, strateji dosyası ile prediction kodunun özetidir; canlı ve replay sonucunda aynı kimlik kullanılır.

## Kısa vadeli giriş zamanlaması

Prediction motoru artık günlük hisse yönünü ana karar olarak kullanmaz. +%1/+%1,5 hedefi için tamamlanmış 5 dakikalık mumlarda satış sonrası dönüşü, kısa ortalama ivmesini, yükselen dip veya üç mumluk kırılımı, yakın desteğe göre stop uzaklığını ve hedefe tahmini süreyi birlikte ölçer. Memory, sektör, makro ve haber katmanları bağlam ve risk uyarısıdır; güçlü bir yakın dönem tetiğini tek başına iptal etmez. Arayüz `Giriş penceresi: Açık / Hazırlanıyor / Kapalı / Engelli` ve `Taktik risk: Düşük / Orta / Yüksek` alanlarını gösterir.

Arayüzdeki **Döngü Radarı** fiyatı yedi fazda açıklar: satış dalgası, satıcı yorulması, dip testi, ilk tepki, teyit, hedef rotasyonu ve yeniden satış. Her aday sinyal fazın nedenini, sonraki faz için gereken koşulu, fikri bozan durumu ve kullanılan kısa vadeli kanıtları taşır. **Motoru Anla** bölümü karar ağırlıklarını ve o anda kullanılan EMA, 5/15 dakikalık hareket, dipten tepki, yükselen dip, yakın tepe kırılımı, VWAP, hacim, ATR, spread ve hedef/stop oranını günlük Türkçeyle gösterir.

## Çalıştırma

Node.js 20 veya üzeri gerekir. Ek paket kurulmaz.

```powershell
cd C:\Users\USER\Documents\Codex\2026-10-08\referenced-chatgpt-conversation-this-is-an\outputs\hedef-once-app
npm start
```

Ardından `http://127.0.0.1:4173` adresi açılır. Program açık kaldığı sürece veri yaklaşık dakikada bir yenilenir.

Tek sefer veri toplamak için:

```powershell
npm run collect
```

Doğrulamalar:

```powershell
npm test
```

Point-in-time veri ve sinyal birikimini denetlemek için:

```powershell
npm run audit
```

Son prediction adaylarında veri sırası, alt puanlar, ağırlıklı toplam, maliyet sonrası risk/getiri, karar kapıları ve kalibrasyon sınırını denetlemek için:

```powershell
npm run audit:model
```

Dondurulmuş güncel sürümün ileri test sayacını ve geçerli örneklerini görmek için:

```powershell
npm run backtest
```

Zaman Makinesi replay hattında gelecek veri sızıntısı, tekil karar kimliği, skor toplamı ve sonuç zamanını denetlemek için:

```powershell
npm run audit:replay
```

Arayüzdeki **Zaman Makinesi** bölümünde başlangıç ve bitiş zamanı seçilir. Sistem yalnızca fiyat, bid/ask, sektör, makro, haber, SEC ve takvim katmanlarının o anda birlikte kaydedildiği aralığı açar. Toplama başlamadan önceki tarihler için tam veri varmış gibi sonuç üretmez.

İlk kontrol için **Kayıtlı aralıkla hemen dene** düğmesi kullanılır. Sonucun mekanik olarak geçerli olması için `5/5 bütünlük kontrolü geçti` yazmalıdır. Ana örnek sayısı `Bağımsız “şimdi”` alanıdır; üst üste binen kararlar burada bir kez sayılır. Replay'in çalışması kârlılık kanıtı değildir: ön değerlendirme için en az 10 farklı gün ve 30 bağımsız sinyal, model hakkında karar vermek için en az 60 gün ve 100 bağımsız sinyal gerekir.

Zaman Makinesi aynı zamanda **Sanal Kasa** çalıştırır. Kullanıcı başlangıç parasını, işlem başına kabul edilen kasa riskini, tek pozisyona ayrılabilecek azami oranı ve aynı anda taşınabilecek işlem sayısını seçer. Motor her tamamlanmış 5 dakikalık karar anında yalnızca `Şimdi` durumundaki, daha sonra sonucu olgunlaşmış adayları ele alır. Pozisyon büyüklüğü stop mesafesi ve risk bütçesine göre hesaplanır; aynı hissede aynı anda tek pozisyon taşınır. Ücret ve iki yönlü stres kayması her işlemden düşülür. İşlem günlüğü ayrılan para, adet, sonuç, net kâr/zarar ve işlem sonrası kasayı gösterir. Kesirli hisse ve belirtilen fiyattan tam gerçekleşme varsayımı nedeniyle bu bölüm paper simülasyonudur.

Her sanal işlemin altında **Motor neyi okudu?** incelemesi bulunur. Giriş gerekçesi, önceden görülen riskler, sonuçta çalışan varsayım, bozulan varsayım ve geliştirme döneminde sınanabilecek soru ayrı gösterilir. İnceleme otomatik olarak ağırlık veya eşik değiştirmez. Değişiklik adayları yalnız geliştirme günlerindeki toplu sonuçlardan çıkarılır; doğrulama döneminde motor dondurulur ve kilitli test bölümü geliştirme için kullanılmaz.

Tarih seçimi yalnız **tam canlı verisi kaydedilmiş günleri** açar. Piyasa mumları tek başına yeterli değildir: o dakikanın bid/ask görüntüsü, haberin ilk görülme zamanı, SEC/takvim görünümü ve veri gecikmesi de karar anından önce kaydedilmiş olmalıdır. Arşivlenmemiş geçmiş günler sonradan tam canlıymış gibi doldurulmaz; bu, veri sızıntısını önleyen bilinçli bir sınırdır. Kolektör açık kaldıkça yeni işlem günleri otomatik olarak seçim listesine eklenir.

Arşiv dışındaki yakın bir tarih için **Tarihi yükle ve canlandır** modu bulunur. Test başladığında son 30 gün içindeki seçilen ABD işlem gününe ait 19 sembolün 1 dakikalık OHLCV verisi, tarihsel haber yayını, SEC kabul zamanları ve olay takvimi internetten alınır. Zaman 5 dakikalık adımlarla ilerler ve her adımda yalnız o saate kadar yayımlanmış veri prediction motoruna verilir. Anahtarsız kaynak tarihsel bid/ask ile haberin gerçek ilk görülme zamanını sağlamadığı için 5 bps muhafazakâr spread ve haber yayın zamanı proxy olarak kullanılır. Bu sonuç sarı **Tarihsel canlandırma** etiketi taşır ve resmî canlı-forward sayacına eklenmez. Daha eski 1 dakikalık veri anahtarsız kaynakta bulunmadığından 30 günden eski seçim reddedilir.

Arayüzdeki **Puanın hesabını aç** bölümü aynı denetim izini kullanıcı dilinde gösterir. Formülün doğru hesaplanması ile formülün geleceği iyi tahmin etmesi ayrı durumlar olarak işaretlenir.

## Şu anda alınan gerçek veriler

- Ana hisseler: MU, SNDK
- Memory: WDC, STX
- Semiconductor ve ekipman: NVDA, AMD, AVGO, AMAT, LRCX, ASML
- ETF ve piyasa: SMH, SOXX, QQQ, SPY
- Makro proxy'leri: VIX, ABD 10 yıllık, DXY, Nasdaq ve S&P vadeli işlemleri
- Bir dakikalık fiyat/hacim barları, extended-hours dahil
- MU/SNDK gerçek zamanlı bid, ask, büyüklük ve spread
- MU/SNDK ve memory teması için canlı haber RSS akışı
- MU/SNDK resmi SEC bildirimleri ve kabul zamanları
- Önümüzdeki sekiz günlük ABD ekonomik takvimi
- Önümüzdeki sekiz günlük MU/SNDK bilanço takvimi kontrolü

Kaynak profili `NO_KEY_PUBLIC_RESEARCH` olarak işaretlenir. Bu bağlantı anahtarsız ve garanti edilmeyen kamu erişimine dayanır. Veri gecikmesi ve başarısız semboller arayüzde görünür tutulur.

## Point-in-time kayıt

- `data/bars/*.ndjson`: normalize edilmiş bar kayıtları
- `data/snapshots/YYYY-MM-DD.ndjson`: her toplama anındaki piyasa görünümü
- `data/latest.json`: arayüzün kullandığı son snapshot
- `data/context/*.ndjson`: haber, SEC ve takvim snapshot'ları
- `data/latest-context.json`: son bağlam snapshot'ı
- `data/state.json`: yinelenen barları engelleyen kolektör durumu

İlk çalıştırmada geçmişten indirilen barlar `BACKFILL_OBSERVED_NOW` olarak işaretlenir. Bunlar o geçmiş tarihte sisteme gerçekten ulaşmış point-in-time kayıt sayılmaz. Program çalışırken yeni gözlenen barlar `OBSERVED_LIVE` olarak kaydedilir.

## Neden skor kapalı?

Fiyat katmanı tek başına Memory Momentum Long Engine v0.1'i temsil etmez. Şu katmanlar tamamlanana kadar ekran işlem puanı veya hedef-önce-stop olasılığı üretmez:

- tarihsel olarak lisanslı haber arşivi ve revizyon geçmişi
- dondurulmuş haber/olay risk sınıflandırması
- doğrulanmış uygulanabilir fill ve slippage modeli
- dondurulmuş skor ve veto kuralları
- walk-forward ile kalibrasyon

Bu sınır arayüzde “Eksik veri katmanları” olarak gösterilir.

## Prediction ve tarafsız backtest sınırı

- Her tamamlanmış 5 dakikalık bar için MU/SNDK × Hızlı +1/Geniş +1,5 adayları oluşturulur.
- Skorun sekiz katmanı, giriş/target/stop, maliyet sonrası hedef ve bütün veto nedenleri sinyal kaydına yazılır.
- `pTargetFirst`, `pStopFirst` ve `pTimeout` kalibrasyon öncesinde daima `null` kalır.
- Strateji sinyal dosyalarını; evaluator ise yalnızca sonradan gelen barları okur.
- Aynı mumda hedef ve stop görülürse ana sonuç konservatif olarak `STOP_FIRST` olur.
- Kolektörün ilk çalışmasında geriye alınan barlar `BACKFILL_OBSERVED_NOW` olduğundan FULL_PIT haberli backtestte kullanılamaz.
- Objektif canlı-forward veri seti, kolektörün çalışmaya başladığı andan itibaren birikir.
- Özellikler yalnızca beş eksiksiz 1 dakikalık bardan oluşan kapanmış 5 dakikalık mumlarla hesaplanır; hedef/stop sırası canlı gözlenmiş 1 dakikalık mumlarla çözülür.
- Quick modelde giriş için seans kapanışına en az 60 dakika, Extended modelde en az 30 dakika kalmalıdır. Extended sonuç üçüncü normal seansın kapanışında olgunlaşır.
- Aynı sembol ve modelde önceki paper sinyal sonuçlanmadan gelen çakışan “şimdi” sinyalleri ana performans hesabında tekrar sayılmaz.
- Günler kronolojik %60 geliştirme, %20 doğrulama ve %20 kilitli test olarak ayrılır; bölümler arasında üç seanslık embargo bırakılır ve rastgele karıştırma yapılmaz.
- Başarı oranı 60 işlem günü, 1.000 geçerli sonuç, her modelde 300 sonuç ve 100 çakışmayan gerçek karar anı tamamlanmadan gösterilmez.
- Güncel ağırlıklar doğrulanmış olasılıklar değil, veri birikirken değiştirilmeyen başlangıç hipotezleridir.
