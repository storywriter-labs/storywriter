/**
 * Standardized Error Handling Utilities
 * 
 * Provides consistent error handling patterns across the application
 */
import { logger, LogCategory } from './logger';
import { trackEvent, AnalyticsEvents } from './analytics';

export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation', 
  SYSTEM = 'system',
  AUDIO = 'audio',
  STORY_GENERATION = 'story_generation',
  CONVERSATION = 'conversation',
  STORAGE = 'storage'
}

export enum ErrorSeverity {
  LOW = 'low',        // Non-blocking errors, app continues to work
  MEDIUM = 'medium',  // Feature-blocking errors, affects specific functionality
  HIGH = 'high',      // Critical errors, may require restart or intervention
  CRITICAL = 'critical' // App-breaking errors
}

export interface AppError {
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  userMessage: string;
  originalError?: Error | unknown;
  timestamp: number;
  context?: Record<string, unknown>;
}

export class ErrorHandler {
  /**
   * Creates a standardized error object
   */
  static createError(
    type: ErrorType,
    severity: ErrorSeverity,
    message: string,
    userMessage: string,
    originalError?: Error | unknown,
    context?: Record<string, unknown>
  ): AppError {
    return {
      type,
      severity,
      message,
      userMessage,
      originalError,
      timestamp: Date.now(),
      context
    };
  }

  /**
   * Logs error with consistent formatting using logger utility
   */
  static logError(error: AppError): void {
    const category = this.mapErrorTypeToLogCategory(error.type);
    const context = {
      ...error.context,
      errorType: error.type,
      severity: error.severity,
      originalError: error.originalError instanceof Error ? {
        name: error.originalError.name,
        message: error.originalError.message,
        stack: process.env.NODE_ENV === 'development' ? error.originalError.stack : undefined
      } : error.originalError
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.critical(category, error.message, context);
        break;
      case ErrorSeverity.HIGH:
        logger.error(category, error.message, context);
        break;
      case ErrorSeverity.MEDIUM:
      case ErrorSeverity.LOW:
        logger.warn(category, error.message, context);
        break;
    }
  }

  /**
   * Maps ErrorType to LogCategory
   */
  private static mapErrorTypeToLogCategory(errorType: ErrorType): LogCategory {
    switch (errorType) {
      case ErrorType.CONVERSATION:
        return LogCategory.CONVERSATION;
      case ErrorType.STORY_GENERATION:
        return LogCategory.STORY_GENERATION;
      case ErrorType.AUDIO:
        return LogCategory.AUDIO;
      case ErrorType.STORAGE:
        return LogCategory.STORAGE;
      case ErrorType.NETWORK:
        return LogCategory.SYSTEM;
      case ErrorType.VALIDATION:
        return LogCategory.SYSTEM;
      case ErrorType.SYSTEM:
      default:
        return LogCategory.SYSTEM;
    }
  }

  /**
   * Handles different error types with appropriate actions
   */
  static handleError(error: AppError): void {
    this.logError(error);

    trackEvent(AnalyticsEvents.ERROR_OCCURRED, {
      error_type: error.type,
      error_severity: error.severity,
      context: error.message,
    });

    // Additional handling based on severity using logger
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.critical(LogCategory.SYSTEM, 'CRITICAL ERROR - Consider app restart', {
          errorId: `${error.type}_${error.timestamp}`,
          ...error.context
        });
        break;
      case ErrorSeverity.HIGH:
        logger.error(LogCategory.SYSTEM, 'HIGH SEVERITY ERROR - User intervention may be needed', {
          errorId: `${error.type}_${error.timestamp}`,
          ...error.context
        });
        break;
      case ErrorSeverity.MEDIUM:
      case ErrorSeverity.LOW:
        // Normal error logging is sufficient (already done in logError)
        break;
    }
  }

  /**
   * Converts unknown error to AppError
   */
  static fromUnknown(
    error: unknown,
    type: ErrorType = ErrorType.SYSTEM,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, unknown>
  ): AppError {
    let message = 'Unknown error occurred';
    let userMessage = 'Something went wrong. Please try again.';

    if (error instanceof Error) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    } else if (error && typeof error === 'object' && 'message' in error) {
      message = String(error.message);
    }

    // Generate more specific user messages based on error type
    userMessage = this.generateUserMessage(type, message);

    return this.createError(type, severity, message, userMessage, error, context);
  }

  /**
   * Generates user-friendly error messages
   */
  private static generateUserMessage(type: ErrorType, _message: string): string {
    switch (type) {
      case ErrorType.NETWORK:
        return 'Network connection issue. Please check your internet and try again.';
      case ErrorType.CONVERSATION:
        return 'Could not connect to the StoryWriter Agent. Please try again.';
      case ErrorType.STORY_GENERATION:
        return 'Having trouble creating your story. Let\'s try again!';
      case ErrorType.AUDIO:
        return 'Audio generation is temporarily unavailable. Story creation will continue.';
      case ErrorType.STORAGE:
        return 'Could not save your story. Please try again.';
      case ErrorType.VALIDATION:
        return 'Please check your input and try again.';
      case ErrorType.SYSTEM:
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}

/**
 * Child-friendly error messages for story generation errors
 */
export const ChildFriendlyErrors: {
  storyGeneration: string[];
  conversation: string[];
  audio: string[];
  getRandomMessage(category: 'storyGeneration' | 'conversation' | 'audio'): string;
} = {
  storyGeneration: [
    "Our story elves are working extra hard! Let's try again...",
    "The story magic needs a moment to recharge!",
    "Our story machine is being extra careful with your tale!",
    "Sometimes the best stories need a second try!",
    "The story creators are making sure everything is perfect!"
  ],

  conversation: [
    "The StoryWriter Agent is taking a quick break! Let's try connecting again.",
    "Our story friend needs a moment to wake up! Try again in a second.",
    "The connection sprites are being silly! Let's try once more."
  ],

  audio: [
    "The voice magic is resting right now, but your story is still amazing!",
    "Our story narrator is taking a quick break, but we can still read together!"
  ],

  getRandomMessage(category: 'storyGeneration' | 'conversation' | 'audio'): string {
    const messages = this[category];
    return messages[Math.floor(Math.random() * messages.length)];
  }
};

/**
 * Utility functions for common error scenarios
 */
export const ErrorUtils = {
  /**
   * Handles async operations with standardized error handling
   */
  async safeAsync<T>(
    operation: () => Promise<T>,
    errorType: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, unknown>
  ): Promise<{ success: true; data: T } | { success: false; error: AppError }> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const appError = ErrorHandler.fromUnknown(error, errorType, severity, context);
      ErrorHandler.handleError(appError);
      return { success: false, error: appError };
    }
  },

  /**
   * Wraps sync operations with error handling
   */
  safeSync<T>(
    operation: () => T,
    errorType: ErrorType,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, unknown>
  ): { success: true; data: T } | { success: false; error: AppError } {
    try {
      const data = operation();
      return { success: true, data };
    } catch (error) {
      const appError = ErrorHandler.fromUnknown(error, errorType, severity, context);
      ErrorHandler.handleError(appError);
      return { success: false, error: appError };
    }
  }
};