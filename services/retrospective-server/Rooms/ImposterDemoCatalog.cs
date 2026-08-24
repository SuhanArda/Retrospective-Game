namespace Retrospective.Server.Rooms;

public sealed record ImposterWordDefinition(string Category, string SecretWord, string RetroQuestion);

/// <summary>
/// In-memory demo content for the authoritative Imposter game. This is kept
/// separate from room state so a persistent provider can replace it later
/// without changing the multiplayer protocol.
/// </summary>
public static class ImposterDemoCatalog
{
    public static IReadOnlySet<string> BackgroundIds { get; } = new HashSet<string>(StringComparer.Ordinal)
    {
        "balcony",
        "pink-room",
        "beach",
    };

    public static IReadOnlyList<ImposterWordDefinition> Words { get; } =
    [
        new("Çevik Süreç", "Sprint", "Bu sprintte ne daha iyi yapılabilirdi?"),
        new("Çevik Süreç", "Backlog", "Backlog’umuzu daha anlaşılır ve öncelikli hale getirmek için neyi değiştirmeliyiz?"),
        new("Çevik Süreç", "Daily", "Daily toplantılarımızı daha kısa ve faydalı yapmak için neyi iyileştirebiliriz?"),
        new("Çevik Süreç", "Retrospektif", "Retrospektif toplantılarımızdan daha somut aksiyonlar çıkarmak için ne yapabiliriz?"),
        new("Çevik Süreç", "Planning", "Sprint planlamasında tahmin ve kapsam dengesini nasıl iyileştirebiliriz?"),
        new("Çevik Süreç", "Demo", "Demo toplantılarında geri bildirimi daha etkili toplamak için neyi değiştirebiliriz?"),
        new("Teslimat", "Release", "Bu release sürecinde ne daha sorunsuz ilerleyebilirdi?"),
        new("Teslimat", "Deadline", "Deadline yaklaşırken iş yükünü daha sağlıklı yönetmek için ne yapabilirdik?"),
        new("İletişim", "Toplantı", "Toplantılarımızı daha odaklı ve karar odaklı hale nasıl getirebiliriz?"),
        new("Ekip", "Kahve", "Kahve molaları gibi gayriresmî anları ekip bağını güçlendirmek için nasıl kullanabiliriz?"),
        new("Araçlar", "Jira", "Jira kullanımında görünürlüğü ve güncelliği artırmak için neyi iyileştirebiliriz?"),
        new("İletişim", "Slack", "Slack iletişiminde gürültüyü azaltıp önemli bilgileri görünür tutmak için ne yapabiliriz?"),
        new("İletişim", "E-posta", "E-posta iletişimimizi daha açık ve sonuç odaklı hale nasıl getirebiliriz?"),
        new("İletişim", "Sunum", "Sunumlarımızda ana mesajı daha anlaşılır aktarmak için neyi geliştirebiliriz?"),
        new("Planlama", "Takvim", "Takvim planlamasında odak zamanını daha iyi korumak için ne yapabiliriz?"),
        new("Çalışma Biçimi", "Uzaktan Çalışma", "Uzaktan çalışırken iletişim ve aidiyeti güçlendirmek için neyi iyileştirebiliriz?"),
        new("Ürün", "Müşteri", "Müşteri ihtiyacını daha erken ve doğru anlamak için hangi adımı geliştirebiliriz?"),
        new("Ekip", "Geri Bildirim", "Geri bildirimleri daha zamanında ve yapıcı vermek için neyi değiştirebiliriz?"),
        new("Planlama", "Aksiyon", "Retrospektif aksiyonlarının gerçekten tamamlanması için neyi daha iyi takip edebiliriz?"),
        new("Planlama", "Öncelik", "Öncelikleri ekip içinde daha net ve ortak hale getirmek için ne yapabiliriz?"),
        new("Planlama", "Hedef", "Hedeflerimizin ölçülebilir ve anlaşılır olması için neyi iyileştirebiliriz?"),
        new("Çevik Süreç", "Engel", "Engelleri daha erken görünür kılıp çözmek için neyi değiştirebiliriz?"),
        new("Planlama", "Risk", "Riskleri daha erken fark etmek ve sahiplenmek için hangi alışkanlığı geliştirebiliriz?"),
        new("Teknik", "Hata", "Hataları daha erken yakalamak ve tekrarını önlemek için neyi iyileştirebiliriz?"),
        new("Teknik", "Test", "Test sürecimizin güvenilirliğini ve hızını artırmak için ne yapabiliriz?"),
        new("Teknik", "Code Review", "Code review sürecini daha hızlı ve öğretici hale getirmek için neyi değiştirebiliriz?"),
        new("Teknik", "Pull Request", "Pull request’lerin daha kolay incelenmesi için hangi standardı geliştirebiliriz?"),
        new("Teknik", "Deploy", "Deploy sürecinde riski ve stresi azaltmak için neyi iyileştirebiliriz?"),
        new("Teknik", "Dokümantasyon", "Dokümantasyonun güncel ve kolay bulunur kalması için ne yapabiliriz?"),
        new("Planlama", "Kapasite", "Ekip kapasitesini planlarken aşırı yüklenmeyi önlemek için neyi daha iyi yapabiliriz?"),
    ];
}
