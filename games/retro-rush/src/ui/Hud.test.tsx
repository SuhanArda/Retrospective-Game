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
      cooldowns: { speed: 0, rocket: 0, pull: 0 }, abilityInitialLockRemainingMs: 0,
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

  it('shows the initial lock, then makes all abilities available without pickups', () => {
    const onAbility = vi.fn();
    const snapshot: MatchSnapshot = {
      state: 'RUNNING', timeRemainingMs: 60_000, countdown: 0, checkpointLabel: 'Başlangıç Noktası', danger: false,
      players: [player('arda', 'Arda', 'ACTIVE', '◆')],
      cooldowns: { speed: 7_000, rocket: 7_000, pull: 7_000 }, abilityInitialLockRemainingMs: 7_000,
    };
    const view = render(<Hud snapshot={snapshot} muted={false} onMute={() => undefined} onAbility={onAbility} />);
    const slots = within(view.getByLabelText('Yetenekler')).getAllByRole('button');
    expect(slots).toHaveLength(3);
    expect(slots.every((slot) => slot.hasAttribute('disabled'))).toBe(true);
    expect(view.getAllByText('KİLİTLİ 7 sn')).toHaveLength(3);
    slots.forEach((slot) => fireEvent.click(slot));
    expect(onAbility).not.toHaveBeenCalled();

    view.rerender(<Hud snapshot={{ ...snapshot, cooldowns: { speed: 0, rocket: 0, pull: 0 }, abilityInitialLockRemainingMs: 0 }} muted={false} onMute={() => undefined} onAbility={onAbility} />);
    const rocket = view.getByRole('button', { name: /İtme roketi:/i });
    expect(rocket).toBeEnabled();
    expect(view.getAllByText('HAZIR')).toHaveLength(3);
    fireEvent.click(rocket);
    expect(onAbility).toHaveBeenCalledWith('rocket');
  });
});
