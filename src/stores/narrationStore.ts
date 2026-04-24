import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// USAGE: Always use per-field selectors, NOT wholesale destructuring
// ---------------------------------------------------------------------------
// GOOD:
//   const isNarrationEnabled = useNarrationStore(s => s.isNarrationEnabled);
//   const isNarrationPlaying = useNarrationStore(s => s.isNarrationPlaying);
//
// BAD (causes unnecessary re-renders):
//   const { isNarrationEnabled, isNarrationPlaying, ... } = useNarrationStore();
//
// For components needing many fields, consider using zustand/shallow:
//   import { shallow } from 'zustand/react';
//   const fields = useNarrationStore(
//     state => ({ isNarrationEnabled: state.isNarrationEnabled, isNarrationPlaying: state.isNarrationPlaying }),
//     shallow
//   );

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface NarrationState {
  // --- Narration ---
  isNarrationEnabled: boolean;
  isNarrationPlaying: boolean;
  isLoadingAudio: boolean;
  autoAdvancePages: boolean;
  isRateLimited: boolean;
  rateLimitResetTime: number | null;

  // --- Actions: Narration ---
  setNarrationEnabled: (enabled: boolean) => void;
  setNarrationPlaying: (playing: boolean) => void;
  setLoadingAudio: (loading: boolean) => void;
  setAutoAdvancePages: (auto: boolean) => void;
  setRateLimited: (limited: boolean, resetTime?: number) => void;

  // --- Actions: Reset ---
  resetNarration: () => void;
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

const useNarrationStore = create<NarrationState>()(
  devtools(
    (set, get) => ({

      // --- Initial state ---
      isNarrationEnabled: true,
      isNarrationPlaying: false,
      isLoadingAudio: false,
      autoAdvancePages: false,
      isRateLimited: false,
      rateLimitResetTime: null,

      // -----------------------------------------------------------------------
      // NARRATION ACTIONS
      // -----------------------------------------------------------------------

      setNarrationEnabled: (enabled) => set({ isNarrationEnabled: enabled }),

      setNarrationPlaying: (playing) => set({ isNarrationPlaying: playing }),

      setLoadingAudio: (loading) => set({ isLoadingAudio: loading }),

      setAutoAdvancePages: (auto) => set({ autoAdvancePages: auto }),

      setRateLimited: (limited, resetTime?) => {
        set({
          isRateLimited: limited,
          rateLimitResetTime: resetTime ?? null,
          isNarrationEnabled: limited ? false : get().isNarrationEnabled,
        });
      },

      // -----------------------------------------------------------------------
      // RESET ACTIONS
      // -----------------------------------------------------------------------

      resetNarration: () => {
        set({
          isNarrationEnabled: true,
          isNarrationPlaying: false,
          isLoadingAudio: false,
          autoAdvancePages: false,
          isRateLimited: false,
          rateLimitResetTime: null,
        });
      },
    })
  )
);

export { useNarrationStore };
