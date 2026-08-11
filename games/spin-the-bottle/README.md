# Spin the Bottle

Online toplantılar için cozy, retro piksel görünümlü şişe çevirmece oyunu.

## Projeyi açma

1. VS Code içinde **File → Open Folder** seçin.
2. Bu projenin klasörünü açın.
3. İlk çalıştırmada terminalden `npm install` yazın.
4. `Terminal → Run Task → Spin the Bottle: Localhost` görevini seçin.
5. Tarayıcıda [http://localhost:3000](http://localhost:3000) adresini açın.

Görevi durdurmak için terminal seçiliyken `Control + C` tuşlarına basın.

## Komutlar

- `npm run dev`: oyunu localhost üzerinde başlatır.
- `npm run build`: projenin hatasız derlendiğini kontrol eder.

## Düzenlenecek ana dosyalar

- `app/page.tsx`: oyun akışı, sorular, katılımcılar ve emoji tepkileri.
- `app/globals.css`: arayüz, piksel görünümü ve animasyonlar.
- `public/sprites/`: kedi ve süt şişesi görselleri.
- `public/music/`: oyunda kullanılan arka plan müziği.
- `public/cozy-room.png`: salon arka planı.

Yerel geliştirme sırasında yapılan değişiklikler kaydedildiği anda tarayıcıya otomatik yansır.

## Ana web sitesinden oyuncu isimleri

Oyuncu isimleri bağlantıdaki `players` parametresiyle gönderilebilir:

```text
http://localhost:3000/?players=Ayşe,Mert,Deniz,Ece,Can,Selin
```

İsim gönderilmezse oyun `Oyuncu 1`–`Oyuncu 6` etiketlerini kullanır. İsimlerde
boşluk veya Türkçe karakter varsa ana site bağlantıyı `encodeURIComponent` ile
oluşturmalıdır.

## ZIP dosyasını aktarma

Hazırlanan ZIP'i bir klasöre çıkarın, VS Code'da **File → Open Folder** ile o
klasörü seçin ve terminalde sırasıyla `npm install` ile `npm run dev` çalıştırın.

## Müzik

Oyunda kullanılan `Cat Song 1.2`, Dan Knoflicek tarafından hazırlanmıştır ve
CC0 lisansıyla paylaşılmıştır. Kaynak:
[OpenGameArt – Cat Song](https://lpc.opengameart.org/content/cat-song).
