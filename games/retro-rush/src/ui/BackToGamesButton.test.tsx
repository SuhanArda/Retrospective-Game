import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackToGamesButton } from './BackToGamesButton';

describe('Retro Rush host-only game selection return', () => {
  it('renders and invokes the return action for the authoritative host', () => {
    const onReturn = vi.fn();
    const view = render(<BackToGamesButton roomIsHost onReturn={onReturn} />);

    fireEvent.click(view.getByRole('button', { name: 'OYUNLARA DÖN' }));
    expect(onReturn).toHaveBeenCalledOnce();
  });

  it('does not render the action for a participant', () => {
    const view = render(<BackToGamesButton roomIsHost={false} onReturn={() => undefined} />);
    expect(view.queryByRole('button', { name: 'OYUNLARA DÖN' })).not.toBeInTheDocument();
  });

  it('appears when an authoritative room update promotes the player to host', () => {
    const view = render(<BackToGamesButton roomIsHost={false} onReturn={() => undefined} />);
    view.rerender(<BackToGamesButton roomIsHost onReturn={() => undefined} />);
    expect(view.getByRole('button', { name: 'OYUNLARA DÖN' })).toBeInTheDocument();
  });
});
