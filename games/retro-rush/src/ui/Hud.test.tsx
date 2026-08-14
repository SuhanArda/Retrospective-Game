import { fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
      ownedAbilities: [],
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

  it('shows empty disabled slots until only the collected ability is unlocked', () => {
    const onAbility = vi.fn();
    const snapshot: MatchSnapshot = {
      state: 'RUNNING', timeRemainingMs: 60_000, countdown: 0, checkpointLabel: 'Başlangıç Noktası', danger: false,
      players: [player('arda', 'Arda', 'ACTIVE', '◆')], ownedAbilities: [],
      cooldowns: { speed: 0, rocket: 0, ask: 0 },
    };
    const view = render(<Hud snapshot={snapshot} muted={false} onMute={() => undefined} onAbility={onAbility} />);
    const slots = within(view.getByLabelText('Yetenekler')).getAllByRole('button');
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.hasAttribute('disabled'))).toBe(true);
    expect(view.getAllByText('TOPLA')).toHaveLength(3);
    slots.forEach((slot) => fireEvent.click(slot));
    expect(onAbility).not.toHaveBeenCalled();

    view.rerender(<Hud snapshot={{ ...snapshot, ownedAbilities: ['rocket'] }} muted={false} onMute={() => undefined} onAbility={onAbility} />);
    const rocket = view.getByRole('button', { name: /İtme roketi:/i });
    expect(rocket).toBeEnabled();
    fireEvent.click(rocket);
    expect(onAbility).toHaveBeenCalledWith('rocket');
  });
});
