# Skin AI — bağımsız ürün verisi hattı

Bu klasör toplu veri toplama ve kaynak denetimi hattıdır. 80 ham kayıttan 51 teknik aday çıkarılır; daha dar etiket kurallarını geçen 30 kayıt uygulamanın sınırlı referans kataloğuna aktarılır. Bu seçim bağımsız klinik doğrulama veya uzman onayı değildir.

## Mevcut veri

31 Ekim 2026 tarihli toplu çekim: **80 ürün kaydı, 5 marka**.

| Marka | Kayıt |
|---|---:|
| CeraVe | 15 |
| Cetaphil | 31 |
| Eucerin | 21 |
| The Ordinary | 4 |
| Vanicream | 9 |

Kayıtların 16'sı temizleyici, 29'u nemlendirici, 26'sı güneş koruyucu. Geri kalan 9 kayıt serum, peeling, mendil veya banttır; sayıyı artırmak için temel rutin ürünü gibi değerlendirilmez.

**80 kayıtta kaynak sayfasındaki tam içerik bölümleri ayrıştırıldı.** ABD güneş koruyucularının aktif ve yardımcı içerikleri ayrı tutulur. Bunlar güncel fiziksel ambalajla karşılaştırılmış veya klinik olarak doğrulanmış formüller değildir.

**51 kayıt**, temel yüz rutini için içerik/kategori/kullanım alanı kontrollerinde açık eksik veya kapsam dışı durum göstermedi. Bunlar yalnızca **aday havuzudur**. Hiçbir kayıt otomatik olarak uzman onaylı veya kişiye güvenli ilan edilmedi. Diğer kayıtlarda inceleme nedenleri açıkça bulunur.

Üç La Roche-Posay ürün kaynağı erişim engeli nedeniyle veri setine alınmadı. Beauty of Joseon ve Geek & Gorgeous katalog uçları hız/erişim kısıtı döndürdü; engeller aşılmadı ve bu markalar ürün sayısına eklenmedi.

## Kullanılacak çıktılar

- `output/products.json`: Tüm kayıtlar, içerik bölümleri ve alan kaynakları.
- `output/products.csv`: Excel'de açılabilen karşılık.
- `output/baseline_candidates.json`: Teknik ön elemeden geçen 51 kayıt.
- `output/quality-summary.json`: Sayılar ve kalite özeti.
- `output/rejected_sources.json`: Alınamayan ürün kaynakları.
- `output/validation-report.json`: 14 veri denetiminin sonucu.
- `output/release-review.json`: 30 kayıt için teknik izin listesi ve diğer kayıtların eleme nedenleri.
- `../src/data/catalog-release.json`: Uygulamaya bağlanan sürümlü 30 kayıt.
- `output/changes.json`: Önceki çıktıya göre formül/etiket değişiklikleri.
- `guidance.json`: 7 birincil kaynak ve bunlardan türetilen sınırlı seçim ilkeleri. Uygulamadaki sınırlı temel rutin kurallarının dayanak ve sınırlarını açıklar.

## Her kayıtta ne var?

Tam ürün adı, marka, kategori, pazar, kaynak ve yönlendirilmiş URL, çekim zamanı, kaynak dosya özeti, ayrıştırıcı sürümü, tam içerik bölümleri, korunmuş içerik adları, açıkça listelenen aktif yüzdeleri, üretici etiket ifadeleri ve bunların bölüm konumları, çıkarılabilen SPF ve kullanım zamanı, formül parmak izi ve kalite sorunları.

Kaynakta bulunmayan kullanım zamanı/etiket bilgisi boş bırakılır. Üreticinin hassas cilt, parfümsüz veya non-komedojenik ifadesi bağımsız etkinlik kanıtı gibi sunulmaz. İçerik sırasından oran, bulunmayan anahtar kelimeden alerji güvenliği veya fotoğraf skorundan hastalık çıkarılmaz.

Özel olarak ayrılanlar: **masking fragrance**, denatüre/etanol türü alkol ile yağ alkolleri, niasinamid, hyaluronik asit ailesi, seramidler, retinoidler ve açık ilaçlı/peeling kapsamı. Bunlar içerik eşleştirme alanlarıdır; otomatik uygunluk puanı değildir.

## Neden istek başına site taraması yok?

Tekrarlanabilir toplu çekim + kontrol edilmiş veri sürümü seçildi. Kullanıcıya öneri verilirken sitelerden anlık ve kontrolsüz metin alınmaz. Bu sayede aynı veri sürümü incelenebilir, formül değişikliği izlenebilir ve bozuk kayıtlar öneriye sızmaz.

## Çalıştırma

Mevcut bilgisayarda bağımlılıklar kurulu. Yeni makinede proje npm bağımlılıklarını kurduktan sonra:

```text
python -m pip install --target data-research/.vendor -r data-research/requirements.txt
```

Mevcut sayfa önbelleğinden **ağ bağlantısı olmadan** veri oluşturma ve doğrulama:

```text
python data-research/run.py
```

Yedi günden eski kaynakları yeniden doğrulama:

```text
python data-research/run.py --refresh
```

Elle istenen tam kaynak yenilemesi:

```text
python data-research/run.py --refresh --force
```

Kategori önbelleğinden yeni ürün keşfi:

```text
python data-research/run.py --discover
```

`403/429` yanıtları aşılmaz; kısıtlanan kaynaklar için 24 saat bekleme korunur. Yenileme `ETag` ve `Last-Modified` destekliyorsa kullanır. Değişen kaynakların önceki sürümleri `snapshots/` altında kalır. Formül değişiklikleri `changes.json` içinde yeniden inceleme gerektirir.

## Doğrulamanın sınırı

14 kontrol, içerik çıkarımı ve kaynak bütünlüğünü sınar. Dermatolog değerlendirmesi veya kişisel ürün başarısı kanıtı değildir. Ham çıkarımdaki `recommendation_ready` ve `clinical_effectiveness_validated` alanları değiştirilmez: bunlar uzman onayı taşımaz. Ayrı `release-review.json`, yalnız temel kategori ve etiket eşleştirmesi için teknik izin listesidir. Uygulama ayrıca 240 profil/kısıt kombinasyonuyla sınanır; bu testler klinik başarı ölçmez. Yeni kaynak sürümlerini yayımlamadan önce farkları inceleyin.

Kaynaklar **ABD üretici referanslarıdır**. Türkiye'deki aynı isimli bir ürünün aynı formüle sahip olduğu varsayılmaz. Ürünlerin satın alma bağlantısı, fiyatı, kullanıcı yorumları veya puanları çıktı veri setine alınmaz.

## Uygulanan ek seçim sınırları

Açık üretici cilt tipi etiketi bulunmayan, yeniden formüle edilen veya yalnız gece kullanımı bildirilen kayıtlar ortak rutinden çıkarılır. Güneş koruyucu için SPF 30+, geniş spektrum ve 40/80 dakika suya dayanıklılık ifadeleri ayrı ayrı yakalanmalıdır. Parfümsüz etiketiyle içerik listesi çelişirse ürün elenir. Fotoğraf skoruna göre cilt tipi veya tedavi seçilmez.
