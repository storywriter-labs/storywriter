/**
 * Structured Logging Utility
 * 
 * Provides consistent, structured logging with categories, context, and environment awareness
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export enum LogCategory {
  // Core functionality
  CONVERSATION = 'conversation',
  STORY_GENERATION = 'story_generation',
  AUDIO = 'audio',
  STORAGE = 'storage',
  
  // Services
  ELEVENLABS = 'elevenlabs',
  TOGETHER_AI = 'together_ai',
  HUGGINGFACE = 'huggingface',
  POLLY = 'polly',
  TRANSCRIBE = 'transcribe',
  
  // System
  SYSTEM = 'system',
  ERROR_BOUNDARY = 'error_boundary',
  NAVIGATION = 'navigation',
  
  // Development
  TEST = 'test',
  DEBUG = 'debug'
}

export interface LogContext {
  [key: string]: unknown;
  userId?: string;
  sessionId?: string;
  conversationId?: string;
  // The backend story id is numeric, and null until the story has been saved.
  storyId?: string | number | null;
  action?: string;
  phase?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  context?: LogContext;
  emoji?: string;
}

class Logger {
  private minLogLevel: LogLevel = LogLevel.DEBUG;
  private isDevelopment: boolean = process.env.NODE_ENV === 'development';
  private isProduction: boolean = process.env.NODE_ENV === 'production';
  
  constructor() {
    // Set minimum log level based on environment
    if (this.isProduction) {
      this.minLogLevel = LogLevel.WARN;
    } else if (process.env.NODE_ENV === 'test') {
      this.minLogLevel = LogLevel.ERROR;
    }
  }

  /**
   * Sets the minimum log level
   */
  setLogLevel(level: LogLevel): void {
    this.minLogLevel = level;
  }

  /**
   * Creates a structured log entry
   */
  private createLogEntry(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: LogContext,
    emoji?: string
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      context,
      emoji
    };
  }

  /**
   * Formats log entry for console output
   */
  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const emoji = entry.emoji || this.getDefaultEmoji(entry.level);
    const timestamp = entry.timestamp.substring(11, 23); // HH:mm:ss.sss
    
    let formatted = `${emoji} [${levelName}] [${entry.category.toUpperCase()}] ${timestamp} - ${entry.message}`;
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += `\n  Context: ${JSON.stringify(entry.context, null, 2)}`;
    }
    
    return formatted;
  }

  /**
   * Gets default emoji based on log level
   */
  private getDefaultEmoji(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return '🔍';
      case LogLevel.INFO:
        return 'ℹ️';
      case LogLevel.WARN:
        return '⚠️';
      case LogLevel.ERROR:
        return '❌';
      case LogLevel.CRITICAL:
        return '🚨';
      default:
        return '📝';
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    context?: LogContext,
    emoji?: string
  ): void {
    if (level < this.minLogLevel) {
      return;
    }

    const entry = this.createLogEntry(level, category, message, context, emoji);
    const formatted = this.formatLogEntry(entry);

    // Output to appropriate console method
    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(formatted);
        break;
    }

    // In production, could send to external logging service
    if (this.isProduction && level >= LogLevel.ERROR) {
      // TODO: Send to external logging service (e.g., Sentry, LogRocket)
      this.sendToExternalService(entry);
    }
  }

  /**
   * Placeholder for external logging service integration
   */
  private sendToExternalService(entry: LogEntry): void {
    // Implementation for external logging service would go here
    // For now, we'll just ensure critical errors are visible
    if (entry.level === LogLevel.CRITICAL) {
      console.error('🚨 CRITICAL ERROR - External logging would be triggered here:', entry);
    }
  }

  /**
   * Debug level logging (only in development)
   */
  debug(category: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.log(LogLevel.DEBUG, category, message, context, emoji);
  }

  /**
   * Info level logging
   */
  info(category: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.log(LogLevel.INFO, category, message, context, emoji);
  }

  /**
   * Warning level logging
   */
  warn(category: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.log(LogLevel.WARN, category, message, context, emoji);
  }

  /**
   * Error level logging
   */
  error(category: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.log(LogLevel.ERROR, category, message, context, emoji);
  }

  /**
   * Critical error logging (always logged, triggers external services)
   */
  critical(category: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.log(LogLevel.CRITICAL, category, message, context, emoji);
  }

  /**
   * Convenience methods for common scenarios
   */
  
  conversationEvent(message: string, context?: LogContext, emoji?: string): void {
    this.info(LogCategory.CONVERSATION, message, context, emoji);
  }

  storyGeneration(message: string, context?: LogContext, emoji?: string): void {
    this.info(LogCategory.STORY_GENERATION, message, context, emoji);
  }

  audioEvent(message: string, context?: LogContext, emoji?: string): void {
    this.info(LogCategory.AUDIO, message, context, emoji);
  }

  serviceCall(service: LogCategory, message: string, context?: LogContext, emoji?: string): void {
    this.info(service, message, context, emoji);
  }

  serviceError(service: LogCategory, message: string, error?: unknown, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined
      } : error
    };
    this.error(service, message, errorContext);
  }

  systemEvent(message: string, context?: LogContext, emoji?: string): void {
    this.info(LogCategory.SYSTEM, message, context, emoji);
  }

  testEvent(message: string, context?: LogContext, emoji = '🧪'): void {
    this.info(LogCategory.TEST, message, context, emoji);
  }
}

// Create and export singleton logger instance
export const logger = new Logger();

// Export specific category loggers for convenience
export const conversationLogger = {
  connected: (context?: LogContext) => logger.conversationEvent('Connected to StoryWriter Agent', context, '✅'),
  disconnected: (context?: LogContext) => logger.conversationEvent('Disconnected from StoryWriter Agent', context, '❌'),
  userMessage: (message: string, context?: LogContext) => logger.conversationEvent(`User: ${message}`, context, '👤'),
  agentMessage: (message: string, context?: LogContext) => logger.conversationEvent(`Agent: ${message}`, context, '🤖'),
  endDetected: (pattern: string, context?: LogContext) => logger.conversationEvent(`Conversation end detected via ${pattern}`, context, '🔚'),
  toolCall: (toolName: string, context?: LogContext) => logger.conversationEvent(`Tool call: ${toolName}`, context, '🔧'),
  timeout: (context?: LogContext) => logger.conversationEvent('Conversation inactivity timeout', context, '⏰'),
  cleanup: (context?: LogContext) => logger.conversationEvent('Cleaning up conversation session', context, '🧹')
};

export const storyLogger = {
  generating: (context?: LogContext) => logger.storyGeneration('Generating story', context, '✨'),
  complete: (context?: LogContext) => logger.storyGeneration('Story generation complete', context, '📚'),
  error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.STORY_GENERATION, 'Story generation failed', error, context),
  retry: (attempt: number, context?: LogContext) => logger.storyGeneration(`Story generation retry attempt ${attempt}`, context, '🔄')
};

export const audioLogger = {
  generating: (type: string, context?: LogContext) => logger.audioEvent(`Generating ${type} audio`, context, '🎵'),
  complete: (type: string, context?: LogContext) => logger.audioEvent(`${type} audio generated successfully`, context, '✅'),
  error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.AUDIO, 'Audio generation failed', error, context)
};

export const serviceLogger = {
  elevenlabs: {
    call: (action: string, context?: LogContext) => logger.serviceCall(LogCategory.ELEVENLABS, action, context, '🎤'),
    error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.ELEVENLABS, 'ElevenLabs service error', error, context)
  },
  
  together: {
    call: (action: string, context?: LogContext) => logger.serviceCall(LogCategory.TOGETHER_AI, action, context, '🤖'),
    error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.TOGETHER_AI, 'Together.ai service error', error, context)
  },
  
  huggingface: {
    call: (action: string, context?: LogContext) => logger.serviceCall(LogCategory.HUGGINGFACE, action, context, '🤗'),
    error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.HUGGINGFACE, 'HuggingFace service error', error, context)
  },
  
  polly: {
    call: (action: string, context?: LogContext) => logger.serviceCall(LogCategory.POLLY, action, context, '🗣️'),
    error: (error: unknown, context?: LogContext) => logger.serviceError(LogCategory.POLLY, 'Polly service error', error, context),
    warning: (message: string, context?: LogContext) => logger.warn(LogCategory.POLLY, message, context, '⚠️')
  }
};