export type QuestionStyle = "dengeli" | "eğlendirici" | "düşündürücü";

export interface DemoQuestion {
  text: string;
  category: "reflection" | "teamwork" | "improvement" | "fun";
  gameCategory: "work" | "entertainment";
}

export const questionStyles = ["dengeli", "eğlendirici", "düşündürücü"] as const;

const work = (text: string, category: "reflection" | "teamwork" | "improvement"): DemoQuestion => ({ text, category, gameCategory: "work" });
const fun = (text: string): DemoQuestion => ({ text, category: "fun", gameCategory: "entertainment" });

export const demoQuestionPools: Readonly<Record<QuestionStyle, readonly DemoQuestion[]>> = {
  dengeli: [
    work("Bu dönemde en iyi yaptığımız şey neydi?", "reflection"),
    work("Bizi en çok yavaşlatan engel neydi?", "improvement"),
    work("Bir ekip arkadaşının hangi katkısı sana yardımcı oldu?", "teamwork"),
    work("Bir sonraki dönemde neyi farklı yapmalıyız?", "improvement"),
    work("Bilgi paylaşımında hangi alışkanlığımızı sürdürmeliyiz?", "teamwork"),
    work("Hangi süreci sadeleştirebiliriz?", "improvement"),
    work("Takım olarak hangi güçlü yönümüz öne çıktı?", "reflection"),
    work("Hemen deneyebileceğimiz küçük ama etkili iyileştirme nedir?", "improvement"),
    fun("Bu dönemi tek bir emojiyle nasıl anlatırdın?"),
    fun("Takımımızın bu dönemki süper gücü neydi?"),
    fun("Bu dönemin fon müziği hangi şarkı olurdu?"),
    fun("Takımımıza yeni bir gelenek eklesen bu ne olurdu?"),
    fun("Bugünkü enerjini bir hava durumuyla nasıl anlatırsın?"),
    fun("Bu döneme kısa bir başlık versen ne olurdu?"),
    fun("Bir sonraki dönem için takım sloganımız ne olsun?"),
  ],
  "eğlendirici": [
    work("Takım çalışmamıza bir oyun puanı versen kaç verirdin, neden?", "reflection"),
    work("Bu dönemin final boss’u hangi iş engeliydi?", "improvement"),
    work("Bir iş sürecine sihirli güç ekleyebilseydin hangisini seçerdin?", "improvement"),
    work("Takımın iş birliği süper gücü neydi?", "teamwork"),
    work("Toplantıları daha verimli yapacak eğlenceli bir kural ne olabilir?", "improvement"),
    work("En hızlı çözdüğümüz işe hangi madalyayı verirdin?", "reflection"),
    work("Sprint panomuz konuşabilse hangi iş tavsiyesini verirdi?", "improvement"),
    work("Bir ekip arkadaşına iş birliği rozeti versen hangi katkısı için verirdin?", "teamwork"),
    fun("Bu dönem bir film olsaydı adı ne olurdu?"),
    fun("Takımımızın maskotu hangi hayvan olurdu?"),
    fun("Bu süreci yalnızca GIF’lerle anlatsan ilk GIF ne olurdu?"),
    fun("Takım kanalımızın fon müziği hangi şarkı olurdu?"),
    fun("Plan dışı işler bir karakter olsaydı nasıl görünürdü?"),
    fun("Bu dönemde en çok kullanılan takım cümlemiz hangisiydi?"),
    fun("Takımımız bir dizi olsaydı bu bölümün adı ne olurdu?"),
  ],
  "düşündürücü": [
    work("Konuşmaktan kaçındığımız ama ele almamız gereken konu ne?", "reflection"),
    work("Hangi varsayımımız yanlış bir karara yol açmış olabilir?", "reflection"),
    work("Kimin sesi kararlarımızda yeterince duyulmuyor olabilir?", "teamwork"),
    work("Sürekli tekrarlanan bir sorunun kök nedeni ne olabilir?", "improvement"),
    work("Zaman baskısı kaliteyle ilgili hangi ödünlere yol açtı?", "reflection"),
    work("Takımın sürdürülebilir temposunu tehdit eden alışkanlık ne?", "improvement"),
    work("İletişimde niyetimiz ile yarattığımız etki nerede ayrıştı?", "reflection"),
    work("Bugün verebileceğimiz en somut iyileştirme sözü nedir?", "improvement"),
    fun("Bu dönemi anlatan bir kitap yazsaydın son cümlesi ne olurdu?"),
    fun("Bir zaman makinen olsa hangi ana dönüp neyi gözlemlerdin?"),
    fun("Takımımızın görünmeyen kahramanı hangi davranıştı?"),
    fun("Bu deneyimi bir metaforla anlatsan neye benzetirdin?"),
    fun("Gelecekteki takımımıza tek bir mesaj göndersen ne yazardın?"),
    fun("Bu dönemin en şaşırtıcı dönüm noktası hangisiydi?"),
    fun("Takım kültürümüzü temsil eden hayali bir nesne ne olurdu?"),
  ],
};
