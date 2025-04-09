/**
 * Logger utility for Directus TypeForge
 * 
 * Provides consistent logging with configurable debug levels.
 */
import * as fs from 'fs';
import * as path from 'path';
import { LOGGING_CONFIG } from '../config';

// Logger class for centralized logging
export class Logger {
  private static instance: Logger;
  private logBuffer: string[] = [];
  
  private constructor() {
    // Initialize log file if enabled
    if (LOGGING_CONFIG.LOG_TO_FILE) {
      try {
        // Create log directory if it doesn't exist
        const logDir = path.dirname(LOGGING_CONFIG.LOG_FILE_PATH);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Initialize log file with header
        fs.writeFileSync(
          LOGGING_CONFIG.LOG_FILE_PATH, 
          `--- TypeForge Debug Log (${new Date().toISOString()}) ---\n\n`
        );
      } catch (error) {
        console.error(`Failed to initialize log file: ${error}`);
      }
    }
  }
  
  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  /**
   * Check if a specific log level is enabled based on current configuration
   */
  public isLogLevelEnabled(level: keyof typeof LOGGING_CONFIG.LOG_LEVELS): boolean {
    return (
      LOGGING_CONFIG.DEBUG_ENABLED && 
      LOGGING_CONFIG.LOG_LEVELS[level] <= LOGGING_CONFIG.CURRENT_LOG_LEVEL
    );
  }
  
  /**
   * Log a message at ERROR level
   */
  public error(message: string, ...args: any[]): void {
    this.log('ERROR', message, ...args);
  }
  
  /**
   * Log a message at WARN level
   */
  public warn(message: string, ...args: any[]): void {
    this.log('WARN', message, ...args);
  }
  
  /**
   * Log a message at INFO level
   */
  public info(message: string, ...args: any[]): void {
    this.log('INFO', message, ...args);
  }
  
  /**
   * Log a message at DEBUG level
   */
  public debug(message: string, ...args: any[]): void {
    this.log('DEBUG', message, ...args);
  }
  
  /**
   * Log a message at TRACE level
   */
  public trace(message: string, ...args: any[]): void {
    this.log('TRACE', message, ...args);
  }
  
  /**
   * Internal method to handle log messages
   */
  private log(level: keyof typeof LOGGING_CONFIG.LOG_LEVELS, message: string, ...args: any[]): void {
    if (!this.isLogLevelEnabled(level)) return;
    
    // Format timestamp
    const timestamp = new Date().toISOString();
    
    // Format complete log message
    let formattedMessage = `[${timestamp}] [${level}] ${message}`;
    
    // Add any additional arguments
    if (args.length > 0) {
      const formattedArgs = args.map(arg => {
        if (typeof arg === 'object') {
          return JSON.stringify(arg, null, 2);
        }
        return String(arg);
      }).join(' ');
      
      formattedMessage += ` ${formattedArgs}`;
    }
    
    // Add to buffer
    this.logBuffer.push(formattedMessage);
    
    // Console output (only for higher levels or when DEBUG_ENABLED is true)
    if (level === 'ERROR' || level === 'WARN' || LOGGING_CONFIG.DEBUG_ENABLED) {
      const consoleMethod = level === 'ERROR' ? 'error' : 
                           level === 'WARN' ? 'warn' : 'log';
      console[consoleMethod](formattedMessage);
    }
    
    // Write to file if configured
    if (LOGGING_CONFIG.LOG_TO_FILE) {
      try {
        fs.appendFileSync(LOGGING_CONFIG.LOG_FILE_PATH, formattedMessage + '\n');
      } catch (error) {
        console.error(`Failed to write to log file: ${error}`);
      }
    }
  }
  
  /**
   * Get the entire log buffer as a string
   */
  public getLogBuffer(): string {
    return this.logBuffer.join('\n');
  }
  
  /**
   * Clear the log buffer
   */
  public clearLogBuffer(): void {
    this.logBuffer = [];
  }
}

// Export a singleton instance for easy import
export const logger = Logger.getInstance();