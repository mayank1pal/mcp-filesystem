/**
 * WriteFileTool Tests
 * Comprehensive tests for MCP-compliant file writing functionality
 */

import * as fs from 'fs';
import { WriteFileTool } from '../WriteFileTool';
import { PathValidator } from '../../security/PathValidator';
import { McpResourceContent } from '../../types/index';

// Mock fs module
jest.mock('fs', () => ({
  constants: {
    F_OK: 4
  },
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn()
  }
}));

const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;

describe('WriteFileTool', () => {
  let writeFileTool: WriteFileTool;
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

    writeFileTool = new WriteFileTool(mockPathValidator);
  });

  describe('Tool Properties', () => {
    test('should have correct tool name and description', () => {
      expect(writeFileTool.name).toBe('write_file');
      expect(writeFileTool.description).toBe('Write content to a file in the filesystem');
    });

    test('should have valid input schema', () => {
      const result = writeFileTool.inputSchema.safeParse({ 
        path: '/test/file.txt', 
        content: 'test content' 
      });
      expect(result.success).toBe(true);
      
      const invalidResult = writeFileTool.inputSchema.safeParse({ path: '' });
      expect(invalidResult.success).toBe(false);
    });
  });

  describe('Path Validation', () => {
    test('should reject invalid paths', async () => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: false,
        resolvedPath: '',
        error: 'Path traversal detected',
        securityViolation: true
      });

      const result = await writeFileTool.handler({ 
        path: '../../../etc/passwd', 
        content: 'malicious content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Path traversal detected');
      expect((result[0] as any).text).toContain('Use paths within allowed directories');
    });

    test('should handle validation errors without security violations', async () => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: false,
        resolvedPath: '',
        error: 'Invalid path format',
        securityViolation: false
      });

      const result = await writeFileTool.handler({ 
        path: '', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Invalid path format');
      expect((result[0] as any).text).toContain('Check file path format');
    });
  });

  describe('Content Validation', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
    });

    test('should reject content that exceeds size limit', async () => {
      const largeContent = 'x'.repeat(20 * 1024 * 1024); // 20MB
      
      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: largeContent 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Content size exceeds maximum');
      expect((result[0] as any).text).toContain('Verify content size is within limits');
    });

    test('should reject unsupported encoding', async () => {
      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: 'test content',
        encoding: 'unsupported-encoding'
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Unsupported encoding');
      expect((result[0] as any).text).toContain('utf8, utf-8, ascii');
    });

    test('should accept supported encodings', async () => {
      const supportedEncodings = ['utf8', 'ascii', 'latin1', 'base64', 'hex'];
      
      for (const encoding of supportedEncodings) {
        mockFsPromises.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist
        mockFsPromises.writeFile.mockResolvedValue(undefined);
        mockFsPromises.stat.mockResolvedValue({
          size: 100,
          mtime: new Date()
        } as fs.Stats);

        const result = await writeFileTool.handler({ 
          path: 'Documents/file.txt', 
          content: 'test content',
          encoding: encoding
        });

        expect(result).toHaveLength(2);
        expect(result[0].type).toBe('text');
        expect((result[0] as any).text).toContain('File created successfully');
      }
    });
  });

  describe('File Writing', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
    });

    test('should create new file successfully', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 100,
        mtime: new Date('2024-01-01T12:00:00Z')
      } as fs.Stats);

      const result = await writeFileTool.handler({ 
        path: 'Documents/newfile.txt', 
        content: 'Hello, world!' 
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('File created successfully');
      expect(result[1].type).toBe('resource');
      expect((result[1] as McpResourceContent).resource.uri).toBe('file:///Users/test/Documents/file.txt');
      expect((result[1] as McpResourceContent).resource.text).toContain('Operation: created');
      
      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/Users/test/Documents/file.txt',
        'Hello, world!\n', // Content should be sanitized with newline
        { encoding: 'utf8' }
      );
    });

    test('should update existing file successfully', async () => {
      mockFsPromises.access.mockResolvedValue(undefined); // File exists
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 150,
        mtime: new Date('2024-01-01T12:00:00Z')
      } as fs.Stats);

      const result = await writeFileTool.handler({ 
        path: 'Documents/existing.txt', 
        content: 'Updated content',
        overwrite: true
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('File updated successfully');
      expect((result[1] as McpResourceContent).resource.text).toContain('Operation: updated');
    });

    test('should reject overwriting when overwrite is disabled', async () => {
      mockFsPromises.access.mockResolvedValue(undefined); // File exists

      const result = await writeFileTool.handler({ 
        path: 'Documents/existing.txt', 
        content: 'New content',
        overwrite: false
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('File already exists and overwrite is disabled');
      expect(mockFsPromises.writeFile).not.toHaveBeenCalled();
    });

    test('should create directories when createDirectories is enabled', async () => {
      // Update mock to return the correct resolved path for subdirectory
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/subdir/newfile.txt'
      });
      
      mockFsPromises.access
        .mockRejectedValueOnce(new Error('ENOENT')) // File doesn't exist
        .mockRejectedValueOnce(new Error('ENOENT')); // Directory doesn't exist
      mockFsPromises.mkdir.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 100,
        mtime: new Date()
      } as fs.Stats);

      const result = await writeFileTool.handler({ 
        path: 'Documents/subdir/newfile.txt', 
        content: 'test content',
        createDirectories: true
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('File created successfully');
      expect(mockFsPromises.mkdir).toHaveBeenCalledWith(
        '/Users/test/Documents/subdir',
        { recursive: true }
      );
    });
  });

  describe('Content Sanitization', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 100,
        mtime: new Date()
      } as fs.Stats);
    });

    test('should remove null bytes from content', async () => {
      const contentWithNulls = 'Hello\0World\0Test';
      
      await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: contentWithNulls 
      });

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/Users/test/Documents/file.txt',
        'HelloWorldTest\n',
        { encoding: 'utf8' }
      );
    });

    test('should normalize line endings', async () => {
      const contentWithMixedLineEndings = 'Line 1\r\nLine 2\rLine 3\nLine 4';
      
      await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: contentWithMixedLineEndings 
      });

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/Users/test/Documents/file.txt',
        'Line 1\nLine 2\nLine 3\nLine 4\n',
        { encoding: 'utf8' }
      );
    });

    test('should add trailing newline if missing', async () => {
      const contentWithoutNewline = 'Content without newline';
      
      await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: contentWithoutNewline 
      });

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/Users/test/Documents/file.txt',
        'Content without newline\n',
        { encoding: 'utf8' }
      );
    });

    test('should not add extra newline if already present', async () => {
      const contentWithNewline = 'Content with newline\n';
      
      await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: contentWithNewline 
      });

      expect(mockFsPromises.writeFile).toHaveBeenCalledWith(
        '/Users/test/Documents/file.txt',
        'Content with newline\n',
        { encoding: 'utf8' }
      );
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));
    });

    test('should handle permission denied errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/restricted.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Permission denied');
      expect((result[0] as any).text).toContain('Check file and directory permissions');
    });

    test('should handle directory not found errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/nonexistent/file.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Directory does not exist');
      expect((result[0] as any).text).toContain('Verify the target directory exists');
    });

    test('should handle no space left errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('No space left on device');
      expect((result[0] as any).text).toContain('Check available disk space');
    });

    test('should handle target is directory errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('EISDIR: illegal operation on a directory'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/somedir', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Target is a directory, not a file');
      expect((result[0] as any).text).toContain('Ensure the path is valid');
    });

    test('should handle too many files errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('EMFILE: too many open files'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Too many open files');
      expect((result[0] as any).text).toContain('Check system resources');
    });

    test('should handle unknown errors', async () => {
      mockFsPromises.writeFile.mockRejectedValue(new Error('Unknown filesystem error'));

      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Unknown filesystem error');
      expect((result[0] as any).text).toContain('Check system resources');
    });

    test('should handle non-Error exceptions', async () => {
      mockFsPromises.writeFile.mockRejectedValue('String error');

      const result = await writeFileTool.handler({ 
        path: 'Documents/file.txt', 
        content: 'test content' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Unknown error occurred');
      expect((result[0] as any).text).toContain('Check system resources');
    });
  });

  describe('MIME Type Detection', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 100,
        mtime: new Date()
      } as fs.Stats);
    });

    test('should detect correct MIME types for different file extensions', async () => {
      const testCases = [
        { path: 'Documents/data.json', expectedMime: 'application/json' },
        { path: 'Documents/readme.md', expectedMime: 'text/markdown' },
        { path: 'Documents/document.txt', expectedMime: 'text/plain' },
        { path: 'Documents/config.xml', expectedMime: 'text/xml' },
        { path: 'Documents/data.csv', expectedMime: 'text/csv' },
        { path: 'Documents/unknown.xyz', expectedMime: 'text/plain' }
      ];

      for (const testCase of testCases) {
        mockPathValidator.validatePath.mockReturnValue({
          isValid: true,
          resolvedPath: `/Users/test/${testCase.path}`
        });

        const result = await writeFileTool.handler({ 
          path: testCase.path, 
          content: 'test content' 
        });

        expect(result).toHaveLength(2);
        expect(result[1].type).toBe('resource');
        expect((result[1] as McpResourceContent).resource.mimeType).toBe(testCase.expectedMime);
      }
    });
  });

  describe('Size Formatting', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/file.txt'
      });
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));
      mockFsPromises.writeFile.mockResolvedValue(undefined);
    });

    test('should format file sizes correctly', async () => {
      const testCases = [
        { size: 512, expected: '512 B' },
        { size: 1024, expected: '1.0 KB' },
        { size: 1536, expected: '1.5 KB' },
        { size: 1048576, expected: '1.0 MB' },
        { size: 1073741824, expected: '1.0 GB' }
      ];

      for (const testCase of testCases) {
        mockFsPromises.stat.mockResolvedValue({
          size: testCase.size,
          mtime: new Date()
        } as fs.Stats);

        const result = await writeFileTool.handler({ 
          path: 'Documents/file.txt', 
          content: 'test content' 
        });

        expect(result).toHaveLength(2);
        expect((result[0] as any).text).toContain(testCase.expected);
      }
    });
  });

  describe('Factory Method', () => {
    test('should create WriteFileTool with macOS PathValidator', () => {
      const tool = WriteFileTool.createForMacOS();
      
      expect(tool).toBeInstanceOf(WriteFileTool);
      expect(tool.name).toBe('write_file');
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete successful file write workflow', async () => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/example.txt'
      });
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT')); // File doesn't exist
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        size: 50,
        mtime: new Date('2024-01-01T12:00:00Z')
      } as fs.Stats);

      const fileContent = 'This is an example file.\nWith multiple lines.';
      
      const result = await writeFileTool.handler({ 
        path: 'Documents/example.txt', 
        content: fileContent 
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('File created successfully');
      expect((result[0] as any).text).toContain('Size: 50 B');
      expect(result[1].type).toBe('resource');
      expect((result[1] as McpResourceContent).resource.uri).toBe('file:///Users/test/Documents/example.txt');
      expect((result[1] as McpResourceContent).resource.mimeType).toBe('text/plain');
      expect((result[1] as McpResourceContent).resource.text).toContain('File: example.txt');
      expect((result[1] as McpResourceContent).resource.text).toContain('Operation: created');
      expect((result[1] as McpResourceContent).resource.text).toContain('Modified: 2024-01-01T12:00:00.000Z');
    });
  });
});