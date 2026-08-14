# Retro Platform AI Bot

Birden fazla retrospektif oyunu için soru hazırlayan bağımsız servistir. Gemini etkinse oda kurulurken verilen rapor ve kısa açıklamadan 15 soru üretir. Gemini kullanılamazsa seçilen Dengeli, Eğlendirici veya Düşündürücü kategorisine ait 15 yerel soruya otomatik geçer.

## Gizlilik modeli

- Prompt veya rapor metni saklanmaz.
- Üretilen sorular yalnızca RAM'de oda koduyla tutulur.
- Oda kapatıldığında `DELETE /rooms/{roomCode}` çağrısı veriyi hemen siler.
- Kapanış çağrısı unutulursa soru paketi `SESSION_TTL_MINUTES` sonunda otomatik silinir.
- Veritabanı ve dosya tabanlı oturum kaydı yoktur.
- Gemini isteği yalnızca soru üretimi sırasında yapılır; uygulama prompt veya raporu kalıcı olarak saklamaz.
- Loglara prompt, rapor veya soru içeriği yazılmaz.

Web veya ASP.NET backend PDF/DOCX dosyasını geçici olarak metne çevirmeli ve yalnızca `reportText` alanını göndermelidir. Bot dosya kabul etmez.

## Ayarlar

```env
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-2.5-flash-lite
QUESTION_PROVIDER=demo
PORT=3002
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
SESSION_TTL_MINUTES=180
INTERNAL_SERVICE_KEY=your-internal-service-key-here
```

`INTERNAL_SERVICE_KEY` gerçek bir değer alırsa `/health` dışındaki bütün isteklerde aynı değer şu header ile gönderilmelidir:

```http
X-Internal-Service-Key: secret-value
```

Gerçek `.env` Git tarafından yok sayılır. Hiçbir gerçek anahtarı `.env.example` içine yazmayın. Gemini kullanmak için `.env` içinde `QUESTION_PROVIDER=gemini` yapın ve gerçek `GEMINI_API_KEY` değerini ekleyin. Anahtar geçersizse, kota biterse veya ağ hatası oluşursa servis demo havuzuna düşer.

Üretimde `NODE_ENV=production` ve virgülle ayrılmış kesin HTTPS originlerinden oluşan `ALLOWED_ORIGINS` zorunludur. `ALLOWED_ORIGIN` eski tek-origin ayarları için desteklenir. `QUESTION_PROVIDER=gemini` seçildiğinde `GEMINI_API_KEY` zorunludur ve eksikse servis anahtar değerini yazdırmadan durur. Tarayıcıya açık mevcut mimaride `INTERNAL_SERVICE_KEY` değerini hiçbir `VITE_*` değişkenine koymayın; bu seçenek yalnızca ileride sunucudan sunucuya bir proxy kullanıldığında güvenlidir.

## Çalıştırma

```powershell
cd ai-bot
npm install
npm run dev
```

Derlenmiş sürüm:

```powershell
npm run build
npm start
```

## API

### Sağlık kontrolü

```http
GET /health
```

### Oda için soru üretme

Kısa prompt ile:

```http
POST /rooms/ABC234/questions
Content-Type: application/json

{
  "gameId": "spin-the-bottle",
  "topic": "genel retrospektif",
  "language": "tr",
  "style": "dengeli",
  "count": 15
}
```

Rapor metni ile:

```json
{
  "gameId": "retro-rush",
  "reportText": "Anonimleştirilmiş rapor içeriği...",
  "language": "tr",
  "style": "düşündürücü",
  "count": 15
}
```

`topic` ve `reportText` birlikte de gönderilebilir. `topic` en fazla 500, `reportText` en fazla 20.000 karakterdir. Oda endpoint'i tam 15 soru kabul eder.

### Soruları alma

```http
GET /rooms/ABC234/questions
```

Bu endpoint seçilen oyunun kullanacağı soru paketini döndürür. Paket `gameId`, `questionSetId`, süre bilgileri ve soruları içerir.

### Odayı ve soruları silme

```http
DELETE /rooms/ABC234
```

ASP.NET backend, moderatör odayı kapattığında veya oyun oturumu sona erdiğinde bu endpoint'i çağırmalıdır.

### Stateless üretim

Geliştirme testi için `POST /questions/generate` korunmuştur. Bu endpoint soru üretir fakat RAM'e kaydetmez.

## Yeni oyun ekleme

`src/data/gameProfiles.ts` içine oyun mekaniği ve kategori profili ekleyin. Tanımlanmayan `gameId` değerleri genel retrospektif profiliyle çalışır; servis bu nedenle yeni oyunlarla da geriye dönük uyumludur.

## Kontroller

```powershell
npm run typecheck
npm test
npm run build
```
