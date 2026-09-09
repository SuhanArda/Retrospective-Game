import { useCallback, useEffect, useMemo, useState } from 'react';
import { RoomRealtimeClient } from '@retro-platform/realtime-client';
import type { ImposterGameSnapshot, ImposterPlayerSnapshot } from '@retro-platform/contracts';
import { FullscreenButton } from './FullscreenButton';
import { PlayerLineup } from './PlayerLineup';
import { Avatar } from './Avatar';
import { useSuspicionMusic } from './useSuspicionMusic';
import { backgrounds, fallbackWordPacks } from '../data/gameContent';
import { beginClues, castVote, completeSpokenClue, createRound, resolveVotes } from '../domain/rules';
import type { ImposterPlayer, ImposterRound } from '../domain/types';
import {
  buildGameSelectionUrl,
  imposterRuntimeConfig,
  resolveImposterLaunchContext,
} from './platformIntegration';

const demoPlayers: readonly ImposterPlayer[] = ['Oyuncu 1', 'Oyuncu 2', 'Oyuncu 3'].map(
  (displayName, index) => ({
    id: `demo-${index + 1}`,
    displayName,
    avatarIndex: index,
    isConnected: true,
  }),
);

function toPlayer(player: ImposterPlayerSnapshot): ImposterPlayer {
  return {
    id: player.playerId,
    displayName: player.displayName,
    avatarIndex: player.avatarIndex,
    isConnected: player.isConnected,
  };
}

function roundFor(players: readonly ImposterPlayer[], roundNumber: number): ImposterRound {
  const pack = fallbackWordPacks[(roundNumber - 1) % fallbackWordPacks.length]!;
  const deterministicPick = (((roundNumber - 1) * 37) % 100) / 100;
  return createRound(players, pack, roundNumber, deterministicPick);
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'İşlem tamamlanamadı.';
  const messages: Readonly<Record<string, string>> = {
    EMPTY_CLUE: 'Bir ipucu yazmalısın.',
    SECRET_WORD_USED: 'Gizli kelimeyi doğrudan kullanamazsın.',
    DUPLICATE_CLUE: 'Bu ipucu daha önce kullanıldı.',
    SELF_VOTE: 'Kendine oy veremezsin.',
    NOT_CURRENT_SPEAKER: 'Şu anda ipucu sırası sende değil.',
    ALREADY_VOTED: 'Bu turda oyunu zaten verdin.',
    HOST_REQUIRED: 'Bu işlemi yalnızca oda sahibi yapabilir.',
    INVALID_IMPOSTER_BACKGROUND: 'Bu arka plan kullanılamıyor.',
    INVALID_IMPOSTER_PHASE: 'Bu işlem oyunun mevcut aşamasında yapılamaz.',
    WRONG_GAME_SESSION: 'Oyun oturumu artık geçerli değil.',
  };
  const match = Object.entries(messages).find(([code]) => error.message.includes(code));
  return match?.[1] ?? 'Bu hamle şu anda yapılamaz.';
}

function newerSnapshot(
  current: ImposterGameSnapshot | null,
  incoming: ImposterGameSnapshot,
): ImposterGameSnapshot {
  if (!current) return incoming;
  if (incoming.roundNumber < current.roundNumber) return current;
  if (incoming.roundNumber === current.roundNumber && incoming.revision < current.revision) return current;
  return incoming;
}

export function App() {
  const launchContext = useMemo(
    () => resolveImposterLaunchContext(window.location.search, window.sessionStorage, window),
    [],
  );
  const [roomClient, setRoomClient] = useState<RoomRealtimeClient | null>(null);
  const [onlineGame, setOnlineGame] = useState<ImposterGameSnapshot | null>(null);
  const [localRound, setLocalRound] = useState<ImposterRound>(() => roundFor(demoPlayers, 1));
  const [connected, setConnected] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [roleVisible, setRoleVisible] = useState(false);
  const [roleRevealIndex, setRoleRevealIndex] = useState(0);
  const [backgroundIndex, setBackgroundIndex] = useState(0);
  const [musicEnabled, setMusicEnabled] = useState(true);

  const applyOnlineSnapshot = useCallback((snapshot: ImposterGameSnapshot) => {
    setOnlineGame((current) => newerSnapshot(current, snapshot));
  }, []);

  useEffect(() => {
    if (!launchContext) return;
    let disposed = false;
    const client = RoomRealtimeClient.fromLaunchContext(imposterRuntimeConfig.apiUrl, launchContext);
    const reportRefreshFailure = (error: unknown) => {
      if (!disposed) setNotice(errorMessage(error));
    };
    const refreshGame = async () => {
      const snapshot = await client.getImposterSnapshot(launchContext.gameSessionId);
      if (!disposed) applyOnlineSnapshot(snapshot);
    };
    const disposeSnapshot = client.on('roomSnapshot', (room) => {
      if (room.currentGameSession?.gameSessionId !== launchContext.gameSessionId ||
          room.currentGameSession.gameId !== 'imposter') return;
      setConnected(room.players.some((player) => player.id === launchContext.playerId && player.isConnected));
      void refreshGame().catch(reportRefreshFailure);
    });
    const disposeGameState = client.on('imposterStateChanged', (state) => {
      if (state.gameSessionId !== launchContext.gameSessionId) return;
      void refreshGame().catch(reportRefreshFailure);
    });
    const disposeConnection = client.on('connectionChanged', (state) => {
      setConnected(state === 'connected');
    });
    const disposeReturn = client.on('returnedToGameSelection', () => {
      window.location.assign(buildGameSelectionUrl(
        imposterRuntimeConfig.platformUrl,
        launchContext.roomCode,
        window.location.origin,
      ));
    });
    setRoomClient(client);
    void client.connect()
      .then(async () => {
        await refreshGame();
        if (!disposed) setNotice('');
      })
      .catch(() => {
        if (!disposed) setNotice('Oda bağlantısı kurulamadı. Lütfen platformdan yeniden katıl.');
      });
    return () => {
      disposed = true;
      disposeSnapshot();
      disposeGameState();
      disposeConnection();
      disposeReturn();
      setRoomClient(null);
      void client.disconnect();
    };
  }, [applyOnlineSnapshot, launchContext]);

  const onlineRoundNumber = onlineGame?.roundNumber;
  useEffect(() => {
    if (onlineRoundNumber !== undefined) setRoleVisible(false);
  }, [onlineRoundNumber]);

  const isOnline = launchContext !== null;
  const phase = onlineGame?.phase ?? localRound.phase;
  const players = useMemo(
    () => onlineGame?.players.map(toPlayer) ?? localRound.players,
    [localRound.players, onlineGame],
  );
  const localPlayerId = launchContext?.playerId ?? players[0]?.id;
  const localPlayer = players.find((player) => player.id === localPlayerId);
  const revealPlayer = isOnline
    ? localPlayer
    : localRound.players[roleRevealIndex] ?? localRound.players[0];
  const revealIsImposter = isOnline
    ? onlineGame?.yourRole === 'IMPOSTER'
    : revealPlayer?.id === localRound.imposterId;
  const speaker = isOnline
    ? players.find((player) => player.id === onlineGame?.currentSpeakerPlayerId)
    : localRound.players[localRound.speakerIndex];
  const voter = isOnline
    ? localPlayer
    : localRound.players[Object.keys(localRound.votes).length];
  const localResult = !isOnline && phase === 'RESULTS' ? resolveVotes(localRound) : null;
  const result = onlineGame?.result ?? localResult;
  const imposterPlayerId = onlineGame?.result?.imposterPlayerId ?? (localResult ? localRound.imposterId : undefined);
  const imposterPlayer = players.find((player) => player.id === imposterPlayerId);
  const roundNumber = onlineGame?.roundNumber ?? localRound.roundNumber;
  const secretWord = isOnline ? onlineGame?.secretWord : localRound.pack.secretWord;
  const retroQuestion = isOnline ? onlineGame?.retroQuestion : localRound.pack.retroQuestion;
  const currentPlayerState = onlineGame?.players.find((player) => player.playerId === localPlayerId);
  const completedCluePlayerIds = onlineGame
    ? onlineGame.players.filter((player) => player.hasGivenClue).map((player) => player.playerId)
    : localRound.clues.map((entry) => entry.playerId);
  const localBackground = backgrounds[backgroundIndex] ?? backgrounds[0];
  const background = onlineGame
    ? backgrounds.find((option) => option.id === onlineGame.backgroundId) ?? backgrounds[0]
    : localBackground;
  const canChooseBackground = !launchContext || launchContext.isHost;
  const activePlayerId = phase === 'ROLE_REVEAL'
    ? revealPlayer?.id
    : phase === 'CLUE_GIVING'
      ? speaker?.id
      : undefined;
  const unlockSuspicionMusic = useSuspicionMusic(phase === 'VOTING', musicEnabled);

  const runOnlineAction = async (operation: () => Promise<ImposterGameSnapshot>) => {
    if (actionPending) return;
    setActionPending(true);
    try {
      applyOnlineSnapshot(await operation());
      setNotice('');
    } catch (error) {
      setNotice(errorMessage(error));
    } finally {
      setActionPending(false);
    }
  };

  const onCompleteSpokenClue = () => {
    if (!speaker) return;
    if (launchContext && roomClient) {
      if (speaker.id !== launchContext.playerId) return;
      void runOnlineAction(() => roomClient.completeImposterClue(launchContext.gameSessionId));
      return;
    }
    try {
      if (musicEnabled && localRound.clues.length + 1 === localRound.players.length) unlockSuspicionMusic();
      setLocalRound((current) => completeSpokenClue(current, speaker.id));
      setNotice('');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const onVote = (targetId: string) => {
    if (!voter) return;
    if (launchContext && roomClient) {
      void runOnlineAction(() => roomClient.castImposterVote({
        gameSessionId: launchContext.gameSessionId,
        targetPlayerId: targetId,
      }));
      return;
    }
    try {
      setLocalRound((current) => castVote(current, voter.id, targetId));
      setNotice('');
    } catch (error) {
      setNotice(errorMessage(error));
    }
  };

  const nextRound = () => {
    if (launchContext && roomClient) {
      void runOnlineAction(() => roomClient.startNextImposterRound(launchContext.gameSessionId));
      return;
    }
    const nextRoundNumber = localRound.roundNumber + 1;
    setLocalRound(roundFor(players, nextRoundNumber));
    setRoleVisible(false);
    setRoleRevealIndex(0);
    setNotice('');
  };

  const changeBackground = (backgroundId: string) => {
    if (launchContext && roomClient) {
      void runOnlineAction(() => roomClient.setImposterBackground(launchContext.gameSessionId, backgroundId));
      return;
    }
    const nextIndex = backgrounds.findIndex((option) => option.id === backgroundId);
    if (nextIndex >= 0) setBackgroundIndex(nextIndex);
  };

  const completeRoleReveal = () => {
    if (launchContext && roomClient) {
      void runOnlineAction(() => roomClient.readyImposterRole(launchContext.gameSessionId));
      return;
    }
    const isLastLocalReveal = roleRevealIndex >= localRound.players.length - 1;
    if (isLastLocalReveal) {
      setLocalRound(beginClues(localRound));
      return;
    }
    setRoleRevealIndex((index) => index + 1);
    setRoleVisible(false);
  };

  const returnToGames = () => {
    if (!roomClient) return;
    void roomClient.returnToGameSelection().catch(() => setNotice('Platforma dönülemedi.'));
  };

  const isLoadingOnlineGame = isOnline && !onlineGame;
  const localCanCompleteClue = !isOnline || speaker?.id === localPlayerId;
  const hasVotedOnline = Boolean(onlineGame?.hasVoted);
  const hasRevealedOnlineRole = Boolean(currentPlayerState?.hasRevealedRole);

  return (
    <main
      className={`game-shell game-shell--${background.id} game-shell--${phase.toLowerCase().replace('_', '-')}`}
      style={{ '--scene-image': `url(${background.url})` } as React.CSSProperties}
    >
      <div className="scene-overlay" />
      <header className="topbar">
        <div><h1>IMPOSTER</h1></div>
        <div className="topbar-actions">
          {launchContext?.isHost && (
            <button className="back-to-games-button" type="button" onClick={returnToGames} disabled={actionPending}>
              OYUNLARA DÖN
            </button>
          )}
          {canChooseBackground && (
            <label className="background-picker">
              <span>Arka Plan</span>
              <select
                value={background.id}
                onChange={(event) => changeBackground(event.target.value)}
                disabled={actionPending}
              >
                {backgrounds.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          <div className="round-status">
            <span>Tur {roundNumber}</span>
            {launchContext && <span>Oda {launchContext.roomCode}</span>}
            {launchContext && <span className={connected ? 'online' : 'offline'}>{connected ? 'Bağlı' : 'Bağlanıyor'}</span>}
          </div>
          <FullscreenButton className="back-to-games-button fullscreen-toggle" />
        </div>
      </header>

      <section className="stage" aria-label="Imposter oyun sahnesi">
        {!isLoadingOnlineGame && <PlayerLineup players={players} activePlayerId={activePlayerId} />}

        {isLoadingOnlineGame ? (
          <section className="game-panel" aria-live="polite">
            <p className="panel-kicker">ONLINE OYUN</p>
            <h2>Oyun durumu hazırlanıyor…</h2>
          </section>
        ) : (
          <section className={`game-panel game-panel--${phase.toLowerCase().replace('_', '-')}`}>
            {phase === 'ROLE_REVEAL' && revealPlayer && (
              !roleVisible ? (
                <button className="role-card-back" type="button" onClick={() => setRoleVisible(true)}>
                  <span className="card-question" aria-hidden="true">?</span>
                  <strong>{revealPlayer.displayName}</strong>
                  <span>KARTINI AÇ</span>
                </button>
              ) : (
                <div className={`role-card role-card-face ${revealIsImposter ? 'imposter' : 'crew'}`}>
                  <span className="role-owner">{revealPlayer.displayName}</span>
                  <img
                    className="role-character-icon"
                    src={revealIsImposter ? '/assets/icons/pixel-devil.png' : '/assets/icons/pixel-angel-v2.png'}
                    alt=""
                    aria-hidden="true"
                  />
                  <strong>{revealIsImposter ? 'IMPOSTER!' : 'IMPOSTER DEĞİLSİN!'}</strong>
                  {!revealIsImposter && <span>Kelimen: {secretWord}</span>}
                  <button
                    className="primary-button"
                    type="button"
                    onClick={completeRoleReveal}
                    disabled={actionPending || hasRevealedOnlineRole}
                  >
                    {hasRevealedOnlineRole ? 'Diğer oyuncular bekleniyor' : 'Hazırım'}
                  </button>
                </div>
              )
            )}

            {phase === 'CLUE_GIVING' && speaker && (
              <>
                <p className="panel-kicker">İPUCU SIRASI</p>
                <h2>{speaker.displayName}</h2>
                <p className="voice-instruction">Kelimeyi söylemeden ipucunu toplantıda sesli ver.</p>
                <div className="clue-history" aria-label="Sırasını tamamlayan oyuncular">
                  {completedCluePlayerIds.map((playerId) => (
                    <span key={playerId}>{players.find((player) => player.id === playerId)?.displayName} ✓</span>
                  ))}
                </div>
                {localCanCompleteClue ? (
                  <button className="primary-button" type="button" onClick={onCompleteSpokenClue} disabled={actionPending}>
                    İpucumu Verdim
                  </button>
                ) : (
                  <p className="waiting-message">{speaker.displayName} ipucunu verirken bekleniyor…</p>
                )}
              </>
            )}

            {phase === 'VOTING' && voter && (
              <>
                <p className="panel-kicker">GİZLİ OYLAMA</p>
                <div className="voting-heading">
                  <h2>{voter.displayName}, sence imposter kim olabilir?</h2>
                  <button
                    className={`music-toggle ${musicEnabled ? '' : 'is-muted'}`}
                    type="button"
                    aria-pressed={musicEnabled}
                    aria-label={musicEnabled ? 'Müziği kapat' : 'Müziği aç'}
                    title={musicEnabled ? 'Müziği kapat' : 'Müziği aç'}
                    onClick={() => {
                      if (!musicEnabled) unlockSuspicionMusic();
                      setMusicEnabled((enabled) => !enabled);
                    }}
                  >
                    <span className="music-icon" aria-hidden="true">♫</span>
                  </button>
                </div>
                {hasVotedOnline && <p className="waiting-message">Oyun alındı. Diğer oyuncular bekleniyor…</p>}
                <div className="vote-grid">
                  {players.filter((player) => player.id !== voter.id).map((player) => (
                    <button
                      className="vote-card"
                      key={player.id}
                      type="button"
                      onClick={() => onVote(player.id)}
                      disabled={actionPending || hasVotedOnline || !player.isConnected}
                    >
                      <Avatar avatarIndex={player.avatarIndex} name={player.displayName} compact />
                      <span className="vote-action">{player.isConnected ? 'OY VER' : 'BAĞLANTI KOPTU'}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {phase === 'RESULTS' && result && (
              <>
                <p className="panel-kicker">TUR SONUCU</p>
                <h2>{result.imposterCaught ? 'İmposter yakalandı!' : 'İmposter aradan sıyrıldı!'}</h2>
                {imposterPlayer && (
                  <p className="imposter-reveal">İmposter: <strong>{imposterPlayer.displayName}</strong></p>
                )}
                <p className="reveal-word">Gizli kelime: <strong>{secretWord}</strong></p>
                <p className="retro-question">{retroQuestion}</p>
                {(!isOnline || launchContext?.isHost) ? (
                  <button className="primary-button" type="button" onClick={nextRound} disabled={actionPending}>Sonraki Tur</button>
                ) : (
                  <p className="waiting-message">Oda sahibinin sonraki turu başlatması bekleniyor…</p>
                )}
              </>
            )}
          </section>
        )}
      </section>

      <footer>
        <span>3–10 oyuncu · 1 imposter · sırayla sesli ipucu ve gizli oylama</span>
      </footer>
      {notice && <div className="toast" role="status" aria-live="polite">{notice}</div>}
    </main>
  );
}
