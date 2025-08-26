/**
 * File Validator Tests
 */

import { FileValidator, FileCategory } from '../FileValidator';
import { ConfigurationManager } from '../../config/ConfigurationManager';
import { SecurityLevel } from '../../config/types';

// Mock ConfigurationManager
jest.mock('../../config/ConfigurationManager');

describe('FileValidator', () => {
  let fileValidator: FileValidator;
  let mockConfigManager: jest.Mocked<ConfigurationManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockConfigManager = {
      getConfiguration: jest.fn(),
      getMaxFileSizeBytes: jest.fn(),
      isExtensionAllowed: jest.fn()
    } as any;

    mockConfigManager.getConfiguration.mockReturnValue({
      allowedDirectories: ['/test'],
      securityLevel: SecurityLevel.STRICT,
      maxFileSize: '10MB',
      allowedExtensions: ['*'],
      blockedExtensions: [],
      allowedMimeTypes: [],
      blockedMimeTypes: [],
      allowedFileCategories: [],
      blockedFileCategories: [],
      enableContentValidation: false,
      blockDangerousFiles: true,
      logLevel: 'info' as any,
      logDestination: 'console' as any,
      enableEnhancedTools: false,
      enableBatchOperations: false,
      enableSymlinkFollowing: false,
      maxConcurrentOperations: 5,
      operationTimeout: 30000,
      enableCaching: true,
      cacheTimeout: 60000
    });
    
    mockConfigManager.getMaxFileSizeBytes.mockReturnValue(10 * 1024 * 1024);
    mockConfigManager.isExtensionAllowed.mockReturnValue(true);

    fileValidator = new FileValidator(mockConfigManager);
  });

  describe('MIME Type Detection', () => {
    test('should detect common MIME types correctly', () => {
      expect(fileValidator.getMimeType('.txt')).toBe('text/plain');
      expect(fileValidator.getMimeType('.json')).toBe('application/json');
      expect(fileValidator.getMimeType('.js')).toBe('application/javascript');
      expect(fileValidator.getMimeType('.png')).toBe('image/png');
      expect(fileValidator.getMimeType('.pdf')).toBe('application/pdf');
      expect(fileValidator.getMimeType('.exe')).toBe('application/x-msdownload');
    });

    test('should return default MIME type for unknown extensions', () => {
      expect(fileValidator.getMimeType('.unknown')).toBe('application/octet-stream');
      expect(fileValidator.getMimeType('')).toBe('application/octet-stream');
    });
  });

  describe('File Category Detection', () => {
    test('should categorize files correctly', () => {
      expect(fileValidator.getFileCategory('.txt')).toBe(FileCategory.TEXT);
      expect(fileValidator.getFileCategory('.js')).toBe(FileCategory.CODE);
      expect(fileValidator.getFileCategory('.png')).toBe(FileCategory.IMAGE);
      expect(fileValidator.getFileCategory('.exe')).toBe(FileCategory.EXECUTABLE);
      expect(fileValidator.getFileCategory('.zip')).toBe(FileCategory.ARCHIVE);
    });
  });

  describe('Dangerous Extension Detection', () => {
    test('should identify dangerous extensions', () => {
      expect(fileValidator.isDangerousExtension('.exe')).toBe(true);
      expect(fileValidator.isDangerousExtension('.bat')).toBe(true);
      expect(fileValidator.isDangerousExtension('.ps1')).toBe(true);
    });

    test('should not flag safe extensions as dangerous', () => {
      expect(fileValidator.isDangerousExtension('.txt')).toBe(false);
      expect(fileValidator.isDangerousExtension('.json')).toBe(false);
      expect(fileValidator.isDangerousExtension('.png')).toBe(false);
    });
  });

  describe('File Validation', () => {
    test('should validate safe files successfully', () => {
      const result = fileValidator.validateFile('/test/file.txt');
      
      expect(result.isValid).toBe(true);
      expect(result.fileInfo?.extension).toBe('.txt');
      expect(result.fileInfo?.mimeType).toBe('text/plain');
      expect(result.fileInfo?.category).toBe(FileCategory.TEXT);
    });

    test('should block dangerous extensions in strict mode', () => {
      const result = fileValidator.validateFile('/test/script.exe');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Dangerous file extension blocked in strict mode: .exe');
    });
  });
});