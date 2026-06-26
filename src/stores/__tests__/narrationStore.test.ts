import { useNarrationStore } from '@/src/stores/narrationStore';

/**
 * Tests for the auto-play narration preference (card #32).
 *
 * Key invariant: isAutoPlayEnabled is a remembered user preference, so it must
 * survive resetNarration() (called when starting a new story) — unlike the
 * transient playback fields, which reset.
 */
describe('narrationStore – auto-play preference', () => {
  beforeEach(() => {
    // Reset to a known baseline between tests.
    useNarrationStore.setState({
      isNarrationEnabled: true,
      isNarrationPlaying: false,
      isLoadingAudio: false,
      autoAdvancePages: false,
      isRateLimited: false,
      rateLimitResetTime: null,
      isAutoPlayEnabled: true,
    });
  });

  it('defaults to auto-play enabled', () => {
    expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(true);
  });

  it('setAutoPlayEnabled toggles the preference', () => {
    useNarrationStore.getState().setAutoPlayEnabled(false);
    expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(false);

    useNarrationStore.getState().setAutoPlayEnabled(true);
    expect(useNarrationStore.getState().isAutoPlayEnabled).toBe(true);
  });

  it('resetNarration preserves the auto-play preference but clears transient state', () => {
    // Simulate an in-progress story where the user opted out of auto-play.
    useNarrationStore.setState({
      isAutoPlayEnabled: false,
      isNarrationPlaying: true,
      autoAdvancePages: true,
    });

    useNarrationStore.getState().resetNarration();

    const state = useNarrationStore.getState();
    expect(state.isAutoPlayEnabled).toBe(false); // preference remembered
    expect(state.isNarrationPlaying).toBe(false); // transient: reset
    expect(state.autoAdvancePages).toBe(false);   // transient: reset
    expect(state.isNarrationEnabled).toBe(true);
  });
});
