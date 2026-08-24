import type { WordPack } from '../domain/types';

export const backgrounds = [
  { id: 'balcony', label: 'Manzaralı Oda', url: '/assets/background-balcony.jpg' },
  { id: 'pink-room', label: 'Pembe Oda', url: '/assets/background-pink-room.jpg' },
  { id: 'beach', label: 'Sahil', url: '/assets/background-beach.jpg' },
] as const;

/** Local preview fallback. Online rounds receive the same demo catalogue from
 * the authoritative server through a participant-specific snapshot. */
export const fallbackWordPacks: readonly WordPack[] = [
  { category: 'Çevik Süreç', secretWord: 'Sprint', retroQuestion: 'Bu sprintte ne daha iyi yapılabilirdi?' },
  { category: 'Çevik Süreç', secretWord: 'Backlog', retroQuestion: 'Backlog’umuzu daha anlaşılır ve öncelikli hale getirmek için neyi değiştirmeliyiz?' },
  { category: 'Çevik Süreç', secretWord: 'Daily', retroQuestion: 'Daily toplantılarımızı daha kısa ve faydalı yapmak için neyi iyileştirebiliriz?' },
  { category: 'Çevik Süreç', secretWord: 'Retrospektif', retroQuestion: 'Retrospektif toplantılarımızdan daha somut aksiyonlar çıkarmak için ne yapabiliriz?' },
  { category: 'Çevik Süreç', secretWord: 'Planning', retroQuestion: 'Sprint planlamasında tahmin ve kapsam dengesini nasıl iyileştirebiliriz?' },
  { category: 'Çevik Süreç', secretWord: 'Demo', retroQuestion: 'Demo toplantılarında geri bildirimi daha etkili toplamak için neyi değiştirebiliriz?' },
  { category: 'Teslimat', secretWord: 'Release', retroQuestion: 'Bu release sürecinde ne daha sorunsuz ilerleyebilirdi?' },
  { category: 'Teslimat', secretWord: 'Deadline', retroQuestion: 'Deadline yaklaşırken iş yükünü daha sağlıklı yönetmek için ne yapabilirdik?' },
  { category: 'İletişim', secretWord: 'Toplantı', retroQuestion: 'Toplantılarımızı daha odaklı ve karar odaklı hale nasıl getirebiliriz?' },
  { category: 'Ekip', secretWord: 'Kahve', retroQuestion: 'Kahve molaları gibi gayriresmî anları ekip bağını güçlendirmek için nasıl kullanabiliriz?' },
  { category: 'Araçlar', secretWord: 'Jira', retroQuestion: 'Jira kullanımında görünürlüğü ve güncelliği artırmak için neyi iyileştirebiliriz?' },
  { category: 'İletişim', secretWord: 'Slack', retroQuestion: 'Slack iletişiminde gürültüyü azaltıp önemli bilgileri görünür tutmak için ne yapabiliriz?' },
  { category: 'İletişim', secretWord: 'E-posta', retroQuestion: 'E-posta iletişimimizi daha açık ve sonuç odaklı hale nasıl getirebiliriz?' },
  { category: 'İletişim', secretWord: 'Sunum', retroQuestion: 'Sunumlarımızda ana mesajı daha anlaşılır aktarmak için neyi geliştirebiliriz?' },
  { category: 'Planlama', secretWord: 'Takvim', retroQuestion: 'Takvim planlamasında odak zamanını daha iyi korumak için ne yapabiliriz?' },
  { category: 'Çalışma Biçimi', secretWord: 'Uzaktan Çalışma', retroQuestion: 'Uzaktan çalışırken iletişim ve aidiyeti güçlendirmek için neyi iyileştirebiliriz?' },
  { category: 'Ürün', secretWord: 'Müşteri', retroQuestion: 'Müşteri ihtiyacını daha erken ve doğru anlamak için hangi adımı geliştirebiliriz?' },
  { category: 'Ekip', secretWord: 'Geri Bildirim', retroQuestion: 'Geri bildirimleri daha zamanında ve yapıcı vermek için neyi değiştirebiliriz?' },
  { category: 'Planlama', secretWord: 'Aksiyon', retroQuestion: 'Retrospektif aksiyonlarının gerçekten tamamlanması için neyi daha iyi takip edebiliriz?' },
  { category: 'Planlama', secretWord: 'Öncelik', retroQuestion: 'Öncelikleri ekip içinde daha net ve ortak hale getirmek için ne yapabiliriz?' },
  { category: 'Planlama', secretWord: 'Hedef', retroQuestion: 'Hedeflerimizin ölçülebilir ve anlaşılır olması için neyi iyileştirebiliriz?' },
  { category: 'Çevik Süreç', secretWord: 'Engel', retroQuestion: 'Engelleri daha erken görünür kılıp çözmek için neyi değiştirebiliriz?' },
  { category: 'Planlama', secretWord: 'Risk', retroQuestion: 'Riskleri daha erken fark etmek ve sahiplenmek için hangi alışkanlığı geliştirebiliriz?' },
  { category: 'Teknik', secretWord: 'Hata', retroQuestion: 'Hataları daha erken yakalamak ve tekrarını önlemek için neyi iyileştirebiliriz?' },
  { category: 'Teknik', secretWord: 'Test', retroQuestion: 'Test sürecimizin güvenilirliğini ve hızını artırmak için ne yapabiliriz?' },
  { category: 'Teknik', secretWord: 'Code Review', retroQuestion: 'Code review sürecini daha hızlı ve öğretici hale getirmek için neyi değiştirebiliriz?' },
  { category: 'Teknik', secretWord: 'Pull Request', retroQuestion: 'Pull request’lerin daha kolay incelenmesi için hangi standardı geliştirebiliriz?' },
  { category: 'Teknik', secretWord: 'Deploy', retroQuestion: 'Deploy sürecinde riski ve stresi azaltmak için neyi iyileştirebiliriz?' },
  { category: 'Teknik', secretWord: 'Dokümantasyon', retroQuestion: 'Dokümantasyonun güncel ve kolay bulunur kalması için ne yapabiliriz?' },
  { category: 'Planlama', secretWord: 'Kapasite', retroQuestion: 'Ekip kapasitesini planlarken aşırı yüklenmeyi önlemek için neyi daha iyi yapabiliriz?' },
];
