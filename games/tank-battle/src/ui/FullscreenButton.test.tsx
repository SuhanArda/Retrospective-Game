import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FullscreenButton } from './FullscreenButton';

const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
const originalRequestFullscreen = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen');

afterEach(() => {
  document.documentElement.classList.remove('tank-battle-fullscreen', 'tank-battle-question-open');
  if (originalFullscreenElement) Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
  else Reflect.deleteProperty(document, 'fullscreenElement');
  if (originalRequestFullscreen) Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequestFullscreen);
  else Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
});

describe('Tank Battle fullscreen cursor state', () => {
  it('tracks the actual Tank Battle fullscreen element and cleans up on exit and unmount', () => {
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    const view = render(<FullscreenButton questionOpen={false} />);
    expect(document.documentElement).not.toHaveClass('tank-battle-fullscreen');

    fullscreenElement = document.createElement('div');
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(document.documentElement).not.toHaveClass('tank-battle-fullscreen');

    fullscreenElement = document.documentElement;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(document.documentElement).toHaveClass('tank-battle-fullscreen');
    expect(document.documentElement).not.toHaveClass('tank-battle-question-open');

    view.rerender(<FullscreenButton questionOpen />);
    expect(document.documentElement).toHaveClass('tank-battle-fullscreen', 'tank-battle-question-open');

    fullscreenElement = null;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(document.documentElement).not.toHaveClass('tank-battle-fullscreen');
    expect(document.documentElement).toHaveClass('tank-battle-question-open');

    fullscreenElement = document.documentElement;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    view.rerender(<FullscreenButton questionOpen={false} />);
    expect(document.documentElement).toHaveClass('tank-battle-fullscreen');
    expect(document.documentElement).not.toHaveClass('tank-battle-question-open');

    fullscreenElement = null;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    expect(document.documentElement).not.toHaveClass('tank-battle-fullscreen');

    fullscreenElement = document.documentElement;
    act(() => document.dispatchEvent(new Event('fullscreenchange')));
    view.unmount();
    expect(document.documentElement).not.toHaveClass('tank-battle-fullscreen');
    expect(document.documentElement).not.toHaveClass('tank-battle-question-open');
  });
});
