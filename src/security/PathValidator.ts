/**
 * PathValidator Class
 * Provides comprehensive security validation for filesystem paths
 * Implements defense-in-depth security model with multiple validation layers
 */

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PathValidationResult, SecurityEvent, ValidationOptions } from '../types/index';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { SecurityLevel } from '../config/types';

export class PathValidator {
  private allowedPrefixes: string[];
  private enableAuditLogging: boolean;
  private strictMode: boolean;
  private securityLevel: SecurityLevel;
  private securityEvents: SecurityEvent[] = [];

  constructor(options: ValidationOptions, securityLevel?: SecurityLevel) {
    this.allowedPrefixes = options.allowedPrefixes.map(prefix => 
      this.resolveAbsolutePath(prefix)
    );
    this.enableAuditLogging = options.enableAuditLogging;
    this.strictMode = options.strictMode;
    this.securityLevel = securityLevel || SecurityLevel.STRICT;
  }

  /**
   * Main validation method - validates a path through multiple security layers
   */
  public validatePath(inputPath: string): PathValidationResult {
    try {
      // Step 1: Basic input validation
      if (inputPath === null || inputPath === undefined || typeof inputPath !== 'string') {
        return this.createValidationResult(false, '', 'Invalid path input', false);
      }

      if (inputPath.length === 0 || inputPath.trim().length === 0) {
        return this.createValidationResult(false, '', 'Empty path not allowed', false);
      }

      // Step 2: Detect obvious traversal attempts before resolution
      if (this.checkTraversalAttempts(inputPath)) {
        this.logSecurityEvent('path_traversal', inputPath);
        return this.createValidationResult(
          false, 
          '', 
          'Path traversal attempt detected', 
          true
        );
      }

      // Step 3: Resolve to absolute path
      const resolvedPath = this.resolveAbsolutePath(inputPath);

      // Step 4: Check for encoded path attacks
      if (this.checkEncodedPathAttacks(inputPath)) {
        this.logSecurityEvent('path_traversal', inputPath, resolvedPath);
        return this.createValidationResult(
          false, 
          resolvedPath, 
          'Encoded path traversal attempt detected', 
          true
        );
      }

      // Step 5: Validate against allowed directories
      if (!this.isWithinAllowedDirectories(resolvedPath)) {
        this.logSecurityEvent('unauthorized_access', inputPath, resolvedPath);
        return this.createValidationResult(
          false, 
          resolvedPath, 
          'Path outside allowed directories', 
          true
        );
      }

      // Step 6: Check for symlink attacks (if file exists)
      if (this.strictMode && fs.existsSync(resolvedPath)) {
        const realPath = fs.realpathSync(resolvedPath);
        if (realPath !== resolvedPath && !this.isWithinAllowedDirectories(realPath)) {
          this.logSecurityEvent('unauthorized_access', inputPath, realPath);
          return this.createValidationResult(
            false, 
            resolvedPath, 
            'Symlink points outside allowed directories', 
            true
          );
        }
      }

      // All validations passed
      return this.createValidationResult(true, resolvedPath);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      return this.createValidationResult(false, '', `Validation error: ${errorMessage}`, false);
    }
  }

  /**
   * Resolves input path to absolute path, handling ~ expansion
   */
  private resolveAbsolutePath(inputPath: string): string {
    // Handle tilde expansion
    if (inputPath.startsWith('~/')) {
      return path.resolve(os.homedir(), inputPath.slice(2));
    }
    
    if (inputPath === '~') {
      return os.homedir();
    }

    // Resolve relative paths relative to home directory for security
    if (!path.isAbsolute(inputPath)) {
      return path.resolve(os.homedir(), inputPath);
    }

    return path.resolve(inputPath);
  }

  /**
   * Checks for obvious path traversal attempts in the input string
   */
  private checkTraversalAttempts(inputPath: string): boolean {
    // Base traversal patterns that are always checked
    const baseTraversalPatterns = [
      /\.\.\//,           // ../
      /\.\.\\/,           // ..\
      /\/\.\./,           // /..
      /\\\.\./,           // \..
      /\.\.$/,            // .. at end
      /^\.\.$/,           // exactly ..
    ];

    // Additional strict patterns only checked in strict mode
    const strictTraversalPatterns = [
      /\/\.\.$/,          // /.. at end
      /\\\.\.$/,          // \.. at end
      /\.\.\./,           // ...
      /\.\.\.$/,          // ... at end
    ];

    // Always check base patterns
    const hasBaseTraversal = baseTraversalPatterns.some(pattern => pattern.test(inputPath));
    
    if (hasBaseTraversal) {
      return true;
    }

    // Check additional patterns based on security level
    if (this.securityLevel === SecurityLevel.STRICT) {
      return strictTraversalPatterns.some(pattern => pattern.test(inputPath));
    }

    return false;
  }

  /**
   * Checks for encoded path attacks (URL encoding, etc.)
   */
  private checkEncodedPathAttacks(inputPath: string): boolean {
    // Base encoded patterns that are always checked
    const baseEncodedPatterns = [
      /%2e%2e%2f/i,       // ../
      /%2e%2e/i,          // ..
    ];

    // Additional encoded patterns checked in strict and moderate modes
    const strictEncodedPatterns = [
      /%2f/i,             // /
      /%5c/i,             // \
      /%00/i,             // null byte
      /%20/i,             // space (in strict mode)
    ];

    // Always check base patterns
    const hasBaseEncoded = baseEncodedPatterns.some(pattern => pattern.test(inputPath));
    if (hasBaseEncoded) {
      return true;
    }

    // Check additional patterns based on security level
    if (this.securityLevel === SecurityLevel.STRICT || this.securityLevel === SecurityLevel.MODERATE) {
      const hasStrictEncoded = strictEncodedPatterns.some(pattern => pattern.test(inputPath));
      if (hasStrictEncoded) {
        return true;
      }
    }

    // Check if decoded path differs significantly from input (potential encoding attack)
    // Only in strict and moderate modes
    if (this.securityLevel !== SecurityLevel.PERMISSIVE) {
      try {
        const decodedInput = decodeURIComponent(inputPath);
        if (decodedInput !== inputPath && this.checkTraversalAttempts(decodedInput)) {
          return true;
        }
      } catch {
        // In strict mode, treat decoding errors as suspicious
        if (this.securityLevel === SecurityLevel.STRICT) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Checks if the resolved path is within allowed directories
   */
  private isWithinAllowedDirectories(resolvedPath: string): boolean {
    return this.allowedPrefixes.some(prefix => {
      // Normalize paths for comparison
      const normalizedPath = path.normalize(resolvedPath);
      const normalizedPrefix = path.normalize(prefix);
      
      // Check if path starts with allowed prefix
      return normalizedPath.startsWith(normalizedPrefix + path.sep) || 
             normalizedPath === normalizedPrefix;
    });
  }

  /**
   * Logs security events for audit purposes
   */
  private logSecurityEvent(
    type: SecurityEvent['type'], 
    attemptedPath: string, 
    resolvedPath?: string
  ): void {
    if (!this.enableAuditLogging) {
      return;
    }

    const event: SecurityEvent = {
      timestamp: new Date(),
      type,
      attemptedPath,
      resolvedPath,
      clientInfo: 'PathValidator'
    };

    this.securityEvents.push(event);

    // In a production environment, this would be sent to a proper logging system
    console.warn(`[SECURITY] ${type}: ${attemptedPath}${resolvedPath ? ` -> ${resolvedPath}` : ''}`);
  }

  /**
   * Creates a standardized validation result
   */
  private createValidationResult(
    isValid: boolean, 
    resolvedPath: string, 
    error?: string, 
    securityViolation?: boolean
  ): PathValidationResult {
    return {
      isValid,
      resolvedPath,
      error,
      securityViolation
    };
  }

  /**
   * Gets all security events (for testing and monitoring)
   */
  public getSecurityEvents(): SecurityEvent[] {
    return [...this.securityEvents];
  }

  /**
   * Clears security events (for testing)
   */
  public clearSecurityEvents(): void {
    this.securityEvents = [];
  }

  /**
   * Gets allowed prefixes (for testing and debugging)
   */
  public getAllowedPrefixes(): string[] {
    return [...this.allowedPrefixes];
  }

  /**
   * Static factory method to create PathValidator with configuration-based settings
   */
  public static createFromConfiguration(configManager?: ConfigurationManager): PathValidator {
    const config = configManager || ConfigurationManager.getInstance();
    const serverConfig = config.getConfiguration();
    
    // Map security levels to validation options
    const securityLevelMapping = {
      [SecurityLevel.STRICT]: { enableAuditLogging: true, strictMode: true },
      [SecurityLevel.MODERATE]: { enableAuditLogging: true, strictMode: false },
      [SecurityLevel.PERMISSIVE]: { enableAuditLogging: false, strictMode: false }
    };
    
    const securitySettings = securityLevelMapping[serverConfig.securityLevel];
    
    const options: ValidationOptions = {
      allowedPrefixes: serverConfig.allowedDirectories,
      enableAuditLogging: securitySettings.enableAuditLogging,
      strictMode: securitySettings.strictMode
    };

    return new PathValidator(options, serverConfig.securityLevel);
  }

  /**
   * Static factory method to create PathValidator with default macOS settings
   * @deprecated Use createFromConfiguration() for configurable security settings
   */
  public static createForMacOS(enableAuditLogging = true, strictMode = true): PathValidator {
    const homeDir = os.homedir();
    const options: ValidationOptions = {
      allowedPrefixes: [
        path.join(homeDir, 'Documents'),
        path.join(homeDir, 'Desktop')
      ],
      enableAuditLogging,
      strictMode
    };

    return new PathValidator(options);
  }

  /**
   * Static factory method to create PathValidator with custom allowed directories
   */
  public static createWithDirectories(
    allowedDirectories: string[], 
    securityLevel: SecurityLevel = SecurityLevel.STRICT
  ): PathValidator {
    const securityLevelMapping = {
      [SecurityLevel.STRICT]: { enableAuditLogging: true, strictMode: true },
      [SecurityLevel.MODERATE]: { enableAuditLogging: true, strictMode: false },
      [SecurityLevel.PERMISSIVE]: { enableAuditLogging: false, strictMode: false }
    };
    
    const securitySettings = securityLevelMapping[securityLevel];
    
    const options: ValidationOptions = {
      allowedPrefixes: allowedDirectories,
      enableAuditLogging: securitySettings.enableAuditLogging,
      strictMode: securitySettings.strictMode
    };

    return new PathValidator(options);
  }
}