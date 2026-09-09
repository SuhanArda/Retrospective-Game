import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameEventBridge } from '../bridge/GameEventBridge';
import { MockGameTransport } from '../networking/MockGameTransport';

const { createGame, destroyGame, canvas, getCanvasBounds } = vi.hoisted(() => {
  const canvasElement = document.createElement('canvas');
  const bounds = vi.fn(() => ({ left: 20, top: 30, right: 820, bottom: 630, width: 800, height: 600, x: 20, y: 30, toJSON: () => undefined }));
  Object.defineProperty(canvasElement, 'getBoundingClientRect', {
    value: bounds,
  });
  return { createGame: vi.fn(), destroyGame: vi.fn(), canvas: canvasElement, getCanvasBounds: bounds };
});
vi.mock('./PhaserGame', () => ({
  createPhaserGame: createGame.mockReturnValue({ canvas, destroy: destroyGame }),
}));
import { GameCanvas } from './GameCanvas';

describe('Tank Battle viewport pointer input', () => {
  it('forwards pointer movement over the visible game viewport and cleans up on unmount', () => {
    const bridge = new GameEventBridge();
    const listener = vi.fn();
    bridge.on('aimPointerMoved', listener);
    const view = render(<GameCanvas bridge={bridge} transport={new MockGameTransport()} />);

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 50 }));
    expect(listener).toHaveBeenCalledWith({ pageX: 250, pageY: 50 });

    getCanvasBounds.mockReturnValue({ left: 100, top: 20, right: 1000, bottom: 720, width: 900, height: 700, x: 100, y: 20, toJSON: () => undefined });
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 900, clientY: 50 }));
    expect(listener).toHaveBeenLastCalledWith({ pageX: 900, pageY: 50 });

    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 1100, clientY: 50 }));
    expect(listener).toHaveBeenCalledTimes(2);

    view.unmount();
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 250, clientY: 50 }));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(destroyGame).toHaveBeenCalledWith(true);
  });

  it('fires once over non-interactive UI and ignores interactive controls', () => {
    getCanvasBounds.mockReturnValue({ left: 20, top: 30, right: 820, bottom: 630, width: 800, height: 600, x: 20, y: 30, toJSON: () => undefined });
    const bridge = new GameEventBridge();
    const fireListener = vi.fn();
    bridge.on('firePointerPressed', fireListener);
    const view = render(<GameCanvas bridge={bridge} transport={new MockGameTransport()} />);
    const hud = document.createElement('header');
    document.body.append(hud);

    hud.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, button: 0, clientX: 250, clientY: 50,
    }));
    expect(fireListener).toHaveBeenCalledTimes(1);
    expect(fireListener).toHaveBeenLastCalledWith({ pageX: 250, pageY: 50 });

    const button = document.createElement('button');
    button.dataset.gameUiInteractive = 'true';
    const icon = document.createElement('span');
    button.append(icon);
    document.body.append(button);
    icon.dispatchEvent(new MouseEvent('pointerdown', {
      bubbles: true, button: 0, clientX: 250, clientY: 50,
    }));
    expect(fireListener).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new MouseEvent('pointerdown', { button: 2, clientX: 250, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 900, clientY: 50 }));
    expect(fireListener).toHaveBeenCalledTimes(1);

    view.unmount();
    window.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 250, clientY: 50 }));
    expect(fireListener).toHaveBeenCalledTimes(1);
    hud.remove();
    button.remove();
  });
});
