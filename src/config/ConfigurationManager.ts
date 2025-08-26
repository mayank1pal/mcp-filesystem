/**
 * ConfigurationManager Class
 * Centralized configuration management with multiple sources
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import {
  ServerConfiguration,
  ServerConfigurationSchema,
  EnvironmentVariables,
  ConfigSource,
  ConfigurationWithMetadata,
  SecurityLevel,
  LogLevel,
  LogDestination
} from './types';

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private configuration: ConfigurationWithMetadata;

  private constructor() {
    this.configuration = this.loadConfiguration();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Get current configuration
   */
  public getConfiguration(): ServerConfiguration {
    return this.configuration.config;
  }

  /**
   * Get configuration with metadata
   */
  public getConfigurationWithMetadata(): ConfigurationWithMetadata {
    return this.configuration;
  }

  /**
   * Reload configuration from all sources
   */
  public reloadConfiguration(): ConfigurationWithMetadata {
    this.configuration = this.loadConfiguration();
    return this.configuration;
  }

  /**
   * Load configuration from all sources with priority
   */
  private loadConfiguration(): ConfigurationWithMetadata {
    const errors: string[] = [];
    const warnings: string[] = [];
    const sources: Record<keyof ServerConfiguration, ConfigSource> = {} as any;
    
    // Start with default configuration
    let config = ServerConfigurationSchema.parse({});
    
    // Initialize all sources as default
    Object.keys(config).forEach(key => {
      sources[key as keyof ServerConfiguration] = ConfigSource.DEFAULT;
    });

    // 1. Load from configuration file
    const { config: fileConfig, configFile, errors: fileErrors, warnings: fileWarnings } = 
      this.loadFromConfigFile();
    
    if (fileConfig) {
      config = this.mergeConfigurations(config, fileConfig, sources, ConfigSource.CONFIG_FILE);
    }
    errors.push(...fileErrors);
    warnings.push(...fileWarnings);

    // 2. Load from environment variables
    const { config: envConfig, errors: envErrors, warnings: envWarnings } = 
      this.loadFromEnvironment();
    
    if (envConfig) {
      config = this.mergeConfigurations(config, envConfig, sources, ConfigSource.ENVIRONMENT);
    }
    errors.push(...envErrors);
    warnings.push(...envWarnings);

    // 3. Load from CLI arguments (if implemented)
    // TODO: Implement CLI argument parsing in future version

    // 4. Validate final configuration
    try {
      config = ServerConfigurationSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(`Configuration validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
    }

    // 5. Post-process configuration
    const { config: processedConfig, errors: processErrors, warnings: processWarnings } = 
      this.postProcessConfiguration(config);
    
    config = processedConfig;
    errors.push(...processErrors);
    warnings.push(...processWarnings);

    return {
      config,
      sources,
      configFile,
      errors,
      warnings
    };
  }

  /**
   * Load configuration from file (JSON or YAML)
   */
  private loadFromConfigFile(): {
    config: Partial<ServerConfiguration> | null;
    configFile?: string;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Possible config file locations
    const configPaths = [
      'mcp-filesystem.json',
      'mcp-filesystem.yaml',
      'mcp-filesystem.yml',
      '.mcp-filesystem.json',
      '.mcp-filesystem.yaml',
      '.mcp-filesystem.yml',
      path.join(os.homedir(), '.mcp-filesystem.json'),
      path.join(os.homedir(), '.mcp-filesystem.yaml'),
      path.join(os.homedir(), '.mcp-filesystem.yml'),
      path.join(os.homedir(), '.config', 'mcp-filesystem.json'),
      path.join(os.homedir(), '.config', 'mcp-filesystem.yaml'),
      path.join(os.homedir(), '.config', 'mcp-filesystem.yml')
    ];

    for (const configPath of configPaths) {
      try {
        if (fs.existsSync(configPath)) {
          const content = fs.readFileSync(configPath, 'utf8');
          let config: any;

          if (configPath.endsWith('.json')) {
            config = JSON.parse(content);
          } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
            // For now, we'll skip YAML support and add it later if needed
            warnings.push(`YAML configuration files not yet supported: ${configPath}`);
            continue;
          }

          return {
            config,
            configFile: configPath,
            errors,
            warnings
          };
        }
      } catch (error) {
        errors.push(`Failed to load config file ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return {
      config: null,
      errors,
      warnings
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): {
    config: Partial<ServerConfiguration> | null;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const env = process.env as EnvironmentVariables;
    const config: Partial<ServerConfiguration> = {};

    try {
      // Parse allowed directories
      if (env.MCP_FS_ALLOWED_DIRS) {
        config.allowedDirectories = env.MCP_FS_ALLOWED_DIRS.split(',').map(dir => dir.trim());
      }

      // Parse security level
      if (env.MCP_FS_SECURITY_LEVEL) {
        if (Object.values(SecurityLevel).includes(env.MCP_FS_SECURITY_LEVEL as SecurityLevel)) {
          config.securityLevel = env.MCP_FS_SECURITY_LEVEL as SecurityLevel;
        } else {
          errors.push(`Invalid security level: ${env.MCP_FS_SECURITY_LEVEL}`);
        }
      }

      // Parse file size limit
      if (env.MCP_FS_MAX_FILE_SIZE) {
        config.maxFileSize = env.MCP_FS_MAX_FILE_SIZE;
      }

      // Parse allowed extensions
      if (env.MCP_FS_ALLOWED_EXTENSIONS) {
        config.allowedExtensions = env.MCP_FS_ALLOWED_EXTENSIONS.split(',').map(ext => ext.trim());
      }

      // Parse blocked extensions
      if (env.MCP_FS_BLOCKED_EXTENSIONS) {
        config.blockedExtensions = env.MCP_FS_BLOCKED_EXTENSIONS.split(',').map(ext => ext.trim());
      }

      // Parse allowed MIME types
      if (env.MCP_FS_ALLOWED_MIME_TYPES) {
        config.allowedMimeTypes = env.MCP_FS_ALLOWED_MIME_TYPES.split(',').map(type => type.trim());
      }

      // Parse blocked MIME types
      if (env.MCP_FS_BLOCKED_MIME_TYPES) {
        config.blockedMimeTypes = env.MCP_FS_BLOCKED_MIME_TYPES.split(',').map(type => type.trim());
      }

      // Parse allowed file categories
      if (env.MCP_FS_ALLOWED_FILE_CATEGORIES) {
        config.allowedFileCategories = env.MCP_FS_ALLOWED_FILE_CATEGORIES.split(',').map(cat => cat.trim());
      }

      // Parse blocked file categories
      if (env.MCP_FS_BLOCKED_FILE_CATEGORIES) {
        config.blockedFileCategories = env.MCP_FS_BLOCKED_FILE_CATEGORIES.split(',').map(cat => cat.trim());
      }

      // Parse content validation flag
      if (env.MCP_FS_ENABLE_CONTENT_VALIDATION) {
        config.enableContentValidation = this.parseBoolean(env.MCP_FS_ENABLE_CONTENT_VALIDATION);
      }

      // Parse dangerous files blocking flag
      if (env.MCP_FS_BLOCK_DANGEROUS_FILES) {
        config.blockDangerousFiles = this.parseBoolean(env.MCP_FS_BLOCK_DANGEROUS_FILES);
      }

      // Parse log level
      if (env.MCP_FS_LOG_LEVEL) {
        if (Object.values(LogLevel).includes(env.MCP_FS_LOG_LEVEL as LogLevel)) {
          config.logLevel = env.MCP_FS_LOG_LEVEL as LogLevel;
        } else {
          errors.push(`Invalid log level: ${env.MCP_FS_LOG_LEVEL}`);
        }
      }

      // Parse log destination
      if (env.MCP_FS_LOG_DESTINATION) {
        if (Object.values(LogDestination).includes(env.MCP_FS_LOG_DESTINATION as LogDestination)) {
          config.logDestination = env.MCP_FS_LOG_DESTINATION as LogDestination;
        } else {
          errors.push(`Invalid log destination: ${env.MCP_FS_LOG_DESTINATION}`);
        }
      }

      // Parse log file
      if (env.MCP_FS_LOG_FILE) {
        config.logFile = env.MCP_FS_LOG_FILE;
      }

      // Parse boolean options
      if (env.MCP_FS_ENABLE_ENHANCED_TOOLS) {
        config.enableEnhancedTools = this.parseBoolean(env.MCP_FS_ENABLE_ENHANCED_TOOLS);
      }

      if (env.MCP_FS_ENABLE_BATCH_OPERATIONS) {
        config.enableBatchOperations = this.parseBoolean(env.MCP_FS_ENABLE_BATCH_OPERATIONS);
      }

      if (env.MCP_FS_ENABLE_SYMLINK_FOLLOWING) {
        config.enableSymlinkFollowing = this.parseBoolean(env.MCP_FS_ENABLE_SYMLINK_FOLLOWING);
      }

      if (env.MCP_FS_ENABLE_CACHING) {
        config.enableCaching = this.parseBoolean(env.MCP_FS_ENABLE_CACHING);
      }

      // Parse numeric options
      if (env.MCP_FS_MAX_CONCURRENT_OPERATIONS) {
        const value = parseInt(env.MCP_FS_MAX_CONCURRENT_OPERATIONS, 10);
        if (!isNaN(value) && value > 0) {
          config.maxConcurrentOperations = value;
        } else {
          errors.push(`Invalid max concurrent operations: ${env.MCP_FS_MAX_CONCURRENT_OPERATIONS}`);
        }
      }

      if (env.MCP_FS_OPERATION_TIMEOUT) {
        const value = parseInt(env.MCP_FS_OPERATION_TIMEOUT, 10);
        if (!isNaN(value) && value > 0) {
          config.operationTimeout = value;
        } else {
          errors.push(`Invalid operation timeout: ${env.MCP_FS_OPERATION_TIMEOUT}`);
        }
      }

      if (env.MCP_FS_CACHE_TIMEOUT) {
        const value = parseInt(env.MCP_FS_CACHE_TIMEOUT, 10);
        if (!isNaN(value) && value > 0) {
          config.cacheTimeout = value;
        } else {
          errors.push(`Invalid cache timeout: ${env.MCP_FS_CACHE_TIMEOUT}`);
        }
      }

    } catch (error) {
      errors.push(`Failed to parse environment variables: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      config: Object.keys(config).length > 0 ? config : null,
      errors,
      warnings
    };
  }

  /**
   * Merge configurations with source tracking
   */
  private mergeConfigurations(
    base: ServerConfiguration,
    override: Partial<ServerConfiguration>,
    sources: Record<keyof ServerConfiguration, ConfigSource>,
    source: ConfigSource
  ): ServerConfiguration {
    const merged = { ...base };

    Object.keys(override).forEach(key => {
      const typedKey = key as keyof ServerConfiguration;
      if (override[typedKey] !== undefined) {
        (merged as any)[typedKey] = override[typedKey];
        sources[typedKey] = source;
      }
    });

    return merged;
  }

  /**
   * Post-process configuration (expand paths, validate combinations, etc.)
   */
  private postProcessConfiguration(config: ServerConfiguration): {
    config: ServerConfiguration;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const processedConfig = { ...config };

    // Expand tilde paths in allowed directories
    processedConfig.allowedDirectories = processedConfig.allowedDirectories.map(dir => {
      if (dir.startsWith('~/')) {
        return path.join(os.homedir(), dir.slice(2));
      }
      return path.resolve(dir);
    });

    // Validate log file requirement
    if (processedConfig.logDestination === LogDestination.FILE && !processedConfig.logFile) {
      errors.push('Log file path is required when log destination is "file"');
    }

    // Validate file size format
    if (!this.isValidFileSize(processedConfig.maxFileSize)) {
      errors.push(`Invalid file size format: ${processedConfig.maxFileSize}`);
    }

    // Security level warnings
    if (processedConfig.securityLevel === SecurityLevel.PERMISSIVE) {
      warnings.push('Permissive security level reduces security protections');
    }

    // Enhanced tools warnings
    if (processedConfig.enableEnhancedTools && processedConfig.securityLevel === SecurityLevel.STRICT) {
      warnings.push('Enhanced tools may have limited functionality in strict security mode');
    }

    return {
      config: processedConfig,
      errors,
      warnings
    };
  }

  /**
   * Parse boolean from string
   */
  private parseBoolean(value: string): boolean {
    const lowerValue = value.toLowerCase();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
  }

  /**
   * Validate file size format
   */
  private isValidFileSize(size: string): boolean {
    const sizeRegex = /^\d+(\.\d+)?(B|KB|MB|GB|TB)$/i;
    return sizeRegex.test(size);
  }

  /**
   * Convert file size string to bytes
   */
  public parseFileSize(size: string): number {
    const match = size.match(/^(\d+(?:\.\d+)?)(B|KB|MB|GB|TB)$/i);
    if (!match) {
      throw new Error(`Invalid file size format: ${size}`);
    }

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    return Math.floor(value * multipliers[unit]);
  }

  /**
   * Get resolved allowed directories
   */
  public getAllowedDirectories(): string[] {
    return this.configuration.config.allowedDirectories;
  }

  /**
   * Check if a file extension is allowed
   */
  public isExtensionAllowed(extension: string): boolean {
    const config = this.configuration.config;
    
    // Check blocked extensions first
    if (config.blockedExtensions.includes(extension)) {
      return false;
    }

    // Check allowed extensions
    return config.allowedExtensions.includes('*') || config.allowedExtensions.includes(extension);
  }

  /**
   * Get maximum file size in bytes
   */
  public getMaxFileSizeBytes(): number {
    return this.parseFileSize(this.configuration.config.maxFileSize);
  }
}