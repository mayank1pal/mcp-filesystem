/**
 * McpFilesystemServer Tests
 * Comprehensive tests for MCP server implementation and tool integration
 */

import { McpFilesystemServer } from '../McpFilesystemServer';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ReadFileTool } from '../../tools/ReadFileTool';
import { WriteFileTool } from '../../tools/WriteFileTool';
import { ListDirectoryTool } from '../../tools/ListDirectoryTool';
import { PathValidator } from '../../security/PathValidator';
import { PermissionManager } from '../../permissions/PermissionManager';
import { ConfigurationManager } from '../../config/ConfigurationManager';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

// Mock the tools
jest.mock('../../tools/ReadFileTool');
jest.mock('../../tools/WriteFileTool');
jest.mock('../../tools/ListDirectoryTool');

// Mock security components
jest.mock('../../security/PathValidator');
jest.mock('../../permissions/PermissionManager');
jest.mock('../../config/ConfigurationManager');

const MockServer = Server as jest.MockedClass<typeof Server>;
const MockReadFileTool = ReadFileTool as jest.MockedClass<typeof ReadFileTool>;
const MockWriteFileTool = WriteFileTool as jest.MockedClass<typeof WriteFileTool>;
const MockListDirectoryTool = ListDirectoryTool as jest.MockedClass<typeof ListDirectoryTool>;
const MockPathValidator = PathValidator as jest.MockedClass<typeof PathValidator>;
const MockPermissionManager = PermissionManager as jest.MockedClass<typeof PermissionManager>;
// ConfigurationManager is a singleton, so we mock it differently

describe('McpFilesystemServer', () => {
  let server: McpFilesystemServer;
  let mockServerInstance: jest.Mocked<Server>;
  let mockSetRequestHandler: jest.Mock;
  let mockConnect: jest.Mock;
  let mockClose: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server methods
    mockSetRequestHandler = jest.fn();
    mockConnect = jest.fn().mockResolvedValue(undefined);
    mockClose = jest.fn().mockResolvedValue(undefined);

    mockServerInstance = {
      setRequestHandler: mockSetRequestHandler,
      connect: mockConnect,
      close: mockClose,
    } as any;

    MockServer.mockImplementation(() => mockServerInstance);

    // Mock tool constructors
    MockReadFileTool.mockImplementation(() => ({
      name: 'read_file',
      description: 'Read file contents',
      inputSchema: { type: 'object' },
      handler: jest.fn()
    } as any));

    MockWriteFileTool.mockImplementation(() => ({
      name: 'write_file',
      description: 'Write file contents',
      inputSchema: { type: 'object' },
      handler: jest.fn()
    } as any));

    MockListDirectoryTool.mockImplementation(() => ({
      name: 'list_directory',
      description: 'List directory contents',
      inputSchema: { type: 'object' },
      handler: jest.fn()
    } as any));

    // Mock ConfigurationManager singleton
    (ConfigurationManager.getInstance as jest.Mock) = jest.fn().mockReturnValue({
      getConfiguration: jest.fn().mockReturnValue({
        allowedDirectories: ['/Users/test/Documents', '/Users/test/Desktop'],
        securityLevel: 'strict',
        maxFileSize: '10MB',
        allowedExtensions: ['*'],
        blockedExtensions: [],
        logLevel: 'info',
        logDestination: 'console',
        enableEnhancedTools: false,
        enableBatchOperations: false,
        enableSymlinkFollowing: false,
        maxConcurrentOperations: 5,
        operationTimeout: 30000,
        enableCaching: true,
        cacheTimeout: 60000
      }),
      getConfigurationWithMetadata: jest.fn().mockReturnValue({
        config: {
          allowedDirectories: ['/Users/test/Documents', '/Users/test/Desktop'],
          securityLevel: 'strict',
          maxFileSize: '10MB'
        },
        sources: {},
        errors: [],
        warnings: []
      }),
      getAllowedDirectories: jest.fn().mockReturnValue(['/Users/test/Documents', '/Users/test/Desktop'])
    });

    // Mock PathValidator
    MockPathValidator.createFromConfiguration = jest.fn().mockReturnValue({
      validatePath: jest.fn(),
      getSecurityEvents: jest.fn().mockReturnValue([]),
      clearSecurityEvents: jest.fn(),
      getAllowedPrefixes: jest.fn().mockReturnValue(['/Users/test/Documents', '/Users/test/Desktop'])
    });

    // Mock PermissionManager
    MockPermissionManager.mockImplementation(() => ({
      checkPermissions: jest.fn(),
      generateSetupInstructions: jest.fn()
    } as any));

    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    server = new McpFilesystemServer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize server with correct metadata', () => {
      expect(MockServer).toHaveBeenCalledWith(
        {
          name: 'mcp-filesystem-server',
          version: '2.0.0',
        },
        {
          capabilities: {
            tools: {
              listChanged: true,
            },
          },
        }
      );
    });

    test('should set up request handlers', () => {
      expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
    });

    test('should initialize all required components', () => {
      const tools = server.getTools();
      const security = server.getSecurityComponents();

      expect(tools.readFile).toBeDefined();
      expect(tools.writeFile).toBeDefined();
      expect(tools.listDirectory).toBeDefined();
      expect(security.pathValidator).toBeDefined();
      expect(security.permissionManager).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    test('should handle list tools request', async () => {
      // Get the first handler (should be ListToolsRequestSchema)
      const listToolsHandler = mockSetRequestHandler.mock.calls[0]?.[1];

      expect(listToolsHandler).toBeDefined();

      if (listToolsHandler) {
        const result = await listToolsHandler({});
        
        expect(result).toHaveProperty('tools');
        expect(result.tools).toHaveLength(3);
        
        const toolNames = result.tools.map((tool: any) => tool.name);
        expect(toolNames).toContain('read_file');
        expect(toolNames).toContain('write_file');
        expect(toolNames).toContain('list_directory');
      }
    });

    test('should register tools with correct schemas', async () => {
      const listToolsHandler = mockSetRequestHandler.mock.calls[0]?.[1];

      if (listToolsHandler) {
        const result = await listToolsHandler({});
        
        result.tools.forEach((tool: any) => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');
        });
      }
    });
  });

  describe('Tool Execution', () => {
    let callToolHandler: any;

    beforeEach(() => {
      // Get the second handler (should be CallToolRequestSchema)
      callToolHandler = mockSetRequestHandler.mock.calls[1]?.[1];
    });

    test('should handle read_file tool calls', async () => {
      expect(callToolHandler).toBeDefined();

      const mockRequest = {
        params: {
          name: 'read_file',
          arguments: { path: 'test.txt' }
        }
      };

      // Mock the tool handler
      const tools = server.getTools();
      const mockReadHandler = jest.fn().mockResolvedValue([{ type: 'text', text: 'file content' }]);
      tools.readFile.handler = mockReadHandler;

      const result = await callToolHandler(mockRequest);

      expect(mockReadHandler).toHaveBeenCalledWith({ path: 'test.txt' });
      expect(result).toHaveProperty('content');
      expect(result.content).toEqual([{ type: 'text', text: 'file content' }]);
    });

    test('should handle write_file tool calls', async () => {
      const mockRequest = {
        params: {
          name: 'write_file',
          arguments: { path: 'test.txt', content: 'new content' }
        }
      };

      const tools = server.getTools();
      const mockWriteHandler = jest.fn().mockResolvedValue([{ type: 'text', text: 'File written successfully' }]);
      tools.writeFile.handler = mockWriteHandler;

      const result = await callToolHandler(mockRequest);

      expect(mockWriteHandler).toHaveBeenCalledWith({ path: 'test.txt', content: 'new content' });
      expect(result).toHaveProperty('content');
      expect(result.content).toEqual([{ type: 'text', text: 'File written successfully' }]);
    });

    test('should handle list_directory tool calls', async () => {
      const mockRequest = {
        params: {
          name: 'list_directory',
          arguments: { path: '/Users/test/Documents' }
        }
      };

      const tools = server.getTools();
      const mockListHandler = jest.fn().mockResolvedValue([{ type: 'text', text: 'Directory listing' }]);
      tools.listDirectory.handler = mockListHandler;

      const result = await callToolHandler(mockRequest);

      expect(mockListHandler).toHaveBeenCalledWith({ path: '/Users/test/Documents' });
      expect(result).toHaveProperty('content');
      expect(result.content).toEqual([{ type: 'text', text: 'Directory listing' }]);
    });

    test('should throw error for unknown tools', async () => {
      const mockRequest = {
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      await expect(callToolHandler(mockRequest)).rejects.toThrow('Unknown tool: unknown_tool');
    });

    test('should handle tool execution errors', async () => {
      const mockRequest = {
        params: {
          name: 'read_file',
          arguments: { path: 'nonexistent.txt' }
        }
      };

      const tools = server.getTools();
      const mockReadHandler = jest.fn().mockRejectedValue(new Error('File not found'));
      tools.readFile.handler = mockReadHandler;

      await expect(callToolHandler(mockRequest)).rejects.toThrow('File not found');
    });

    test('should log and clear security events on tool execution errors', async () => {
      const mockRequest = {
        params: {
          name: 'read_file',
          arguments: { path: '../../../etc/passwd' }
        }
      };

      const tools = server.getTools();
      const security = server.getSecurityComponents();
      
      // Mock security events
      const mockSecurityEvents = [
        { type: 'path_traversal', path: '../../../etc/passwd', timestamp: new Date() }
      ];
      security.pathValidator.getSecurityEvents = jest.fn().mockReturnValue(mockSecurityEvents);
      security.pathValidator.clearSecurityEvents = jest.fn();

      const mockReadHandler = jest.fn().mockRejectedValue(new Error('Security violation'));
      tools.readFile.handler = mockReadHandler;

      await expect(callToolHandler(mockRequest)).rejects.toThrow('Security violation');
      
      expect(security.pathValidator.getSecurityEvents).toHaveBeenCalled();
      expect(security.pathValidator.clearSecurityEvents).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Security events detected:', mockSecurityEvents);
    });
  });

  describe('Server Lifecycle', () => {
    test('should start server successfully with Full Disk Access', async () => {
      const security = server.getSecurityComponents();
      
      // Mock permission check to return success
      security.permissionManager.checkPermissions = jest.fn().mockResolvedValue({
        hasFullDiskAccess: true,
        canAccessDocuments: true,
        canAccessDesktop: true
      });

      await server.start();

      expect(mockConnect).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('MCP Filesystem Server started successfully');
    });

    test('should start server with warning when Full Disk Access is missing', async () => {
      const security = server.getSecurityComponents();
      
      // Mock permission check to return failure
      security.permissionManager.checkPermissions = jest.fn().mockResolvedValue({
        hasFullDiskAccess: false,
        canAccessDocuments: false,
        canAccessDesktop: false
      });

      security.permissionManager.generateSetupInstructions = jest.fn().mockReturnValue(
        'Please enable Full Disk Access in System Preferences'
      );

      await server.start();

      expect(mockConnect).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith('Warning: Full Disk Access not detected');
      expect(console.warn).toHaveBeenCalledWith('Please enable Full Disk Access in System Preferences');
    });

    test('should handle server start errors', async () => {
      const security = server.getSecurityComponents();
      security.permissionManager.checkPermissions = jest.fn().mockResolvedValue({
        hasFullDiskAccess: true,
        canAccessDocuments: true,
        canAccessDesktop: true
      });

      mockConnect.mockRejectedValue(new Error('Connection failed'));

      await expect(server.start()).rejects.toThrow('Connection failed');
      expect(console.error).toHaveBeenCalledWith('Failed to start MCP server:', expect.any(Error));
    });
  });

  describe('Graceful Shutdown', () => {
    let originalProcessOn: typeof process.on;
    let mockProcessOn: jest.Mock;

    beforeEach(() => {
      originalProcessOn = process.on;
      mockProcessOn = jest.fn();
      process.on = mockProcessOn;
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register signal handlers', () => {
      new McpFilesystemServer();

      expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(mockProcessOn).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    test('should handle SIGINT gracefully', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();
      
      new McpFilesystemServer();

      // Find and call the SIGINT handler
      const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')?.[1];
      expect(sigintHandler).toBeDefined();

      if (sigintHandler) {
        await sigintHandler();
        
        expect(mockClose).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith('Received SIGINT, shutting down gracefully...');
        expect(console.log).toHaveBeenCalledWith('Server closed successfully');
        expect(mockExit).toHaveBeenCalledWith(0);
      }

      mockExit.mockRestore();
    });

    test('should handle shutdown errors', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();
      mockClose.mockRejectedValue(new Error('Close failed'));
      
      new McpFilesystemServer();

      const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')?.[1];
      
      if (sigintHandler) {
        await sigintHandler();
        
        expect(console.error).toHaveBeenCalledWith('Error during shutdown:', expect.any(Error));
        expect(mockExit).toHaveBeenCalledWith(1);
      }

      mockExit.mockRestore();
    });

    test('should log security events during shutdown', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation();
      
      const testServer = new McpFilesystemServer();
      const security = testServer.getSecurityComponents();
      
      const mockSecurityEvents = [
        { type: 'path_traversal', path: '../test', timestamp: new Date() }
      ];
      security.pathValidator.getSecurityEvents = jest.fn().mockReturnValue(mockSecurityEvents);

      const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')?.[1];
      
      if (sigintHandler) {
        await sigintHandler();
        
        expect(console.log).toHaveBeenCalledWith('Final security events:', mockSecurityEvents);
      }

      mockExit.mockRestore();
    });
  });

  describe('Getters', () => {
    test('should return server instance', () => {
      const serverInstance = server.getServer();
      expect(serverInstance).toBe(mockServerInstance);
    });

    test('should return tools', () => {
      const tools = server.getTools();
      
      expect(tools).toHaveProperty('readFile');
      expect(tools).toHaveProperty('writeFile');
      expect(tools).toHaveProperty('listDirectory');
    });

    test('should return security components', () => {
      const security = server.getSecurityComponents();
      
      expect(security).toHaveProperty('pathValidator');
      expect(security).toHaveProperty('permissionManager');
    });
  });
});