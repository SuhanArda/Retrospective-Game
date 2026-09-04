# Retro Platform AI Question Service

Bu servis chatbot değildir. Moderatörün prompt veya desteklenen rapor dosyasından tam 20 doğrulanmış retrospektif sorusu üretir ve bunları oyun adına değil oda kimliğine göre RAM'de tutar.

## Mimari ve yaşam döngüsü

- Tek soru bankası: `Map<roomId, RoomAIState>`.
- `gameId` üretim endpoint'inin parçası değildir; yeni oyun AI servisinde bir allowlist/case gerektirmez.
- Oyun değişimi, tur bitişi, component unmount ve geçici socket kopması soru bankasını silmez veya Gemini çağrısı başlatmaz.
- Oda backend tarafından gerçekten kapatıldığında ASP.NET servisi `DELETE /rooms/{roomId}?roomInstanceId=...` çağrısını yapar.
- `roomInstanceId`, aynı oda kodunun yeniden kullanılması ve oda kapandıktan sonra geç gelen Gemini sonuçlarına karşı koruma sağlar.
- Otomatik süre dolumu açık odaları silebileceği için kullanılmaz. Process yeniden başlarsa, tek sunuculu RAM mimarisinin doğal sonucu olarak odalar ve sorular birlikte kaybolur.
- Yeni üretim başarıyla doğrulanana kadar eski banka hizmet vermeye devam eder; hata olursa eski banka korunur.
- Hiç geçerli banka yokken Gemini kullanılamazsa mevcut demo havuzlarından ortak 20 soru hazırlanır.

Prompt, rapor ve ham Gemini yanıtı loglanmaz veya diske/veritabanına yazılmaz. Ücretsiz bir Gemini hesabının sağlayıcı tarafındaki veri saklama koşullarını sıfır saklama olarak varsaymayın.

## Ayarlar

```env
AI_PROVIDER=local
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
AI_REQUEST_TIMEOUT_MS=30000
AI_MAX_RETRIES=2
AI_ROOM_RATE_LIMIT_MS=5000
AI_QUESTION_BANK_PATH=./data/generated-question-bank.json
AI_QUESTION_BANK_MAX_ITEMS=1000
MAX_REPORT_SIZE_MB=5
PORT=3002
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
INTERNAL_SERVICE_KEY=your-internal-service-key-here
NODE_USE_SYSTEM_CA=1
```

`AI_PROVIDER=local` bilerek Gemini çağrısı yapmaz; doğrudan yerel havuzu kullanır. Gerçek Gemini üretimi için `ai-bot/.env` içinde `AI_PROVIDER=gemini` ve geçerli bir `GEMINI_API_KEY` birlikte ayarlanmalıdır. Eski `QUESTION_PROVIDER=demo` değeri geriye uyumluluk nedeniyle `local` olarak yorumlanır. `dev` ve `start` komutlarındaki Node `--env-file-if-exists=.env` seçeneği `.env` dosyasını `src/server.ts` veya derlenmiş `dist/server.js` yüklenmeden önce okur; ayrıca `dotenv` başlatması gerekmez.

`AI_QUESTION_BANK_PATH`, başarılı Gemini üretimlerinden gelen soruların yazıldığı çalışma zamanı JSON dosyasını belirler. Varsayılan konum `./data/generated-question-bank.json` dosyasıdır. `AI_QUESTION_BANK_MAX_ITEMS` dosyada tutulacak en fazla soru sayısını belirler; varsayılan değer `1000`'dir ve sınır aşılırsa en eski kayıtlar budanır.

Fallback sırası şöyledir:

1. Gemini tarafından üretilip doğrulanan sorular
2. Kalıcı soru bankasından stil ve konuya göre seçilen, az ve uzun süre önce kullanılmış sorular
3. Eksik kalan yerler için yerleşik yerel/demo soruları

Soru bankası yalnızca soru metnini ve seçim için gereken sınırlı metaveriyi saklar: açıkça sağlanan konu, stil, dil, iş/eğlence sınıflandırması, oluşturulma zamanı ve kullanım sayaçları. Rapor metni veya dosyası, cevaplar, seçenekler, katılımcı/oda bilgileri, kimlik bilgileri ve anahtarlar diske yazılmaz. Çalışma zamanı dosyası git tarafından yok sayılır.

Dosya yazımları süreç içi bir kuyrukla sıralanır ve aynı dizindeki geçici dosyanın yeniden adlandırılmasıyla tamamlanır. Eksik dosya boş banka kabul edilir. Boş, bozuk veya desteklenmeyen şemalı dosya servisi durdurmaz; mümkünse `.corrupt-<timestamp>` adıyla korunur ve yerel fallback kullanılmaya devam eder.

Render ve diğer container ortamlarında uygulama dosya sistemi deploy veya restart sırasında kalıcı olmayabilir. Üretilen soruların bu olaylardan sonra da korunması gerekiyorsa `AI_QUESTION_BANK_PATH` değerini sağlayıcının kalıcı disk/volume mount'undaki bir yola ayarlayın. `QuestionBank` arayüzü, JSON katmanının ileride SQLite, veritabanı veya nesne depolama ile üretim akışı değiştirilmeden değiştirilmesini sağlar.

Gemini için resmi `@google/genai` SDK'sı backend içinde kullanılır. API anahtarını hiçbir `VITE_*` değişkenine veya frontend koduna koymayın. Üretimde `INTERNAL_SERVICE_KEY`, ASP.NET tarafındaki `AiQuestions__InternalServiceKey` ile aynı olmalıdır.

## İç servis API'si

### Oda bankasını hazırla veya atomik yenile

```http
POST /rooms/ABC234/questions
X-Internal-Service-Key: ...
Content-Type: application/json

{
  "roomInstanceId": "server-room-guid",
  "topic": "ekip iletişimi",
  "language": "tr",
  "style": "dengeli",
  "count": 20,
  "replaceExisting": false
}
```

`reportText` veya doğrulanan `reportFile` da kullanılabilir. `replaceExisting=false` mevcut bankayı döndürür ve Gemini çağrısı yapmaz. `replaceExisting=true` yeni bankayı arka planda üretir; doğrulama tamamlanınca atomik değişim yapılır.

### Oda bankasını al

```http
GET /rooms/ABC234/questions?roomInstanceId=server-room-guid
```

### Gerçek oda kapanışında temizle

```http
DELETE /rooms/ABC234?roomInstanceId=server-room-guid
```

Tarayıcılar bu endpoint'lere doğrudan erişmez. Yetkilendirme ve oda açık/host kontrolleri ASP.NET üzerindeki `/api/rooms/{roomId}/ai/questions` endpoint'inde yapılır.

## Çalıştırma ve kontrol

```powershell
npm install
npm run dev:ai-bot       # terminal 1, http://localhost:3002
npm run dev:server       # terminal 2, http://localhost:5281
npm run dev:web          # terminal 3, http://localhost:5173
# veya tüm yerel uygulamalarla birlikte:
npm run dev:all
npm run test:ai-bot
npm run build:ai-bot
```

Backend üzerinden çağrı yapılacaksa backend `AiQuestions__BaseUrl` değeri AI-bot adresini göstermeli ve backend `AiQuestions__InternalServiceKey` değeri AI-bot `INTERNAL_SERVICE_KEY` ile birebir aynı olmalıdır. PowerShell oturumunda güvenli yerel başlatma örneği:

```powershell
$env:INTERNAL_SERVICE_KEY = '<local-shared-key>'
$env:AiQuestions__BaseUrl = 'http://localhost:3002/'
$env:AiQuestions__InternalServiceKey = $env:INTERNAL_SERVICE_KEY
npm run dev:server
```

Backend'i ayırarak AI-bot'u doğrudan sınamak için:

```powershell
$headers = @{ 'X-Internal-Service-Key' = $env:INTERNAL_SERVICE_KEY }
$body = @{
  topic = 'Sprint iletişimi ve iyileştirme alanları'
  language = 'tr'
  style = 'dengeli'
  count = 20
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri 'http://localhost:3002/questions/generate' `
  -Headers $headers `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

Başlangıç logundaki `provider=gemini` Gemini'nin seçildiğini doğrular. İstek logları sırasıyla HTTP kabulü, kimlik doğrulama, Gemini çağrısı/yanıtı, parse-doğrulama sonucu ve nihai `source=gemini`, `source=question-bank` veya `source=local-fallback` kaynağını gösterir. Prompt, rapor, Gemini yanıt metni ve anahtarlar loglanmaz.

Servis klasöründen eşdeğer komutlar:

```powershell
cd ai-bot
npm run dev
npm run typecheck
npm test
npm run build
```
