import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BackToGamesButton } from './BackToGamesButton';

describe('Spin the Bottle host-only game selection return', () => {
  it('renders the Turkish action for the authoritative host', () => {
    const html = renderToStaticMarkup(<BackToGamesButton roomIsHost onReturn={() => undefined} />);
    expect(html).toContain('OYUNLARA DÖN');
  });

  it('does not render the action for a participant', () => {
    const html = renderToStaticMarkup(<BackToGamesButton roomIsHost={false} onReturn={() => undefined} />);
    expect(html).toBe('');
  });

  it('renders after authoritative host state changes to true', () => {
    const before = renderToStaticMarkup(<BackToGamesButton roomIsHost={false} onReturn={() => undefined} />);
    const after = renderToStaticMarkup(<BackToGamesButton roomIsHost onReturn={() => undefined} />);
    expect(before).toBe('');
    expect(after).toContain('OYUNLARA DÖN');
  });
});
