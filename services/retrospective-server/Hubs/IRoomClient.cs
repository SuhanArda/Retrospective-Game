using Retrospective.Server.Contracts;

namespace Retrospective.Server.Hubs;

public interface IRoomClient
{
    Task RoomSnapshot(RoomSnapshot room);
    Task RoomClosed();
    Task GameStarted(GameSessionSnapshot session);
    Task ReturnedToGameSelection(RoomSnapshot room);
    Task SpinResult(SpinResult result);
    Task SpinBottleStateChanged(SpinBottleStateSnapshot state);
    Task FireResult(FireResult result);
    Task RussianRouletteStateChanged(RussianRouletteStateSnapshot state);
    Task DrawAndGuessStateChanged(DrawAndGuessStateSnapshot state);
    Task DrawAndGuessGuessSubmitted(DrawAndGuessGuessResult result);
    Task DrawAndGuessStrokeReceived(DrawAndGuessStrokeEvent stroke);
    Task DrawAndGuessShapeReceived(DrawAndGuessShapeEvent shape);
    Task DrawAndGuessCanvasCleared();
    Task DrawAndGuessWordRevealed(DrawAndGuessWordReveal reveal);
    Task ReactionReceived(RoomReaction reaction);
    Task RetroRushSnapshot(RetroRushGameSnapshot snapshot);
    Task RetroRushPlayerUpdated(RetroRushPlayerSnapshot player);
    Task RetroRushShoveApplied(RetroRushShoveApplied shove);
    Task RetroRushRocketSpawned(RetroRushRocketSnapshot rocket);
    Task RetroRushRocketHit(RetroRushRocketHitApplied hit);
    Task RetroRushAbilityApplied(RetroRushAbilityApplied ability);
    Task RetroRushPlayerEliminated(RetroRushPlayerEliminated elimination);
    Task RetroRushRoundStarted(RetroRushGameSnapshot snapshot);
    Task ImposterStateChanged(ImposterStateChanged state);
    Task TankBattleSnapshot(TankBattleGameSnapshot snapshot);
    /// <summary>Sent once at game start (group broadcast) and once more to a lone rejoining connection — the map never changes mid-round.</summary>
    Task HideAndSeekGameStarted(HideAndSeekMapPayload map, HideAndSeekStateSnapshot state);
    /// <summary>
    /// Unicast only, at `TICK_RATE` times per second — this is the one
    /// message in the whole hub that must never go through
    /// <c>Clients.Group</c>. Its <c>VisiblePlayers</c> list is computed
    /// fresh per connection; two players in the same room can (and, once
    /// Faz 4's vision filter lands, usually will) receive different lists
    /// on the same tick.
    /// </summary>
    Task HideAndSeekSnapshot(HideAndSeekPersonalSnapshot snapshot);
    /// <summary>Group broadcast — fired only on the tick a phase transition actually happens (PREP→DARK, DARK↔REVEAL, →ENDED).</summary>
    Task HideAndSeekStateChanged(HideAndSeekStateSnapshot state);
    /// <summary>Group broadcast, once per catch — a toast/sound cue, not itself secret.</summary>
    Task PlayerCaught(HideAndSeekPlayerCaughtEvent evt);
    Task WheelOfFortuneStateChanged(WheelOfFortuneStateSnapshot state);
}
