/**
 * Configuration Types
 * Type definitions for server configuration
 */

import { z } from 'zod';

// Security levels enum
export enum SecurityLevel {
  STRICT = 'strict',
  MODERATE = 'moderate',
  PERMISSIVE = 'permissive'
}

// Log levels enum
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug'
}

// Log destinations enum
export enum LogDestination {
  CONSOLE = 'console',
  FILE = 'file',
  SYSLOG = 'syslog'
}

// Configuration schema using Zod
export const ServerConfigurationSchema = z.object({
  // Directory Access
  allowedDirectories: z.array(z.string()).default([
    '~/Documents',
    '~/Desktop'
  ]).describe('List of allowed directories for filesystem operations'),
  
  securityLevel: z.nativeEnum(SecurityLevel).default(SecurityLevel.STRICT)
    .describe('Security level: strict, moderate, or permissive'),
  
  // File Restrictions
  maxFileSize: z.string().default('10MB')
    .describe('Maximum file size (e.g., "10MB", "1GB")'),
  
  allowedExtensions: z.array(z.string()).default(['*'])
    .describe('Allowed file extensions, ["*"] for all'),
  
  blockedExtensions: z.array(z.string()).default([])
    .describe('Blocked file extensions'),
  
  allowedMimeTypes: z.array(z.string()).default([])
    .describe('Allowed MIME types, empty array for no restriction'),
  
  blockedMimeTypes: z.array(z.string()).default([])
    .describe('Blocked MIME types'),
  
  allowedFileCategories: z.array(z.string()).default([])
    .describe('Allowed file categories (text, code, image, document, archive, executable, media)'),
  
  blockedFileCategories: z.array(z.string()).default([])
    .describe('Blocked file categories'),
  
  enableContentValidation: z.boolean().default(false)
    .describe('Enable content-based validation for additional security'),
  
  blockDangerousFiles: z.boolean().default(true)
    .describe('Block dangerous file extensions in strict mode'),
  
  // Logging Configuration
  logLevel: z.nativeEnum(LogLevel).default(LogLevel.INFO)
    .describe('Logging level'),
  
  logDestination: z.nativeEnum(LogDestination).default(LogDestination.CONSOLE)
    .describe('Log destination'),
  
  logFile: z.string().optional()
    .describe('Log file path (required when logDestination is "file")'),
  
  // Server Options
  enableEnhancedTools: z.boolean().default(false)
    .describe('Enable enhanced filesystem tools (copy, move, delete, search)'),
  
  enableBatchOperations: z.boolean().default(false)
    .describe('Enable batch operations for multiple files'),
  
  enableSymlinkFollowing: z.boolean().default(false)
    .describe('Allow following symbolic links'),
  
  // Performance Options
  maxConcurrentOperations: z.number().default(5)
    .describe('Maximum number of concurrent filesystem operations'),
  
  operationTimeout: z.number().default(30000)
    .describe('Operation timeout in milliseconds'),
  
  // Cache Options
  enableCaching: z.boolean().default(true)
    .describe('Enable caching for directory listings and metadata'),
  
  cacheTimeout: z.number().default(60000)
    .describe('Cache timeout in milliseconds')
});

// TypeScript interface derived from schema
export type ServerConfiguration = z.infer<typeof ServerConfigurationSchema>;

// Environment variable mapping
export interface EnvironmentVariables {
  MCP_FS_ALLOWED_DIRS?: string;
  MCP_FS_SECURITY_LEVEL?: string;
  MCP_FS_MAX_FILE_SIZE?: string;
  MCP_FS_ALLOWED_EXTENSIONS?: string;
  MCP_FS_BLOCKED_EXTENSIONS?: string;
  MCP_FS_ALLOWED_MIME_TYPES?: string;
  MCP_FS_BLOCKED_MIME_TYPES?: string;
  MCP_FS_ALLOWED_FILE_CATEGORIES?: string;
  MCP_FS_BLOCKED_FILE_CATEGORIES?: string;
  MCP_FS_ENABLE_CONTENT_VALIDATION?: string;
  MCP_FS_BLOCK_DANGEROUS_FILES?: string;
  MCP_FS_LOG_LEVEL?: string;
  MCP_FS_LOG_DESTINATION?: string;
  MCP_FS_LOG_FILE?: string;
  MCP_FS_ENABLE_ENHANCED_TOOLS?: string;
  MCP_FS_ENABLE_BATCH_OPERATIONS?: string;
  MCP_FS_ENABLE_SYMLINK_FOLLOWING?: string;
  MCP_FS_MAX_CONCURRENT_OPERATIONS?: string;
  MCP_FS_OPERATION_TIMEOUT?: string;
  MCP_FS_ENABLE_CACHING?: string;
  MCP_FS_CACHE_TIMEOUT?: string;
}

// Configuration source priority
export enum ConfigSource {
  DEFAULT = 'default',
  CONFIG_FILE = 'config_file',
  ENVIRONMENT = 'environment',
  CLI_ARGS = 'cli_args'
}

// Configuration with metadata
export interface ConfigurationWithMetadata {
  config: ServerConfiguration;
  sources: Record<keyof ServerConfiguration, ConfigSource>;
  configFile?: string | undefined;
  errors: string[];
  warnings: string[];
}