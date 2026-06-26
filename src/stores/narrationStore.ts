import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

  // --- Preferences (persisted) ---
  /**
   * Whether narration should auto-play when a story page is displayed.
   * Toggled by the Play (on) / Pause (off) controls and remembered across
   * stories and app launches. When false, no TTS is generated on page change
   * until the user presses Play again.
   */
  isAutoPlayEnabled: boolean;

  // --- Actions: Narration ---
  setNarrationEnabled: (enabled: boolean) => void;
  setNarrationPlaying: (playing: boolean) => void;
  setLoadingAudio: (loading: boolean) => void;
  setAutoAdvancePages: (auto: boolean) => void;
  setRateLimited: (limited: boolean, resetTime?: number) => void;
  setAutoPlayEnabled: (enabled: boolean) => void;

  // --- Actions: Reset ---
  resetNarration: () => void;
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

const useNarrationStore = create<NarrationState>()(
  devtools(
    persist(
      (set, get) => ({

        // --- Initial state ---
        isNarrationEnabled: true,
        isNarrationPlaying: false,
        isLoadingAudio: false,
        autoAdvancePages: false,
        isRateLimited: false,
        rateLimitResetTime: null,

        // --- Preferences (persisted) ---
        isAutoPlayEnabled: true,

        // ---------------------------------------------------------------------
        // NARRATION ACTIONS
        // ---------------------------------------------------------------------

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

        setAutoPlayEnabled: (enabled) => set({ isAutoPlayEnabled: enabled }),

        // ---------------------------------------------------------------------
        // RESET ACTIONS
        // ---------------------------------------------------------------------

        resetNarration: () => {
          // Note: isAutoPlayEnabled is intentionally NOT reset — the auto-play
          // preference is remembered across stories and app launches.
          set({
            isNarrationEnabled: true,
            isNarrationPlaying: false,
            isLoadingAudio: false,
            autoAdvancePages: false,
            isRateLimited: false,
            rateLimitResetTime: null,
          });
        },
      }),
      {
        name: 'narration-preferences',
        storage: createJSONStorage(() => AsyncStorage),
        // Only persist user preferences, not transient playback state.
        partialize: (state) => ({ isAutoPlayEnabled: state.isAutoPlayEnabled }),
      }
    )
  )
);

export { useNarrationStore };
