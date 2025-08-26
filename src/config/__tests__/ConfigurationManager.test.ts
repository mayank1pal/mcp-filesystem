/**
 * ConfigurationManager Tests
 * Comprehensive tests for configuration management system
 */

import * as fs from 'fs';
import * as os from 'os';
import { ConfigurationManager } from '../ConfigurationManager';
import { SecurityLevel, LogLevel, LogDestination } from '../types';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock os module
jest.mock('os');
const mockOs = os as jest.Mocked<typeof os>;

describe('ConfigurationManager', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let configManager: ConfigurationManager;

  beforeEach(() => {
    // Clear singleton instance
    (ConfigurationManager as any).instance = undefined;
    
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MCP_FS_')) {
        delete process.env[key];
      }
    });

    // Mock os.homedir
    mockOs.homedir.mockReturnValue('/Users/test');

    // Reset fs mocks
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Singleton Pattern', () => {
    test('should return the same instance', () => {
      const instance1 = ConfigurationManager.getInstance();
      const instance2 = ConfigurationManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('Default Configuration', () => {
    test('should load default configuration when no other sources exist', () => {
      configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfiguration();

      expect(config.allowedDirectories).toEqual(['/Users/test/Documents', '/Users/test/Desktop']);
      expect(config.securityLevel).toBe(SecurityLevel.STRICT);
      expect(config.maxFileSize).toBe('10MB');
      expect(config.allowedExtensions).toEqual(['*']);
      expect(config.blockedExtensions).toEqual([]);
      expect(config.logLevel).toBe(LogLevel.INFO);
      expect(config.logDestination).toBe(LogDestination.CONSOLE);
      expect(config.enableEnhancedTools).toBe(false);
      expect(config.enableBatchOperations).toBe(false);
      expect(config.enableSymlinkFollowing).toBe(false);
      expect(config.maxConcurrentOperations).toBe(5);
      expect(config.operationTimeout).toBe(30000);
      expect(config.enableCaching).toBe(true);
      expect(config.cacheTimeout).toBe(60000);
    });

    test('should expand tilde paths in allowed directories', () => {
      configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfiguration();

      expect(config.allowedDirectories).toEqual([
        '/Users/test/Documents',
        '/Users/test/Desktop'
      ]);
    });
  });

  describe('Environment Variable Configuration', () => {
    test('should load configuration from environment variables', () => {
      process.env.MCP_FS_ALLOWED_DIRS = '~/Downloads,~/Projects';
      process.env.MCP_FS_SECURITY_LEVEL = 'moderate';
      process.env.MCP_FS_MAX_FILE_SIZE = '50MB';
      process.env.MCP_FS_ALLOWED_EXTENSIONS = '.txt,.md,.json';
      process.env.MCP_FS_BLOCKED_EXTENSIONS = '.exe,.bat';
      process.env.MCP_FS_LOG_LEVEL = 'debug';
      process.env.MCP_FS_LOG_DESTINATION = 'file';
      process.env.MCP_FS_LOG_FILE = '/var/log/mcp-fs.log';
      process.env.MCP_FS_ENABLE_ENHANCED_TOOLS = 'true';
      process.env.MCP_FS_ENABLE_BATCH_OPERATIONS = 'yes';
      process.env.MCP_FS_ENABLE_SYMLINK_FOLLOWING = '1';
      process.env.MCP_FS_MAX_CONCURRENT_OPERATIONS = '10';
      process.env.MCP_FS_OPERATION_TIMEOUT = '60000';
      process.env.MCP_FS_ENABLE_CACHING = 'false';
      process.env.MCP_FS_CACHE_TIMEOUT = '120000';

      configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfiguration();

      expect(config.allowedDirectories).toEqual(['/Users/test/Downloads', '/Users/test/Projects']);
      expect(config.securityLevel).toBe(SecurityLevel.MODERATE);
      expect(config.maxFileSize).toBe('50MB');
      expect(config.allowedExtensions).toEqual(['.txt', '.md', '.json']);
      expect(config.blockedExtensions).toEqual(['.exe', '.bat']);
      expect(config.logLevel).toBe(LogLevel.DEBUG);
      expect(config.logDestination).toBe(LogDestination.FILE);
      expect(config.logFile).toBe('/var/log/mcp-fs.log');
      expect(config.enableEnhancedTools).toBe(true);
      expect(config.enableBatchOperations).toBe(true);
      expect(config.enableSymlinkFollowing).toBe(true);
      expect(config.maxConcurrentOperations).toBe(10);
      expect(config.operationTimeout).toBe(60000);
      expect(config.enableCaching).toBe(false);
      expect(config.cacheTimeout).toBe(120000);
    });

    test('should handle invalid environment variable values', () => {
      process.env.MCP_FS_SECURITY_LEVEL = 'invalid';
      process.env.MCP_FS_LOG_LEVEL = 'invalid';
      process.env.MCP_FS_LOG_DESTINATION = 'invalid';
      process.env.MCP_FS_MAX_CONCURRENT_OPERATIONS = 'invalid';
      process.env.MCP_FS_OPERATION_TIMEOUT = '-1';

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.errors).toContain('Invalid security level: invalid');
      expect(configWithMetadata.errors).toContain('Invalid log level: invalid');
      expect(configWithMetadata.errors).toContain('Invalid log destination: invalid');
      expect(configWithMetadata.errors).toContain('Invalid max concurrent operations: invalid');
      expect(configWithMetadata.errors).toContain('Invalid operation timeout: -1');
    });

    test('should parse boolean values correctly', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'TRUE', expected: true },
        { value: '1', expected: true },
        { value: 'yes', expected: true },
        { value: 'YES', expected: true },
        { value: 'on', expected: true },
        { value: 'ON', expected: true },
        { value: 'false', expected: false },
        { value: 'FALSE', expected: false },
        { value: '0', expected: false },
        { value: 'no', expected: false },
        { value: 'off', expected: false },
        { value: 'invalid', expected: false }
      ];

      testCases.forEach(({ value, expected }) => {
        // Clear singleton for each test
        (ConfigurationManager as any).instance = undefined;
        
        process.env.MCP_FS_ENABLE_ENHANCED_TOOLS = value;
        
        configManager = ConfigurationManager.getInstance();
        const config = configManager.getConfiguration();
        
        expect(config.enableEnhancedTools).toBe(expected);
      });
    });
  });

  describe('Configuration File Loading', () => {
    test('should load configuration from JSON file', () => {
      const configContent = {
        allowedDirectories: ['/custom/path1', '/custom/path2'],
        securityLevel: 'permissive',
        maxFileSize: '100MB',
        enableEnhancedTools: true
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === 'mcp-filesystem.json';
      });

      mockFs.readFileSync.mockImplementation((filePath) => {
        if (filePath === 'mcp-filesystem.json') {
          return JSON.stringify(configContent);
        }
        throw new Error('File not found');
      });

      configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfiguration();

      expect(config.allowedDirectories).toEqual(['/custom/path1', '/custom/path2']);
      expect(config.securityLevel).toBe(SecurityLevel.PERMISSIVE);
      expect(config.maxFileSize).toBe('100MB');
      expect(config.enableEnhancedTools).toBe(true);
    });

    test('should handle JSON parsing errors', () => {
      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === 'mcp-filesystem.json';
      });

      mockFs.readFileSync.mockImplementation(() => {
        return 'invalid json content';
      });

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.errors.length).toBeGreaterThan(0);
      expect(configWithMetadata.errors[0]).toContain('Failed to load config file');
    });

    test('should check multiple config file locations', () => {
      const expectedPaths = [
        'mcp-filesystem.json',
        'mcp-filesystem.yaml',
        'mcp-filesystem.yml',
        '.mcp-filesystem.json',
        '.mcp-filesystem.yaml',
        '.mcp-filesystem.yml',
        '/Users/test/.mcp-filesystem.json',
        '/Users/test/.mcp-filesystem.yaml',
        '/Users/test/.mcp-filesystem.yml',
        '/Users/test/.config/mcp-filesystem.json',
        '/Users/test/.config/mcp-filesystem.yaml',
        '/Users/test/.config/mcp-filesystem.yml'
      ];

      mockFs.existsSync.mockReturnValue(false);

      configManager = ConfigurationManager.getInstance();

      expectedPaths.forEach(expectedPath => {
        expect(mockFs.existsSync).toHaveBeenCalledWith(expectedPath);
      });
    });
  });

  describe('Configuration Priority', () => {
    test('should prioritize environment variables over config file', () => {
      // Set up config file
      const configContent = {
        securityLevel: 'permissive',
        maxFileSize: '100MB'
      };

      mockFs.existsSync.mockImplementation((filePath) => {
        return filePath === 'mcp-filesystem.json';
      });

      mockFs.readFileSync.mockImplementation(() => {
        return JSON.stringify(configContent);
      });

      // Set environment variable
      process.env.MCP_FS_SECURITY_LEVEL = 'moderate';

      configManager = ConfigurationManager.getInstance();
      const config = configManager.getConfiguration();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      // Environment variable should override config file
      expect(config.securityLevel).toBe(SecurityLevel.MODERATE);
      // Config file value should still be used for other settings
      expect(config.maxFileSize).toBe('100MB');

      // Check sources
      expect(configWithMetadata.sources.securityLevel).toBe('environment');
      expect(configWithMetadata.sources.maxFileSize).toBe('config_file');
    });
  });

  describe('Configuration Validation', () => {
    test('should validate log file requirement', () => {
      process.env.MCP_FS_LOG_DESTINATION = 'file';
      // Don't set MCP_FS_LOG_FILE

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.errors).toContain('Log file path is required when log destination is "file"');
    });

    test('should validate file size format', () => {
      process.env.MCP_FS_MAX_FILE_SIZE = 'invalid-size';

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.errors).toContain('Invalid file size format: invalid-size');
    });

    test('should generate warnings for permissive security level', () => {
      process.env.MCP_FS_SECURITY_LEVEL = 'permissive';

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.warnings).toContain('Permissive security level reduces security protections');
    });

    test('should generate warnings for enhanced tools in strict mode', () => {
      process.env.MCP_FS_ENABLE_ENHANCED_TOOLS = 'true';
      process.env.MCP_FS_SECURITY_LEVEL = 'strict';

      configManager = ConfigurationManager.getInstance();
      const configWithMetadata = configManager.getConfigurationWithMetadata();

      expect(configWithMetadata.warnings).toContain('Enhanced tools may have limited functionality in strict security mode');
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      configManager = ConfigurationManager.getInstance();
    });

    test('should parse file sizes correctly', () => {
      expect(configManager.parseFileSize('1B')).toBe(1);
      expect(configManager.parseFileSize('1KB')).toBe(1024);
      expect(configManager.parseFileSize('1MB')).toBe(1024 * 1024);
      expect(configManager.parseFileSize('1GB')).toBe(1024 * 1024 * 1024);
      expect(configManager.parseFileSize('1TB')).toBe(1024 * 1024 * 1024 * 1024);
      expect(configManager.parseFileSize('1.5MB')).toBe(Math.floor(1.5 * 1024 * 1024));
    });

    test('should throw error for invalid file size format', () => {
      expect(() => configManager.parseFileSize('invalid')).toThrow('Invalid file size format: invalid');
    });

    test('should check extension allowance correctly', () => {
      // Default allows all extensions
      expect(configManager.isExtensionAllowed('.txt')).toBe(true);
      expect(configManager.isExtensionAllowed('.exe')).toBe(true);
    });

    test('should respect blocked extensions', () => {
      // Clear singleton and set blocked extensions
      (ConfigurationManager as any).instance = undefined;
      process.env.MCP_FS_BLOCKED_EXTENSIONS = '.exe,.bat';
      
      configManager = ConfigurationManager.getInstance();
      
      expect(configManager.isExtensionAllowed('.txt')).toBe(true);
      expect(configManager.isExtensionAllowed('.exe')).toBe(false);
      expect(configManager.isExtensionAllowed('.bat')).toBe(false);
    });

    test('should respect allowed extensions when not wildcard', () => {
      // Clear singleton and set specific allowed extensions
      (ConfigurationManager as any).instance = undefined;
      process.env.MCP_FS_ALLOWED_EXTENSIONS = '.txt,.md';
      
      configManager = ConfigurationManager.getInstance();
      
      expect(configManager.isExtensionAllowed('.txt')).toBe(true);
      expect(configManager.isExtensionAllowed('.md')).toBe(true);
      expect(configManager.isExtensionAllowed('.exe')).toBe(false);
    });

    test('should get max file size in bytes', () => {
      expect(configManager.getMaxFileSizeBytes()).toBe(10 * 1024 * 1024); // 10MB default
    });

    test('should get allowed directories', () => {
      const directories = configManager.getAllowedDirectories();
      expect(directories).toEqual(['/Users/test/Documents', '/Users/test/Desktop']);
    });
  });

  describe('Configuration Reloading', () => {
    test('should reload configuration when requested', () => {
      configManager = ConfigurationManager.getInstance();
      const initialConfig = configManager.getConfiguration();
      
      // Change environment
      process.env.MCP_FS_SECURITY_LEVEL = 'permissive';
      
      // Reload configuration
      const reloadedConfigWithMetadata = configManager.reloadConfiguration();
      const reloadedConfig = configManager.getConfiguration();
      
      expect(initialConfig.securityLevel).toBe(SecurityLevel.STRICT);
      expect(reloadedConfig.securityLevel).toBe(SecurityLevel.PERMISSIVE);
      expect(reloadedConfigWithMetadata.config.securityLevel).toBe(SecurityLevel.PERMISSIVE);
    });
  });
});