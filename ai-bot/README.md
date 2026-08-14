# Retro Platform AI Bot

Bu servis chatbot değildir; yalnızca oda bazlı, yapılandırılmış oyun soruları üretir.

## Gizlilik sınırı

`AI_PROVIDER=local` varsayılan ve özel veriler için önerilen moddur. Bu mod ağ üzerinden bir model sağlayıcısına veri göndermez ve yerel demo havuzunu kullanır. `AI_PROVIDER=gemini` seçildiğinde anonimleştirilmiş prompt/rapor metni Google Gemini API'ye gönderilir. Oda kapanınca yerel RAM referanslarının silinmesi, sağlayıcı tarafındaki kopyaların silindiğini garanti etmez. Ücretsiz Gemini kullanımını sıfır veri saklamalı kabul etmeyin; gizli şirket raporları için kurumun onayladığı hesap, sözleşme ve veri işleme koşulları kullanılmalıdır.

Servis Gemini File API, context caching, grounding, araç veya function calling kullanmaz. Sorular ve kaynak içerik veritabanına ya da dosyaya yazılmaz. Process içi `Map` tek backend instance'ı varsayar; birden fazla instance dağıtımında persistence kapalı ortak bir ephemeral store gerekir.

Birden fazla retrospektif oyunu için soru hazırlayan bağımsız servistir. Soru sayısı ve oyun kuralları `src/data/gameProfiles.ts` içindeki profilden gelir: Retro Rush 20, Spin the Bottle ise mevcut oyun kuralını koruyarak 15 iş + 15 eğlence sorusu kullanır. Gemini kullanılamazsa aynı profile uygun yerel demo havuzuna otomatik geçer.

## Gizlilik modeli

- Prompt veya rapor metni saklanmaz.
- Üretilen sorular yalnızca RAM'de oda koduyla tutulur.
- Oda kapatıldığında `DELETE /rooms/{roomCode}` çağrısı veriyi hemen siler.
- Kapanış çağrısı unutulursa soru paketi `SESSION_TTL_MINUTES` sonunda otomatik silinir.
- Veritabanı ve dosya tabanlı oturum kaydı yoktur.
- Gemini isteği yalnızca soru üretimi sırasında yapılır; uygulama prompt veya raporu kalıcı olarak saklamaz.
- Loglara prompt, rapor veya soru içeriği yazılmaz.
- Aynı oda için eşzamanlı üretim engellenir ve istekler `AI_ROOM_RATE_LIMIT_MS` ile sınırlandırılır.

TXT, PDF ve DOCX raporları uzantı, MIME, imza ve boyut doğrulamasından sonra yalnızca RAM içinde metne çevrilir. Makro, script, bağlantı veya gömülü executable çalıştırılmaz; geçici dosya oluşturulmaz. DOCX arşivleri sıkıştırma bombasına karşı toplam açılmış boyut sınırından geçirilir.

## Ayarlar

```env
GEMINI_API_KEY=your-api-key-here
GEMINI_MODEL=gemini-3.1-flash-lite
AI_PROVIDER=local
PORT=3002
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175
SESSION_TTL_MINUTES=180
INTERNAL_SERVICE_KEY=your-internal-service-key-here
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_ROOM_RATE_LIMIT_MS=5000
```

`INTERNAL_SERVICE_KEY` gerçek bir değer alırsa `/health` dışındaki bütün isteklerde aynı değer şu header ile gönderilmelidir:

```http
X-Internal-Service-Key: secret-value
```

Gerçek `.env` Git tarafından yok sayılır. Hiçbir gerçek anahtarı `.env.example` içine yazmayın. Gemini kullanmak için `.env` içinde `AI_PROVIDER=gemini` yapın ve gerçek `GEMINI_API_KEY` değerini ekleyin. Eski `QUESTION_PROVIDER` adı geriye dönük uyumluluk için desteklenir. Anahtar geçersizse, kota biterse veya ağ hatası oluşursa servis demo havuzuna düşer.

Üretimde `NODE_ENV=production` ve virgülle ayrılmış kesin HTTPS originlerinden oluşan `ALLOWED_ORIGINS` zorunludur. `ALLOWED_ORIGIN` eski tek-origin ayarları için desteklenir. `AI_PROVIDER=gemini` seçildiğinde `GEMINI_API_KEY` zorunludur ve eksikse servis anahtar değerini yazdırmadan durur. `INTERNAL_SERVICE_KEY`, ASP.NET proxy'deki `AiQuestions__InternalServiceKey` ile aynı olmalı ve hiçbir `VITE_*` değişkenine konulmamalıdır.

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
  "count": 20
}
```

Rapor metni ile:

```json
{
  "gameId": "retro-rush",
  "reportText": "Anonimleştirilmiş rapor içeriği...",
  "language": "tr",
  "style": "düşündürücü",
  "count": 20
}
```

`topic` ve `reportText` birlikte de gönderilebilir. `topic` en fazla 500, `reportText` en fazla 20.000 karakterdir. Oda endpoint'i tam 20 soruluk, oyunlardan bağımsız `room-retrospective` profilini uygular. Aynı odaya başka bir oyun için yeniden POST gönderilirse yeni Gemini çağrısı yapılmaz; mevcut oda paketi döndürülür.

### Soruları alma

```http
GET /rooms/ABC234/questions?gameId=retro-rush
```

Bu endpoint aktif oyunu doğrular fakat oda için tutulan tek ortak soru paketini döndürür. Paket `questionSetId`, `status`, süre bilgileri ve 20 soruyu içerir. Spin the Bottle ve Retro Rush bu ortak biçimi kendi küçük adapter'larıyla oyun biçimine dönüştürür.

### Odayı ve soruları silme

```http
DELETE /rooms/ABC234
```

ASP.NET backend, moderatör odayı kapattığında veya oyun oturumu sona erdiğinde bu endpoint'i çağırmalıdır.

### Stateless üretim

Geliştirme testi için `POST /questions/generate` korunmuştur. Bu endpoint soru üretir fakat RAM'e kaydetmez.

## Yeni oyun ekleme

Yeni oyun kimliğini güvenli oda oyunları listesine ekleyin ve oyunun beklediği veri biçimi için yalnızca bir `GameQuestionAdapter` yazın. Oyun bileşeni yeni soru üretmemeli veya oda için ayrı paket oluşturmamalıdır; ortak `RoomQuestionProvider` paketini tüketmelidir. Tanımlanmayan `gameId` değerleri güvenlik nedeniyle reddedilir.

## Kontroller

```powershell
npm run typecheck
npm test
npm run build
```
