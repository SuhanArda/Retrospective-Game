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
    Task DrawAndGuessCanvasCleared();
    Task DrawAndGuessWordRevealed(DrawAndGuessWordReveal reveal);
    Task ReactionReceived(RoomReaction reaction);
    Task RetroRushSnapshot(RetroRushGameSnapshot snapshot);
    Task RetroRushPlayerUpdated(RetroRushPlayerSnapshot player);
    Task RetroRushShoveApplied(RetroRushShoveApplied shove);
    Task RetroRushRocketSpawned(RetroRushRocketSnapshot rocket);
    Task RetroRushRocketHit(RetroRushRocketHitApplied hit);
    Task RetroRushPickupCollected(RetroRushPickupCollected pickup);
    Task RetroRushPlayerEliminated(RetroRushPlayerEliminated elimination);
    Task RetroRushRoundStarted(RetroRushGameSnapshot snapshot);
    Task RetroRushTargetQuestioned(RetroRushTargetQuestioned question);
    Task ImposterStateChanged(ImposterStateChanged state);
}
