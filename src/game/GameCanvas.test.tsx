import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameEventBridge } from '../bridge/GameEventBridge';
import { MockGameTransport } from '../networking/MockGameTransport';

const { createGame, destroyGame } = vi.hoisted(() => ({ createGame: vi.fn(), destroyGame: vi.fn() }));
vi.mock('./PhaserGame', () => ({ createPhaserGame: createGame.mockReturnValue({ destroy: destroyGame }) }));
import { GameCanvas } from './GameCanvas';

describe('GameCanvas smoke test', () => {
  it('creates one Phaser game and destroys it on unmount', () => {
    const view = render(<GameCanvas bridge={new GameEventBridge()} transport={new MockGameTransport()} />);
    expect(createGame).toHaveBeenCalledTimes(1);
    expect(view.getByLabelText('Retro Rush game world')).toBeInTheDocument();
    view.unmount();
    expect(destroyGame).toHaveBeenCalledWith(true);
  });
});
