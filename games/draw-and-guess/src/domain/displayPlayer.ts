/**
 * PlayerList/ScoreBoard'un ihtiyaç duyduğu en küçük ortak şekil — hem sahte
 * (standalone) hem gerçek oda oyuncuları (RoomPlayerSnapshot) bu şekle
 * indirgenip aynı bileşenlerden geçebiliyor.
 */
export interface DisplayPlayer {
  id: string;
  name: string;
  color: string;
  isYou?: boolean;
}
