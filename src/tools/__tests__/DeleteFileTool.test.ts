/**
 * DeleteFileTool Tests
 * Comprehensive tests for MCP-compliant file deletion functionality
 */

import * as fs from 'fs';
import { DeleteFileTool, ConfirmationStrategy } from '../DeleteFileTool';
import { PathValidator } from '../../security/PathValidator';
import { McpResourceContent } from '../../types/index';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  lstatSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
  rmdirSync: jest.fn(),
  readdirSync: jest.fn(),
  mkdirSync: jest.fn(),
  copyFileSync: jest.fn(),
  utimesSync: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('DeleteFileTool', () => {
  let deleteFileTool: DeleteFileTool;
  let mockPathValidator: jest.Mocked<PathValidator>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock PathValidator
    mockPathValidator = {
      validatePath: jest.fn(),
      getSecurityEvents: jest.fn(),
      clearSecurityEvents: jest.fn(),
      getAllowedPrefixes: jest.fn()
    } as any;

    deleteFileTool = new DeleteFileTool(mockPathValidator);
  });

  describe('Tool Properties', () => {
    test('should have correct tool name and description', () => {
      expect(deleteFileTool.name).toBe('delete_file');
      expect(deleteFileTool.description).toContain('Delete files or directories');
    });

    test('should have valid input schema', () => {
      const result = deleteFileTool.inputSchema.safeParse({ 
        path: '/test/file.txt' 
      });
      expect(result.success).toBe(true);
      
      const invalidResult = deleteFileTool.inputSchema.safeParse({ path: '' });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('Path Validation', () => {
    test('should reject invalid paths', async () => {
      mockPathValidator.validatePath.mockReturnValueOnce({
        isValid: false,
        resolvedPath: '',
        error: 'Invalid path',
        securityViolation: true
      });

      const result = await deleteFileTool.handler({ 
        path: '../../../etc/passwd'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Invalid path');
    });

    test('should handle multiple paths with one invalid', async () => {
      mockPathValidator.validatePath
        .mockReturnValueOnce({
          isValid: true,
          resolvedPath: '/Users/test/Documents/file1.txt'
        })
        .mockReturnValueOnce({
          isValid: false,
          resolvedPath: '',
          error: 'Invalid path',
          securityViolation: true
        });

      const result = await deleteFileTool.handler({ 
        path: ['/test/file1.txt', '../../../etc/passwd']
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Invalid path');
    });
  });

  describe('File Deletion', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));
    });

    test('should delete a single file successfully', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-01-01T12:00:00Z'),
        atime: new Date('2024-01-01T12:00:00Z'),
        birthtime: new Date('2024-01-01T10:00:00Z'),
        mode: 0o644
      } as fs.Stats);

      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Delete operation completed');
      expect((result[0] as any).text).toContain('Items deleted: 1');
      
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/Users/test/Documents/test.txt');
    });

    test('should handle non-existent file', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await deleteFileTool.handler({ 
        path: 'nonexistent.txt'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Path does not exist');
    });

    test('should handle directory without recursive option', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o755
      } as fs.Stats);

      const result = await deleteFileTool.handler({ 
        path: 'test_dir'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Use recursive option to delete directories');
    });
  });

  describe('Directory Deletion', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));
    });

    test('should delete directory recursively', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o755
      } as fs.Stats);
      mockFs.readdirSync.mockReturnValue([] as any); // Empty directory to avoid recursion issues

      const result = await deleteFileTool.handler({ 
        path: 'test_dir',
        recursive: true,
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Delete operation completed');
      expect((result[0] as any).text).toContain('Items deleted: 1');
      
      expect(mockFs.rmdirSync).toHaveBeenCalledWith('/Users/test/Documents/test_dir');
    });

    test('should delete multiple files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);

      const result = await deleteFileTool.handler({ 
        path: ['file1.txt', 'file2.txt'],
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Items deleted: 2');
      
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('Confirmation Strategies', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);
    });

    test('should require confirmation with PROMPT strategy', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        confirmationStrategy: ConfirmationStrategy.PROMPT
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Confirmation required');
      expect((result[0] as any).text).toContain("Use 'force: true'");
    });

    test('should proceed with PROMPT strategy when force is true', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        confirmationStrategy: ConfirmationStrategy.PROMPT,
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Delete operation completed');
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    test('should work without confirmation with NONE strategy', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        confirmationStrategy: ConfirmationStrategy.NONE
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Delete operation completed');
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    test('should run in dry-run mode with DRY_RUN strategy', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        confirmationStrategy: ConfirmationStrategy.DRY_RUN
      });

      expect(result).toHaveLength(3); // Summary + Resource + Warnings
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Delete operation (DRY RUN) completed');
      expect((result[0] as any).text).toContain('Warnings: 1');
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });

    test('should apply safety checks with SAFE_MODE strategy', async () => {
      // Test large file size check
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 200 * 1024 * 1024, // 200MB
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);

      const result = await deleteFileTool.handler({ 
        path: 'large_file.txt',
        confirmationStrategy: ConfirmationStrategy.SAFE_MODE
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Large deletion');
      expect((result[0] as any).text).toContain("requires 'force: true'");
    });
  });

  describe('Backup Creation', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));

      mockFs.existsSync.mockImplementation((path) => {
        // Backup directory doesn't exist initially
        if (String(path).includes('.backups')) return false;
        return true; // File exists
      });
      
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-01-01T12:00:00Z'),
        atime: new Date('2024-01-01T12:00:00Z'),
        birthtime: new Date('2024-01-01T10:00:00Z'),
        mode: 0o644
      } as fs.Stats);
    });

    test('should create backup when requested', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        createBackup: true,
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Backups created: 1');
      
      expect(mockFs.mkdirSync).toHaveBeenCalled(); // Backup directory creation
      expect(mockFs.copyFileSync).toHaveBeenCalled(); // File backup
      expect(mockFs.unlinkSync).toHaveBeenCalled(); // Original file deletion
    });

    test('should use custom backup directory', async () => {
      // Mock the backup directory to not exist initially
      mockFs.existsSync.mockImplementation((path) => {
        if (String(path).includes('/custom/backup/path')) return false;
        return true; // File exists
      });

      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        createBackup: true,
        backupDirectory: '/custom/backup/path',
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Backups created: 1');
      
      expect(mockFs.mkdirSync).toHaveBeenCalledWith('/custom/backup/path', { recursive: true });
    });
  });

  describe('Dry Run Mode', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);
    });

    test('should simulate deletion in dry run mode', async () => {
      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        dryRun: true,
        force: true // Need force to bypass confirmation
      });

      expect(result).toHaveLength(3); // Summary + Resource + Warnings (no recovery info in dry run)
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('(DRY RUN)');
      expect((result[0] as any).text).toContain('Items would be deleted: 1');
      
      expect(mockFs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));
    });

    test('should handle permission denied errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        force: true
      });

      expect(result).toHaveLength(4); // Summary + Resource + Errors + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Errors: 1');
      expect(result[2].type).toBe('text');
      expect((result[2] as any).text).toContain('EACCES: permission denied');
    });

    test('should handle file not found errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o644
      } as fs.Stats);
      mockFs.unlinkSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });

      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        force: true
      });

      expect(result).toHaveLength(4); // Summary + Resource + Errors + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Errors: 1');
      expect(result[2].type).toBe('text');
      expect((result[2] as any).text).toContain('ENOENT: no such file or directory');
    });

    test('should handle directory not empty errors', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => true,
        isSymbolicLink: () => false,
        size: 0,
        mtime: new Date(),
        atime: new Date(),
        birthtime: new Date(),
        mode: 0o755
      } as fs.Stats);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.rmdirSync.mockImplementation(() => {
        throw new Error('ENOTEMPTY: directory not empty');
      });

      const result = await deleteFileTool.handler({ 
        path: 'test_dir',
        recursive: true,
        force: true
      });

      expect(result).toHaveLength(4); // Summary + Resource + Errors + Recovery info
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Errors: 1');
      expect(result[2].type).toBe('text');
      expect((result[2] as any).text).toContain('ENOTEMPTY: directory not empty');
    });
  });

  describe('Result Format', () => {
    test('should return proper MCP content format', async () => {
      mockPathValidator.validatePath.mockImplementation((path) => ({
        isValid: true,
        resolvedPath: `/Users/test/Documents/${path.replace(/^.*\//, '')}`
      }));

      mockFs.existsSync.mockReturnValue(true);
      mockFs.lstatSync.mockReturnValue({
        isDirectory: () => false,
        isSymbolicLink: () => false,
        size: 1024,
        mtime: new Date('2024-01-01T12:00:00Z'),
        atime: new Date('2024-01-01T12:00:00Z'),
        birthtime: new Date('2024-01-01T10:00:00Z'),
        mode: 0o644
      } as fs.Stats);

      // Mock successful deletion instead of error
      mockFs.unlinkSync.mockImplementation(() => {
        // Don't throw error for successful test
      });

      const result = await deleteFileTool.handler({ 
        path: 'test.txt',
        force: true
      });

      expect(result).toHaveLength(3); // Summary + Resource + Recovery info (no errors)
      expect(result[0].type).toBe('text');
      expect(result[1].type).toBe('resource');
      expect(result[2].type).toBe('text'); // Recovery info
      
      const resourceContent = result[1] as McpResourceContent;
      expect(resourceContent.resource.mimeType).toBe('application/json');
      expect(resourceContent.resource.uri).toMatch(/^delete-result:\/\//);
      
      const resultData = JSON.parse(resourceContent.resource.text || '{}');
      expect(resultData.operation).toBe('delete');
      expect(resultData.itemsDeleted).toBe(1);
      expect(resultData.recoveryInfo).toHaveLength(1);
    });
  });

  describe('Factory Methods', () => {
    test('should create DeleteFileTool with PathValidator', () => {
      const pathValidator = {} as PathValidator;
      const tool = DeleteFileTool.createWithPathValidator(pathValidator);
      
      expect(tool).toBeInstanceOf(DeleteFileTool);
      expect(tool.name).toBe('delete_file');
    });

    test('should create DeleteFileTool with configuration-based PathValidator', () => {
      // Mock the static method
      const originalMethod = PathValidator.createFromConfiguration;
      PathValidator.createFromConfiguration = jest.fn().mockReturnValue({} as PathValidator);
      
      const tool = DeleteFileTool.createFromConfiguration();
      
      expect(tool).toBeInstanceOf(DeleteFileTool);
      expect(tool.name).toBe('delete_file');
      expect(PathValidator.createFromConfiguration).toHaveBeenCalled();
      
      // Restore the original method
      PathValidator.createFromConfiguration = originalMethod;
    });
  });
});