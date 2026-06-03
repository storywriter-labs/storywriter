import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AppError, ErrorHandler } from '@/src/utils/errorHandler';

// ---------------------------------------------------------------------------
// USAGE: Always use per-field selectors, NOT wholesale destructuring
// ---------------------------------------------------------------------------
// GOOD:
//   const hasError = useErrorStore(s => s.hasError)('some_key');
//   const errors = useErrorStore(s => s.errors);
//
// BAD (causes unnecessary re-renders):
//   const { errors, hasError, ... } = useErrorStore();
//
// For components needing many fields, consider using zustand/shallow:
//   import { shallow } from 'zustand/react';
//   const fields = useErrorStore(
//     state => ({ errors: state.errors, hasError: state.hasError }),
//     shallow
//   );

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface ErrorState {
  // --- Errors ---
  errors: Record<string, AppError>;

  // --- Actions: Errors ---
  addError: (key: string, error: AppError) => void;
  removeError: (key: string) => void;
  clearErrors: () => void;
  hasError: (key?: string) => boolean;
  getError: (key: string) => AppError | undefined;
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

const useErrorStore = create<ErrorState>()(
  devtools(
    (set, get) => ({

      // --- Initial state ---
      errors: {},

      // -----------------------------------------------------------------------
      // ERROR ACTIONS
      // -----------------------------------------------------------------------

      addError: (key, error) => {
        set((state) => ({ errors: { ...state.errors, [key]: error } }));
        ErrorHandler.handleError(error);
      },

      removeError: (key) => {
        set((state) => {
          const updated = { ...state.errors };
          delete updated[key];
          return { errors: updated };
        });
      },

      clearErrors: () => set({ errors: {} }),

      hasError: (key?) => {
        const { errors } = get();
        return key ? key in errors : Object.keys(errors).length > 0;
      },

      getError: (key) => get().errors[key],
    })
  )
);

export { useErrorStore };
