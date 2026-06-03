import { TranscriptNormalizer, DialogueTurn } from '@/src/utils/transcriptNormalizer';
import { logger, LogCategory } from '@/src/utils/logger';

export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
}

/**
 * Processes conversation messages into a normalized transcript.
 * Validates that there are sufficient user messages and then normalizes the transcript.
 */
export class TranscriptProcessor {
  private static readonly MIN_USER_MESSAGES = 2;

  /**
   * Converts ConversationMessage array to DialogueTurn array.
   */
  private static toDialogueTurns(messages: ConversationMessage[]): DialogueTurn[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));
  }

  /**
   * Validates that a message list has sufficient user messages for story generation.
   * @returns true if validation passes, false otherwise
   */
  static validateMessageList(messages: ConversationMessage[]): boolean {
    const userMessages = messages.filter(msg => msg.role === 'user');

    if (userMessages.length < this.MIN_USER_MESSAGES) {
      logger.warn(LogCategory.CONVERSATION, 'Insufficient user messages for story generation', {
        totalMessages: messages.length,
        userMessages: userMessages.length,
        minRequired: this.MIN_USER_MESSAGES
      });
      return false;
    }

    return true;
  }

  /**
   * Processes a list of conversation messages into a normalized transcript.
   * Must call validateMessageList first to ensure sufficient user messages.
   */
  static processTranscript(messages: ConversationMessage[]): string {
    const dialogueTurns = this.toDialogueTurns(messages);
    const finalTranscript = TranscriptNormalizer.generateTranscript(dialogueTurns);

    const userMessages = messages.filter(msg => msg.role === 'user');
    logger.info(LogCategory.CONVERSATION, 'Generated final transcript with validation passed', {
      originalMessages: messages.length,
      userMessages: userMessages.length,
      processedLength: finalTranscript.length,
      fullTranscript: finalTranscript
    });

    return finalTranscript;
  }

  /**
   * Convenience method that validates and processes messages in one call.
   * Returns the normalized transcript if validation passes, null otherwise.
   */
  static validateAndProcess(messages: ConversationMessage[]): string | null {
    if (!this.validateMessageList(messages)) {
      return null;
    }
    return this.processTranscript(messages);
  }
}
