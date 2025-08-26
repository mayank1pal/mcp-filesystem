/**
 * Type Definition Tests
 * Tests for type validation and interface compliance
 */

import {
  McpTextContent,
  McpResourceContent,
  McpContent,
  McpError,
  McpServerConfig,
  FileSystemEntry,
  DirectoryListing,
  PathValidationResult,
  SecurityEvent,
  PermissionStatus,
  ReadFileArgs,
  WriteFileArgs,
  ListDirectoryArgs
} from '../index.js';

describe('MCP Types', () => {
  test('McpTextContent should have correct structure', () => {
    const textContent: McpTextContent = {
      type: 'text',
      text: 'Hello, world!'
    };

    expect(textContent.type).toBe('text');
    expect(textContent.text).toBe('Hello, world!');
  });

  test('McpResourceContent should have correct structure', () => {
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: 'file:///path/to/file.txt',
        mimeType: 'text/plain',
        text: 'File content'
      }
    };

    expect(resourceContent.type).toBe('resource');
    expect(resourceContent.resource.uri).toBe('file:///path/to/file.txt');
    expect(resourceContent.resource.mimeType).toBe('text/plain');
  });

  test('McpError should have correct structure', () => {
    const error: McpError = {
      code: 400,
      message: 'Invalid path',
      data: {
        type: 'security',
        details: 'Path traversal detected',
        recommendations: ['Use absolute paths within allowed directories'],
        securityContext: true
      }
    };

    expect(error.code).toBe(400);
    expect(error.data?.type).toBe('security');
    expect(error.data?.securityContext).toBe(true);
  });

  test('McpServerConfig should have correct structure', () => {
    const config: McpServerConfig = {
      name: 'mcp-filesystem-perplexity',
      version: '1.0.0',
      allowedDirectories: ['~/Documents', '~/Desktop'],
      transport: 'stdio'
    };

    expect(config.name).toBe('mcp-filesystem-perplexity');
    expect(config.allowedDirectories).toHaveLength(2);
    expect(config.transport).toBe('stdio');
  });
});

describe('Filesystem Types', () => {
  test('FileSystemEntry should have correct structure', () => {
    const entry: FileSystemEntry = {
      name: 'test.txt',
      path: '/Users/test/Documents/test.txt',
      type: 'file',
      size: 1024,
      modified: new Date('2024-01-01'),
      permissions: {
        readable: true,
        writable: true
      }
    };

    expect(entry.type).toBe('file');
    expect(entry.size).toBe(1024);
    expect(entry.permissions?.readable).toBe(true);
  });

  test('DirectoryListing should have correct structure', () => {
    const listing: DirectoryListing = {
      path: '/Users/test/Documents',
      entries: [
        {
          name: 'file1.txt',
          path: '/Users/test/Documents/file1.txt',
          type: 'file'
        },
        {
          name: 'subfolder',
          path: '/Users/test/Documents/subfolder',
          type: 'directory'
        }
      ],
      totalCount: 2
    };

    expect(listing.entries).toHaveLength(2);
    expect(listing.totalCount).toBe(2);
    expect(listing.entries[0].type).toBe('file');
    expect(listing.entries[1].type).toBe('directory');
  });
});

describe('Security Types', () => {
  test('PathValidationResult should have correct structure', () => {
    const validResult: PathValidationResult = {
      isValid: true,
      resolvedPath: '/Users/test/Documents/file.txt'
    };

    const invalidResult: PathValidationResult = {
      isValid: false,
      resolvedPath: '/Users/test/Documents/../../../etc/passwd',
      error: 'Path traversal detected',
      securityViolation: true
    };

    expect(validResult.isValid).toBe(true);
    expect(invalidResult.securityViolation).toBe(true);
  });

  test('SecurityEvent should have correct structure', () => {
    const event: SecurityEvent = {
      timestamp: new Date(),
      type: 'path_traversal',
      attemptedPath: '../../../etc/passwd',
      resolvedPath: '/etc/passwd',
      clientInfo: 'test-client'
    };

    expect(event.type).toBe('path_traversal');
    expect(event.attemptedPath).toBe('../../../etc/passwd');
  });

  test('PermissionStatus should have correct structure', () => {
    const status: PermissionStatus = {
      hasFullDiskAccess: false,
      canAccessDocuments: true,
      canAccessDesktop: true,
      recommendations: [
        'Enable Full Disk Access in System Preferences',
        'Restart the application after enabling permissions'
      ]
    };

    expect(status.hasFullDiskAccess).toBe(false);
    expect(status.recommendations).toHaveLength(2);
  });
});

describe('Tool Types', () => {
  test('Tool argument types should have correct structure', () => {
    const readArgs: ReadFileArgs = {
      path: '/Users/test/Documents/file.txt'
    };

    const writeArgs: WriteFileArgs = {
      path: '/Users/test/Documents/output.txt',
      content: 'Hello, world!'
    };

    const listArgs: ListDirectoryArgs = {
      path: '/Users/test/Documents'
    };

    expect(readArgs.path).toBe('/Users/test/Documents/file.txt');
    expect(writeArgs.content).toBe('Hello, world!');
    expect(listArgs.path).toBe('/Users/test/Documents');
  });
});

describe('Type Union Tests', () => {
  test('McpContent union type should work correctly', () => {
    const textContent: McpContent = {
      type: 'text',
      text: 'Hello'
    };

    const resourceContent: McpContent = {
      type: 'resource',
      resource: {
        uri: 'file:///test.txt'
      }
    };

    expect(textContent.type).toBe('text');
    expect(resourceContent.type).toBe('resource');
  });
});