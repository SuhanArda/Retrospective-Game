"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RoomRealtimeClient } from "@retro-platform/realtime-client";
import {
  canControlSpinQuestion,
  type SpinBottleStateSnapshot,
  type SpinResult,
} from "@retro-platform/contracts";
import { BackToGamesButton } from "./BackToGamesButton";
import {
  buildPlatformGameSelectionUrl,
  resolveSpinTheBottleLaunchContext,
  spinTheBottleRuntimeConfig,
} from "./platformIntegration";
import { loadRoomQuestions, type BotQuestion } from "./questionBotClient";
import { adaptSpinTheBottleQuestion } from "./spinTheBottleQuestionAdapter";

type Player = {
  id: string;
  name: string;
  variant: string;
  position: string;
  mood: string;
};

type SpinTheBottleLaunchContext = ReturnType<typeof resolveSpinTheBottleLaunchContext>;

let cachedLaunchContext: SpinTheBottleLaunchContext = null;
let launchContextResolved = false;

function subscribeToLaunchContext() {
  return () => undefined;
}

function getBrowserLaunchContext(): SpinTheBottleLaunchContext {
  if (!launchContextResolved) {
    cachedLaunchContext = resolveSpinTheBottleLaunchContext(
      window.location.search,
      window.sessionStorage,
      window,
    );
    launchContextResolved = true;
  }
  return cachedLaunchContext;
}

function getServerLaunchContext(): SpinTheBottleLaunchContext {
  return null;
}

const basePlayers: Player[] = [
  { id: "local-1", name: "Oyuncu 1", variant: "orange", position: "pos-0", mood: "Hazır" },
  { id: "local-2", name: "Oyuncu 2", variant: "black", position: "pos-1", mood: "Hazır" },
  { id: "local-3", name: "Oyuncu 3", variant: "gray", position: "pos-2", mood: "Hazır" },
  { id: "local-4", name: "Oyuncu 4", variant: "white", position: "pos-3", mood: "Hazır" },
  { id: "local-5", name: "Oyuncu 5", variant: "tuxedo", position: "pos-4", mood: "Hazır" },
  { id: "local-6", name: "Oyuncu 6", variant: "brown", position: "pos-5", mood: "Hazır" },
];

const questions = {
  İş: [
    "Bu sprintte en iyi yaptığımız şey neydi?",
    "Bu sprintte bizi en çok zorlayan konu neydi?",
    "Bir sonraki sprintte neyi farklı yapmalıyız?",
    "Takım içi iletişim ve görev dağılımı nasıldı?",
    "Bu sprintte öğrendiğin en önemli şey neydi?",
  ],
  Eğlence: [
    "Bu sprinti tek kelimeyle anlatacak olsan ne derdin?",
    "Bu sprint bir film veya dizi olsaydı hangisi olurdu?",
    "Bu sprintte yaşadığın en komik veya unutamayacağın an neydi?",
    "Bu sprintte zamanı geri alabilseydin hangi ana geri dönmek isterdin?",
    "Sprint boyunca en çok söylediğin veya düşündüğün cümle neydi?",
  ],
} as const;

type Category = keyof typeof questions;
type FlowPhase =
  | "idle"
  | "choice"
  | "question";

const reactionOptions = [
  { kind: "happy", label: "ᴗ", name: "Mutlu kedi" },
  { kind: "angry", label: "!", name: "Sinirli kedi" },
  { kind: "cry", label: "╥", name: "Ağlayan kedi" },
  { kind: "love", label: "♥", name: "Kalp atan kedi" },
  { kind: "sleepy", label: "zzz", name: "Uykulu kedi" },
] as const;

type ReactionKind = (typeof reactionOptions)[number]["kind"];

type Reaction = {
  id: number;
  kind: ReactionKind;
  label: string;
  playerId: string;
};

type PixelCatProps = {
  player: Player;
  selected: boolean;
  index: number;
};

function RetroEmoji({ kind, label }: { kind: ReactionKind; label: string }) {
  return (
    <span className={`retro-emoji ${kind}`} aria-hidden="true">
      <img src={`/sprites/reactions/${kind}.png`} alt="" />
      <b>{label}</b>
    </span>
  );
}

function PixelCat({ player, selected, index }: PixelCatProps) {
  return (
    <div className={`cat-wrap ${selected ? "is-selected" : ""}`} aria-hidden="true">
      <span className="cat-shadow" />
      <span className="cushion" />
      <span
        className={`cat-animation ${player.variant}`}
        style={{ "--cat-delay": `${index * -1.1}s` } as React.CSSProperties}
      >
        <img className="cat-frame rest" src={`/sprites/cat-variants/${player.variant}/rest.png`} alt="" />
        <img className="cat-frame blink-frame" src={`/sprites/cat-variants/${player.variant}/blink.png`} alt="" />
        <img className="cat-frame paw-frame" src={`/sprites/cat-variants/${player.variant}/paw-up.png`} alt="" />
        <img className="cat-frame lick-frame" src={`/sprites/cat-variants/${player.variant}/lick.png`} alt="" />
        <span
          className="cat-repair-layer"
          style={{ backgroundImage: `url(/sprites/cat-variants/${player.variant}/rest.png)` }}
        />
        <span
          className="cat-ear-layer left-ear-layer"
          style={{ backgroundImage: `url(/sprites/cat-variants/${player.variant}/rest.png)` }}
        />
        <span
          className="cat-ear-layer right-ear-layer"
          style={{ backgroundImage: `url(/sprites/cat-variants/${player.variant}/rest.png)` }}
        />
      </span>
    </div>
  );
}

export default function Home() {
  const launchContext = useSyncExternalStore(
    subscribeToLaunchContext,
    getBrowserLaunchContext,
    getServerLaunchContext,
  );
  const roomCode = launchContext?.roomCode ?? "MEET-246";
  const [rotation, setRotation] = useState(0);
  const [players, setPlayers] = useState(basePlayers);
  const [spinning, setSpinning] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [phase, setPhase] = useState<FlowPhase>("idle");
  const [category, setCategory] = useState<Category | null>(null);
  const [question, setQuestion] = useState("");
  const [botQuestions, setBotQuestions] = useState<BotQuestion[]>([]);
  const [round, setRound] = useState(1);
  const [sound, setSound] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [roomIsHost, setRoomIsHost] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("standalone");
  const [spinState, setSpinState] = useState<SpinBottleStateSnapshot | null>(null);
  const [questionActionPending, setQuestionActionPending] = useState(false);
  const roomClientRef = useRef<RoomRealtimeClient | null>(null);
  const lastResolvedRevisionRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reactionId = useRef(0);
  const reactionTimersRef = useRef<Set<number>>(new Set());
  const botQuestionsRef = useRef<BotQuestion[]>([]);
  const spinStateRef = useRef<SpinBottleStateSnapshot | null>(null);

  const showReaction = useCallback((playerId: string, kind: ReactionKind, label: string) => {
    const id = ++reactionId.current;
    setReactions((current) => [...current, { id, kind, label, playerId }]);
    const timeoutId = window.setTimeout(() => {
      reactionTimersRef.current.delete(timeoutId);
      setReactions((current) => current.filter((reaction) => reaction.id !== id));
    }, 2200);
    reactionTimersRef.current.add(timeoutId);
  }, []);

  useEffect(() => {
    botQuestionsRef.current = botQuestions;
  }, [botQuestions]);

  useEffect(() => {
    if (!launchContext?.roomCode) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    const load = () => {
      loadRoomQuestions(spinTheBottleRuntimeConfig.apiUrl, launchContext.roomCode, launchContext.playerId, launchContext.reconnectToken)
        .then((loaded) => {
          if (cancelled) return;
          setBotQuestions(loaded);
          const activeState = spinStateRef.current;
          if (activeState?.questionId && activeState.category && activeState.status === "QUESTION_ACTIVE") {
            const resolved = adaptSpinTheBottleQuestion(loaded, activeState.questionId, activeState.category === "Eğlence");
            if (resolved) setQuestion(resolved);
          }
        })
        .catch(() => {
          attempt++;
          if (!cancelled && attempt < 25) retryTimer = setTimeout(load, 2_000);
        });
    };
    load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [launchContext]);

  useEffect(() => {
    const reactionTimers = reactionTimersRef.current;
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      reactionTimers.forEach((timeoutId) => clearTimeout(timeoutId));
      reactionTimers.clear();
    };
  }, []);

  useEffect(() => {
    const suppliedNames = new URLSearchParams(window.location.search)
      .get("players")
      ?.split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .slice(0, basePlayers.length);
    const playerNames = suppliedNames?.length
      ? suppliedNames
      : launchContext?.displayName
        ? [launchContext.displayName]
        : null;
    if (!playerNames?.length) return;

    const frame = requestAnimationFrame(() => {
      setPlayers(
        basePlayers.map((player, index) => ({
          ...player,
          name: playerNames[index] || player.name,
        })),
      );
    });

    return () => cancelAnimationFrame(frame);
  }, [launchContext]);

  useEffect(() => {
    if (!launchContext) return;
    const client = RoomRealtimeClient.fromLaunchContext(spinTheBottleRuntimeConfig.apiUrl, launchContext);
    roomClientRef.current = client;
    const disposeRoom = client.on("roomSnapshot", (room) => {
      if (room.currentGameSession?.gameSessionId !== launchContext.gameSessionId) return;
      setPlayers(room.players.slice(0, basePlayers.length).map((participant, index) => ({
        ...basePlayers[index],
        id: participant.id,
        name: participant.displayName,
        mood: participant.isConnected ? "Hazır" : "Bağlantı bekleniyor",
      })));
      setRoomIsHost(room.hostPlayerId === launchContext.playerId);
      applyAuthoritativeSpinState(room.spinBottleState ?? null);
    });
    const applySpin = (result: SpinResult) => {
      if (result.gameSessionId !== launchContext.gameSessionId) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setSelected(null);
      setPhase("idle");
      setCategory(null);
      setQuestion("");
      setSpinning(true);
      setRotation(result.finalAngle);
      timerRef.current = setTimeout(() => {
        setSelected(result.targetIndex);
        setSpinning(false);
      }, result.durationMs);
    };
    const disposeSpin = client.on("spinResult", applySpin);
    const disposeSpinState = client.on("spinBottleStateChanged", applyAuthoritativeSpinState);
    const disposeReaction = client.on("reaction", (reaction) => {
      const option = reactionOptions.find(({ kind }) => kind === reaction.emoji);
      if (option) showReaction(reaction.playerId, option.kind, option.label);
    });
    const disposeReturn = client.on("returnedToGameSelection", () => {
      window.location.assign(buildPlatformGameSelectionUrl(
        spinTheBottleRuntimeConfig.platformUrl, launchContext.roomCode, window.location.origin,
      ));
    });
    const disposeStatus = client.on("connectionChanged", setConnectionStatus);
    void client.connect().catch(() => setConnectionStatus("disconnected"));
    return () => {
      disposeRoom();
      disposeSpin();
      disposeSpinState();
      disposeReaction();
      disposeReturn();
      disposeStatus();
      roomClientRef.current = null;
      void client.disconnect();
    };
  }, [launchContext, showReaction]);

  function applyAuthoritativeSpinState(state: SpinBottleStateSnapshot | null) {
    spinStateRef.current = state;
    setSpinState(state);
    setQuestionActionPending(false);
    if (!state) {
      setPhase("idle");
      return;
    }
    setSelected(state.targetIndex);
    setCategory(state.category ?? null);
    setQuestion(resolveQuestionText(state.questionId, state.category, state.questionText));
    if (state.status === "SPINNING") {
      setSpinning(true);
      setPhase("idle");
    } else if (state.status === "CHOICE") {
      setSpinning(false);
      setPhase("choice");
    } else if (state.status === "QUESTION_ACTIVE") {
      setSpinning(false);
      setPhase("question");
    } else if (state.status === "RESOLVED") {
      const resolutionKey = `${state.spinId}:${state.revision}`;
      if (lastResolvedRevisionRef.current !== resolutionKey) {
        lastResolvedRevisionRef.current = resolutionKey;
        setHistory((current) =>
          [`${state.targetIndex + 1}. kişi · ${state.category ?? ""} · tamamlandı`, ...current].slice(0, 3),
        );
        setRound((value) => value + 1);
      }
      setSpinning(false);
      setPhase("idle");
      setCategory(null);
      setQuestion("");
    }
  }

  function resolveQuestionText(questionId: string | undefined, selectedCategory: Category | undefined, fallback: string | undefined): string {
    const loaded = botQuestionsRef.current;
    if (!questionId || loaded.length === 0) return fallback ?? "";
    const wantsFun = selectedCategory === "Eğlence";
    return adaptSpinTheBottleQuestion(loaded, questionId, wantsFun) ?? fallback ?? "";
  }

  function returnToGames() {
    if (!launchContext) return;
    if (roomIsHost && roomClientRef.current) {
      void roomClientRef.current.returnToGameSelection().catch(() => undefined);
      return;
    }
    window.location.assign(
      buildPlatformGameSelectionUrl(
        spinTheBottleRuntimeConfig.platformUrl,
        launchContext.roomCode,
        window.location.origin,
      ),
    );
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && phase === "idle") {
        event.preventDefault();
        spinBottle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function spinBottle() {
    if (spinning) return;
    if (launchContext && roomClientRef.current) {
      setSpinning(true);
      void roomClientRef.current.requestSpin().catch(() => setSpinning(false));
      return;
    }
    const next = Math.floor(Math.random() * players.length);
    const extraTurns = 4 + Math.floor(Math.random() * 2);
    const normalized = ((rotation % 360) + 360) % 360;
    setSelected(null);
    setPhase("idle");
    setCategory(null);
    setQuestion("");
    setSpinning(true);
    setRotation(rotation - normalized + extraTurns * 360 + next * 60);
    timerRef.current = setTimeout(() => {
      setSelected(next);
      setSpinning(false);
      setPhase("choice");
    }, 3200);
  }

  function chooseCategory(nextCategory: Category) {
    if (launchContext) {
      if (!canControlSpinQuestion(spinState, launchContext.playerId) || !roomClientRef.current) return;
      setQuestionActionPending(true);
      void roomClientRef.current.chooseSpinCategory(nextCategory, spinState!.revision)
        .catch(() => setQuestionActionPending(false));
      return;
    }
    setCategory(nextCategory);
    const fallbackPool = questions[nextCategory];
    setQuestion(fallbackPool[Math.floor(Math.random() * fallbackPool.length)]);
    setPhase("question");
  }

  function finishTurn() {
    if (launchContext) {
      if (!canControlSpinQuestion(spinState, launchContext.playerId) ||
          !roomClientRef.current || !spinState?.questionId) return;
      setQuestionActionPending(true);
      void roomClientRef.current.completeSpinQuestion(spinState.questionId, spinState.revision)
        .catch(() => setQuestionActionPending(false));
      return;
    }
    if (selected !== null && category) {
      setHistory((current) =>
        [`${selected + 1}. kişi · ${category} · tamamlandı`, ...current].slice(0, 3),
      );
    }
    setPhase("idle");
    setCategory(null);
    setQuestion("");
    setRound((value) => value + 1);
  }

  function sendReaction(kind: ReactionKind, label: string) {
    setReactionsOpen(false);
    if (launchContext) {
      void roomClientRef.current?.sendReaction(kind).catch(() => undefined);
      return;
    }
    showReaction(basePlayers[0].id, kind, label);
  }

  function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;

    if (sound) {
      audio.pause();
      setSound(false);
      return;
    }

    audio.volume = 0.35;
    audio
      .play()
      .then(() => setSound(true))
      .catch(() => setSound(false));
  }

  const isQuestionOwner = launchContext
    ? canControlSpinQuestion(spinState, launchContext.playerId)
    : true;
  const questionOwnerName = spinState
    ? players.find((player) => player.id === spinState.targetPlayerId)?.name ?? `${spinState.targetIndex + 1}. kişi`
    : selected !== null
      ? players[selected]?.name
      : "";

  return (
    <main
      className="game-shell"
      data-room-connection={connectionStatus}
      data-game-session={launchContext?.gameSessionId}
    >
      {/* Arka plan müziğinde konuşma olmadığı için altyazı parçası gerekmiyor. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src="/music/cat-song.wav" loop preload="metadata" />
      <div className="scanlines" />
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-cat" aria-hidden="true" />
          <h1>SPIN THE BOTTLE</h1>
        </div>
        <div className="room-chip">
          <span>ODA</span>
          <strong>{roomCode}</strong>
          <i />
          {launchContext && <small>{connectionStatus}</small>}
        </div>
        <div className="topbar-actions">
          {launchContext && <BackToGamesButton roomIsHost={roomIsHost} onReturn={returnToGames} />}
          <button
            className={`sound-button ${sound ? "" : "is-muted"}`}
            type="button"
            onClick={toggleMusic}
            aria-pressed={sound}
            aria-label={sound ? "Müziği kapat" : "Müziği aç"}
          >
            <span className="music-icon" aria-hidden="true">♫</span>
          </button>
        </div>
      </header>

      <section className="room" aria-label="Altı kedinin oynadığı şişe çevirmece alanı">
        <div className="room-vignette" />
        <aside className="player-panel panel">
          <div className="panel-title">
            <span>OYUNCULAR</span>
            <b>{players.length} / 6</b>
          </div>
          <div className="player-list">
            {players.map((player, index) => (
              <div
                className={`player-row ${selected === index ? "active" : ""}`}
                key={player.variant}
              >
                <RetroEmoji kind="happy" label="ᴗ" />
                <div>
                  <strong>{player.name}</strong>
                  <small>{selected === index ? "Şişe seni seçti!" : player.mood}</small>
                </div>
                <i className="online-dot" />
              </div>
            ))}
          </div>
        </aside>

        <aside className="info-panel panel">
          <div className="round-label">TUR {String(round).padStart(2, "0")}</div>
          <h2>Herkes hazır mı?</h2>
          <p>Şişeyi döndür. Seçilen kişi İş veya Eğlence kategorisinden bir soru seçsin.</p>
          <div className="tiny-rule">
            <kbd>SPACE</kbd>
            <span>ile döndür</span>
          </div>
          <div className="spin-controls">
            <button
              className="spin-button"
              type="button"
              onClick={spinBottle}
              disabled={spinning || phase !== "idle"}
            >
              <span aria-hidden="true">↻</span>
              {spinning ? "DÖNÜYOR..." : "ŞİŞEYİ DÖNDÜR"}
            </button>
            <p>
              {spinning
                ? "Şişe kararını veriyor..."
                : selected !== null
                  ? `${selected + 1}. kişi seçildi!`
                  : "Sıradaki kişiyi şans seçsin."}
            </p>
          </div>
          {history.length > 0 && (
            <div className="history">
              <b>SON TURLAR</b>
              {history.map((item) => <span key={item}>◆ {item}</span>)}
            </div>
          )}
        </aside>

        <div className="cat-circle">
          {players.map((player, index) => (
            <div className={`cat-seat ${player.position}`} key={player.variant}>
              <div className="cat-reactions" aria-live="polite">
                {reactions
                  .filter((reaction) => reaction.playerId === player.id)
                  .map((reaction) => (
                    <span className="thought-bubble" key={reaction.id}>
                      <RetroEmoji kind={reaction.kind} label={reaction.label} />
                    </span>
                  ))}
              </div>
              <div className="name-tag">
                {player.name}
                {selected === index && <span>★</span>}
              </div>
              <PixelCat player={player} selected={selected === index} index={index} />
            </div>
          ))}

          <button
            className="bottle-zone"
            type="button"
            onClick={spinBottle}
            disabled={spinning || phase !== "idle"}
            aria-label="Süt şişesini döndür"
          >
            <span className="bottle-glow" />
            <span className="bottle-shadow" aria-hidden="true">
              <span
                className="shadow-orbit"
                style={{
                  "--bottle-rotation": `${rotation}deg`,
                  "--shadow-counter-rotation": `${-rotation}deg`,
                } as React.CSSProperties}
              >
                <span className="shadow-part shadow-neck" />
                <span className="shadow-part shadow-shoulder" />
                <span className="shadow-part shadow-body" />
                <span className="shadow-part shadow-base" />
              </span>
              <span className="shadow-contact" />
            </span>
            <span
              className="milk-bottle"
              style={{ transform: `rotate(${rotation}deg)` }}
            >
              <img src="/sprites/milk-bottle.png" alt="" />
            </span>
          </button>
        </div>
      </section>

      <aside
        className={`reaction-dock ${reactionsOpen ? "open" : ""}`}
        aria-label="Retro emoji tepkileri"
      >
        <div className="reaction-menu">
          {reactionOptions.map((reaction) => (
            <button
              type="button"
              key={reaction.kind}
              onClick={() => sendReaction(reaction.kind, reaction.label)}
              aria-label={reaction.name}
            >
              <RetroEmoji kind={reaction.kind} label={reaction.label} />
            </button>
          ))}
        </div>
        <button
          className="reaction-toggle"
          type="button"
          onClick={() => setReactionsOpen((open) => !open)}
          aria-expanded={reactionsOpen}
          aria-label={reactionsOpen ? "Emoji menüsünü kapat" : "Emoji menüsünü aç"}
        >
          <span>EMOJİ</span>
          <b aria-hidden="true">{reactionsOpen ? "›" : "‹"}</b>
        </button>
      </aside>
      {phase !== "idle" && selected !== null && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="challenge-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenge-title"
            data-question-id={spinState?.questionId}
            data-spin-revision={spinState?.revision}
            data-question-owner={spinState?.targetPlayerId}
          >
            {!launchContext && (
              <button
                className="close-card"
                type="button"
                onClick={() => setPhase("idle")}
                aria-label="Kartı kapat"
              >
                ×
              </button>
            )}
            <div className="chosen-avatar">
              <PixelCat player={players[selected]} selected index={selected} />
            </div>

            {phase === "choice" && (
              <>
                <p className="challenge-type">✦ {selected + 1}. KİŞİ SEÇİLDİ ✦</p>
                <h2 id="challenge-title">İş mi Eğlence mi?</h2>
                <p className="selection-note">
                  {isQuestionOwner
                    ? `${players[selected].name} için soru kategorisini seçin.`
                    : `${questionOwnerName} seçim yapıyor...`}
                </p>
                <div className="category-actions">
                  <button type="button" className="work-button" onClick={() => chooseCategory("İş")} disabled={!isQuestionOwner || questionActionPending}>
                    <span>▣</span>
                    <b>İŞ</b>
                    <small>Ekip & toplantı</small>
                  </button>
                  <button type="button" className="fun-button" onClick={() => chooseCategory("Eğlence")} disabled={!isQuestionOwner || questionActionPending}>
                    <span>★</span>
                    <b>EĞLENCE</b>
                    <small>Keyifli & sürpriz</small>
                  </button>
                </div>
              </>
            )}

            {phase === "question" && (
              <>
                <p className="challenge-type">✦ {category?.toUpperCase()} SORUSU ✦</p>
                <h2 id="challenge-title">{selected + 1}. Kişi için</h2>
                <p className="challenge-text">“{question}”</p>
                {isQuestionOwner ? (
                  <div className="card-actions">
                    <button type="button" className="done-button" onClick={finishTurn} disabled={questionActionPending}>
                      TAMAMLANDI <span>✓</span>
                    </button>
                  </div>
                ) : (
                  <p className="selection-note">{questionOwnerName} için bekleniyor...</p>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
