import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MatchSnapshot, PlayerSnapshot } from '../domain/types';
import { ResultsScreen } from './ResultsScreen';

const player = (id: string, name: string, finishPosition: number, isLocal = false): PlayerSnapshot => ({
  id,
  name,
  state: 'FINISHED',
  isLocal,
  color: 0xffd166,
  icon: name[0]!,
  checkpointId: 'start',
  eliminations: finishPosition === 1 ? 0 : 1,
  answers: 0,
  finishPosition,
});

describe('authoritative Retro Rush results', () => {
  it('renders server positions in order and highlights winner, local player, and last place', () => {
    const snapshot: MatchSnapshot = {
      state: 'FINISHED',
      timeRemainingMs: 0,
      countdown: 0,
      players: [player('a', 'Aylin', 3), player('c', 'Cem', 1), player('b', 'Bora', 2, true)],
      checkpointLabel: 'Başlangıç Noktası',
      danger: false,
      ownedAbilities: [],
      cooldowns: { speed: 0, rocket: 0, ask: 0 },
    };

    const view = render(<ResultsScreen snapshot={snapshot} />);
    const rows = view.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '1.CCemKazanan',
      '2.BBora2. sıra · Sen',
      '3.AAylinRetrospektif sorusu sahibi',
    ]);
    expect(rows[0]).toHaveClass('winner');
    expect(rows[1]).toHaveClass('local-player');
    expect(rows[2]).toHaveClass('last-place');
  });
});
