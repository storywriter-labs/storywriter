import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { logger, LogCategory } from '@/src/utils/logger';

// ---------------------------------------------------------------------------
// USAGE: Always use per-field selectors, NOT wholesale destructuring
// ---------------------------------------------------------------------------
// GOOD:
//   const phase = useConversationStore(s => s.phase);
//   const startConversation = useConversationStore(s => s.startConversation);
//
// BAD (causes unnecessary re-renders):
//   const { phase, startConversation, ... } = useConversationStore();
//
// For components needing many fields, consider using zustand/shallow:
//   import { shallow } from 'zustand/react';
//   const fields = useConversationStore(
//     state => ({ phase: state.phase, finalTranscript: state.finalTranscript }),
//     shallow
//   );

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export type ConversationPhase =
  | 'IDLE'        // No active conversation
  | 'ACTIVE'      // ElevenLabs conversation in progress
  | 'GENERATING'  // Generating story from transcript
  | 'COMPLETE';   // Story ready to display

export interface ConversationState {
  // --- Conversation ---
  phase: ConversationPhase;
  finalTranscript: string;
  conversationId: string | null;

  // --- Speech UI feedback ---
  isListening: boolean;
  isSpeaking: boolean;
  speechRate: number;
  speechVolume: number;

  // --- Actions: Conversation ---
  startConversation: () => void;
  endConversation: (transcript: string) => void;
  setPhase: (phase: ConversationPhase) => void;
  setConversationId: (conversationId: string | null) => void;
  setSpeechState: (state: Partial<Pick<ConversationState, 'isListening' | 'isSpeaking' | 'speechRate' | 'speechVolume'>>) => void;
  resetConversation: () => void;
}

// ---------------------------------------------------------------------------
// STORE
// ---------------------------------------------------------------------------

const useConversationStore = create<ConversationState>()(
  devtools(
    (set, _get) => ({

      // --- Initial state ---
      phase: 'IDLE',
      finalTranscript: '',
      conversationId: null,
      isListening: false,
      isSpeaking: false,
      speechRate: 1.0,
      speechVolume: 1.0,

      // -----------------------------------------------------------------------
      // CONVERSATION ACTIONS
      // -----------------------------------------------------------------------

      startConversation: () => {
        logger.info(LogCategory.CONVERSATION, 'Starting conversation', {});
        set({
          phase: 'ACTIVE',
          finalTranscript: '',
          conversationId: null,
          isListening: false,
          isSpeaking: false,
        });
      },

      endConversation: (transcript: string) => {
        logger.info(LogCategory.CONVERSATION, 'Conversation ended', {
          transcriptLength: transcript.length,
          transcriptPreview: transcript.substring(0, 100),
        });

        set({
          phase: 'GENERATING',
          finalTranscript: transcript,
          isListening: false,
          isSpeaking: false,
        });
      },

      setPhase: (phase) => set({ phase }),

      setConversationId: (conversationId) => {
        logger.info(LogCategory.CONVERSATION, 'Captured ElevenLabs conversation ID', {
          conversationId: conversationId ?? undefined,
        });
        set({ conversationId });
      },

      setSpeechState: (speechState) => set((state) => ({ ...state, ...speechState })),

      resetConversation: () => {
        set({
          phase: 'IDLE',
          finalTranscript: '',
          conversationId: null,
          isListening: false,
          isSpeaking: false,
        });
      },
    })
  )
);

export { useConversationStore };
