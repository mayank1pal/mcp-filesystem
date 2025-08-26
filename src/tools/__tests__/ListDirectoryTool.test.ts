/**
 * ListDirectoryTool Tests
 * Comprehensive tests for MCP-compliant directory listing functionality
 */

import * as fs from 'fs';
import { ListDirectoryTool } from '../ListDirectoryTool';
import { PathValidator } from '../../security/PathValidator';
import { McpResourceContent } from '../../types/index';

// Mock fs module
jest.mock('fs', () => ({
  constants: {
    F_OK: 4
  },
  promises: {
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn()
  }
}));

const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;

describe('ListDirectoryTool', () => {
  let listDirectoryTool: ListDirectoryTool;
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

    listDirectoryTool = new ListDirectoryTool(mockPathValidator);
  });

  describe('Tool Properties', () => {
    test('should have correct tool name and description', () => {
      expect(listDirectoryTool.name).toBe('list_directory');
      expect(listDirectoryTool.description).toBe('List the contents of a directory with file type indicators and metadata');
    });

    test('should have valid input schema', () => {
      const result = listDirectoryTool.inputSchema.safeParse({ 
        path: '/test/directory' 
      });
      expect(result.success).toBe(true);
      
      const invalidResult = listDirectoryTool.inputSchema.safeParse({ path: '' });
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

      const result = await listDirectoryTool.handler({ 
        path: '../../../etc' 
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

      const result = await listDirectoryTool.handler({ 
        path: '' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Invalid path format');
      expect((result[0] as any).text).toContain('Ensure the path is valid');
    });
  });

  describe('Directory Existence and Type Checking', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
    });

    test('should handle non-existent directories', async () => {
      mockFsPromises.access.mockRejectedValue(new Error('ENOENT'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/nonexistent' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Directory not found');
      expect((result[0] as any).text).toContain('Verify the directory exists');
    });

    test('should handle files instead of directories', async () => {
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
        size: 1000,
        mtime: new Date()
      } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/file.txt' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Path is not a directory');
      expect((result[0] as any).text).toContain('Ensure the path is valid');
    });
  });

  describe('Directory Listing', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date('2024-01-01T12:00:00Z')
        } as fs.Stats);
    });

    test('should list directory contents successfully', async () => {
      mockFsPromises.readdir.mockResolvedValue(['file1.txt', 'file2.js', 'subdir'] as any);
      
      // Mock stats for each item
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date('2024-01-01T10:00:00Z'),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2048,
          mtime: new Date('2024-01-01T11:00:00Z'),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
          size: 0,
          mtime: new Date('2024-01-01T09:00:00Z'),
          mode: 0o755
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Directory listing for: Documents');
      expect((result[0] as any).text).toContain('Total items: 3 (2 files, 1 directories)');
      expect((result[0] as any).text).toContain('file1.txt');
      expect((result[0] as any).text).toContain('file2.js');
      expect((result[0] as any).text).toContain('subdir');
      
      expect(result[1].type).toBe('resource');
      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.totalItems).toBe(3);
      expect(resourceData.totalFiles).toBe(2);
      expect(resourceData.totalDirectories).toBe(1);
      expect(resourceData.entries).toHaveLength(3);
    });

    test('should handle empty directories', async () => {
      mockFsPromises.readdir.mockResolvedValue([] as any);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/empty' 
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Total items: 0');
      expect((result[0] as any).text).toContain('Directory is empty');
    });

    test('should filter hidden files when showHidden is false', async () => {
      mockFsPromises.readdir.mockResolvedValue(['file1.txt', '.hidden', 'visible.js'] as any);
      
      // Mock stats for visible files only (hidden file won't be processed)
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2048,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents',
        showHidden: false
      });

      expect(result).toHaveLength(2);
      expect((result[0] as any).text).toContain('Total items: 2');
      expect((result[0] as any).text).toContain('file1.txt');
      expect((result[0] as any).text).toContain('visible.js');
      expect((result[0] as any).text).not.toContain('.hidden');
    });

    test('should include hidden files when showHidden is true', async () => {
      mockFsPromises.readdir.mockResolvedValue(['file1.txt', '.hidden', 'visible.js'] as any);
      
      // Mock stats for all files
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 512,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2048,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents',
        showHidden: true
      });

      expect(result).toHaveLength(2);
      expect((result[0] as any).text).toContain('Total items: 3');
      expect((result[0] as any).text).toContain('file1.txt');
      expect((result[0] as any).text).toContain('.hidden (hidden)');
      expect((result[0] as any).text).toContain('visible.js');
    });
  });

  describe('Sorting', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date('2024-01-01T12:00:00Z')
        } as fs.Stats);
      mockFsPromises.readdir.mockResolvedValue(['zebra.txt', 'alpha.txt', 'beta.txt'] as any);
    });

    test('should sort by name ascending by default', async () => {
      // Mock stats for files
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 3000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.entries[0].name).toBe('alpha.txt');
      expect(resourceData.entries[1].name).toBe('beta.txt');
      expect(resourceData.entries[2].name).toBe('zebra.txt');
    });

    test('should sort by size when specified', async () => {
      // Mock stats with different sizes
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 3000, // zebra.txt - largest
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1000, // alpha.txt - smallest
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2000, // beta.txt - medium
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents',
        sortBy: 'size'
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.entries[0].name).toBe('alpha.txt'); // smallest
      expect(resourceData.entries[1].name).toBe('beta.txt');  // medium
      expect(resourceData.entries[2].name).toBe('zebra.txt'); // largest
    });

    test('should sort in descending order when specified', async () => {
      // Mock stats for files
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 2000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 3000,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents',
        sortBy: 'name',
        sortOrder: 'desc'
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.entries[0].name).toBe('zebra.txt');
      expect(resourceData.entries[1].name).toBe('beta.txt');
      expect(resourceData.entries[2].name).toBe('alpha.txt');
    });
  });

  describe('File Type Detection', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date()
        } as fs.Stats);
    });

    test('should detect different file types correctly', async () => {
      mockFsPromises.readdir.mockResolvedValue(['file.txt', 'directory', 'symlink'] as any);
      
      // Mock stats for different types
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
          size: 0,
          mtime: new Date(),
          mode: 0o755
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => false,
          isSymbolicLink: () => true,
          size: 0,
          mtime: new Date(),
          mode: 0o777
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      // Entries are sorted by name: directory, file.txt, symlink
      expect(resourceData.entries.find((e: any) => e.name === 'file.txt')?.type).toBe('file');
      expect(resourceData.entries.find((e: any) => e.name === 'directory')?.type).toBe('directory');
      expect(resourceData.entries.find((e: any) => e.name === 'symlink')?.type).toBe('symlink');
      
      // Check text output contains type icons
      expect((result[0] as any).text).toContain('📄'); // file icon
      expect((result[0] as any).text).toContain('📁'); // directory icon
      expect((result[0] as any).text).toContain('🔗'); // symlink icon
    });

    test('should detect MIME types for files', async () => {
      mockFsPromises.readdir.mockResolvedValue(['script.js', 'data.json', 'image.png'] as any);
      
      // Mock stats for files
      for (let i = 0; i < 3; i++) {
        mockFsPromises.stat.mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);
      }

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.entries.find((e: any) => e.name === 'script.js')?.mimeType).toBe('text/javascript');
      expect(resourceData.entries.find((e: any) => e.name === 'data.json')?.mimeType).toBe('application/json');
      expect(resourceData.entries.find((e: any) => e.name === 'image.png')?.mimeType).toBe('image/png');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 0,
        mtime: new Date()
      } as fs.Stats);
    });

    test('should handle permission denied errors', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('EACCES: permission denied'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/restricted' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Permission denied');
      expect((result[0] as any).text).toContain('Check directory permissions');
    });

    test('should handle directory not found errors', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/missing' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Directory does not exist');
      expect((result[0] as any).text).toContain('Verify the directory exists');
    });

    test('should handle too many files errors', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('EMFILE: too many open files'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Too many open files');
      expect((result[0] as any).text).toContain('Check system resources');
    });

    test('should handle unknown errors', async () => {
      mockFsPromises.readdir.mockRejectedValue(new Error('Unknown filesystem error'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Unknown filesystem error');
      expect((result[0] as any).text).toContain('Check system resources');
    });

    test('should handle individual file stat errors gracefully', async () => {
      mockFsPromises.readdir.mockResolvedValue(['good-file.txt', 'bad-file.txt'] as any);
      
      // Mock directory stat first, then individual file stats
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date()
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats)
        .mockRejectedValueOnce(new Error('EACCES: permission denied'));

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      expect(result).toHaveLength(2);
      expect((result[0] as any).text).toContain('Total items: 2');
      
      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.entries).toHaveLength(2);
      // Entries are sorted by name: bad-file.txt, good-file.txt
      expect(resourceData.entries.find((e: any) => e.name === 'good-file.txt')?.type).toBe('file');
      expect(resourceData.entries.find((e: any) => e.name === 'bad-file.txt')?.type).toBe('other'); // Fallback type
    });
  });

  describe('Size Formatting', () => {
    test('should format file sizes correctly', async () => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date()
        } as fs.Stats);
      
      const testSizes = [512, 1024, 1536, 1048576, 1073741824];
      const expectedFormats = ['512 B', '1.0 KB', '1.5 KB', '1.0 MB', '1.0 GB'];
      
      mockFsPromises.readdir.mockResolvedValue(['file1', 'file2', 'file3', 'file4', 'file5'] as any);
      
      // Mock stats with different sizes
      testSizes.forEach(size => {
        mockFsPromises.stat.mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: size,
          mtime: new Date(),
          mode: 0o644
        } as fs.Stats);
      });

      const result = await listDirectoryTool.handler({ 
        path: 'Documents' 
      });

      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expectedFormats.forEach((expectedFormat, index) => {
        expect(resourceData.entries[index].sizeFormatted).toBe(expectedFormat);
      });
    });
  });

  describe('Factory Method', () => {
    test('should create ListDirectoryTool with macOS PathValidator', () => {
      const tool = ListDirectoryTool.createForMacOS();
      
      expect(tool).toBeInstanceOf(ListDirectoryTool);
      expect(tool.name).toBe('list_directory');
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete successful directory listing workflow', async () => {
      mockPathValidator.validatePath.mockReturnValue({
        isValid: true,
        resolvedPath: '/Users/test/Documents/project'
      });
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isDirectory: () => true,
          size: 0,
          mtime: new Date('2024-01-01T12:00:00Z')
        } as fs.Stats);
      
      mockFsPromises.readdir.mockResolvedValue(['README.md', 'src', 'package.json', '.gitignore'] as any);
      
      // Mock stats for each item
      mockFsPromises.stat
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 1024,
          mtime: new Date('2024-01-01T10:00:00Z'),
          mode: 0o644
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
          size: 0,
          mtime: new Date('2024-01-01T11:00:00Z'),
          mode: 0o755
        } as fs.Stats)
        .mockResolvedValueOnce({
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: 512,
          mtime: new Date('2024-01-01T09:00:00Z'),
          mode: 0o644
        } as fs.Stats);

      const result = await listDirectoryTool.handler({ 
        path: 'Documents/project',
        showHidden: false
      });

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('text');
      expect((result[0] as any).text).toContain('Directory listing for: Documents/project');
      expect((result[0] as any).text).toContain('Total items: 3 (2 files, 1 directories)');
      expect((result[0] as any).text).toContain('Total size: 1.5 KB');
      expect((result[0] as any).text).toContain('README.md');
      expect((result[0] as any).text).toContain('src');
      expect((result[0] as any).text).toContain('package.json');
      expect((result[0] as any).text).not.toContain('.gitignore'); // Hidden file not shown
      
      expect(result[1].type).toBe('resource');
      expect((result[1] as McpResourceContent).resource.uri).toBe('file:///Users/test/Documents/project');
      expect((result[1] as McpResourceContent).resource.mimeType).toBe('application/json');
      
      const resourceData = JSON.parse((result[1] as McpResourceContent).resource.text!);
      expect(resourceData.path).toBe('Documents/project');
      expect(resourceData.totalItems).toBe(3);
      expect(resourceData.totalFiles).toBe(2);
      expect(resourceData.totalDirectories).toBe(1);
      expect(resourceData.entries).toHaveLength(3);
    });
  });
});