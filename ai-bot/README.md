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
MAX_REPORT_SIZE_MB=5
PORT=3002
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
INTERNAL_SERVICE_KEY=your-internal-service-key-here
NODE_USE_SYSTEM_CA=1
```

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
npm run dev
npm run typecheck
npm test
npm run build
```
