import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MatchSnapshot, PlayerSnapshot } from '../domain/types';
import { Hud } from './Hud';

const player = (id: string, name: string, state: PlayerSnapshot['state'], icon: string): PlayerSnapshot => ({
  id, name, state, icon, isLocal: id === 'arda', color: 0xffffff,
  checkpointId: 'start', eliminations: 0, answers: 0,
});

describe('Retro Rush player HUD', () => {
  it('renders names and connection states without player prefix glyphs', () => {
    const snapshot: MatchSnapshot = {
      state: 'RUNNING', timeRemainingMs: 60_000, countdown: 0, checkpointLabel: 'Başlangıç Noktası', danger: false,
      cooldowns: { speed: 0, rocket: 0, ask: 0 },
      players: [
        player('arda', 'arda', 'ACTIVE', 'Ã¢â€”â€ '),
        player('acaeeac', 'acaeeac', 'DISCONNECTED', '◆'),
      ],
    };

    const view = render(<Hud snapshot={snapshot} muted={false} onMute={() => undefined} onAbility={() => undefined} />);
    const list = view.getByLabelText('Oyuncular');
    expect(within(list).getByText('arda')).toBeInTheDocument();
    expect(within(list).getByText('AKTİF')).toBeInTheDocument();
    expect(within(list).getByText('acaeeac')).toBeInTheDocument();
    expect(within(list).getByText('BAĞLANTI KESİLDİ')).toBeInTheDocument();
    expect(list).not.toHaveTextContent('ACTIVE');
    expect(list).not.toHaveTextContent('DISCONNECTED');
    expect(list).not.toHaveTextContent('Ã¢â€”â€ ');
    expect(list).not.toHaveTextContent('◆');
  });
});
