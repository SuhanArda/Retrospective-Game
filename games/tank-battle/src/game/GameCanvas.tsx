import { useEffect, useRef } from 'react';
import type { GameEventBridge } from '../bridge/GameEventBridge';
import type { GameTransport } from '../networking/GameTransport';
import { createPhaserGame } from './PhaserGame';

interface Props { bridge: GameEventBridge; transport: GameTransport }

const INTERACTIVE_GAME_UI_SELECTOR = [
  '[data-game-ui-interactive="true"]',
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
].join(',');

export function GameCanvas({ bridge, transport }: Props) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = createPhaserGame(host.current, bridge, transport);
    const handlePointerMove = (event: PointerEvent) => {
      if (isInsideGameViewport(event, game.canvas)) {
        bridge.emit('aimPointerMoved', { pageX: event.pageX, pageY: event.pageY });
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !isInsideGameViewport(event, game.canvas) || isInteractiveGameUi(event.target)) return;
      bridge.emit('firePointerPressed', { pageX: event.pageX, pageY: event.pageY });
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      game.destroy(true);
    };
  }, [bridge, transport]);
  return <div className="game-canvas" ref={host} aria-label="Tank Battle oyun alanı" />;
}

function isInsideGameViewport(event: PointerEvent, canvas: HTMLCanvasElement): boolean {
  const bounds = canvas.getBoundingClientRect();
  return event.clientX >= bounds.left && event.clientX <= bounds.right
    && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function isInteractiveGameUi(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(INTERACTIVE_GAME_UI_SELECTOR));
}
