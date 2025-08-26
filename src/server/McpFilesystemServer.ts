/**
 * McpFilesystemServer Class
 * Generic MCP server implementation for secure filesystem operations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ReadFileTool } from '../tools/ReadFileTool';
import { WriteFileTool } from '../tools/WriteFileTool';
import { ListDirectoryTool } from '../tools/ListDirectoryTool';
import { CopyFileTool } from '../tools/CopyFileTool';
import { DeleteFileTool } from '../tools/DeleteFileTool';
import { PathValidator } from '../security/PathValidator';
import { PermissionManager } from '../permissions/PermissionManager';
import { ConfigurationManager } from '../config/ConfigurationManager';

export class McpFilesystemServer {
  private server: Server;
  private configManager: ConfigurationManager;
  private pathValidator: PathValidator;
  private permissionManager: PermissionManager;
  private readFileTool: ReadFileTool;
  private writeFileTool: WriteFileTool;
  private listDirectoryTool: ListDirectoryTool;
  private copyFileTool?: CopyFileTool;
  private deleteFileTool?: DeleteFileTool;

  constructor(configManager?: ConfigurationManager) {
    // Initialize configuration manager
    this.configManager = configManager || ConfigurationManager.getInstance();

    // Initialize server with metadata
    this.server = new Server(
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

    // Initialize security and permission components with configuration
    this.pathValidator = PathValidator.createFromConfiguration(this.configManager);
    this.permissionManager = new PermissionManager();

    // Initialize filesystem tools
    this.readFileTool = new ReadFileTool(this.pathValidator);
    this.writeFileTool = new WriteFileTool(this.pathValidator);
    this.listDirectoryTool = new ListDirectoryTool(this.pathValidator);

    // Initialize enhanced tools if enabled
    const config = this.configManager.getConfiguration();
    if (config.enableEnhancedTools) {
      this.copyFileTool = new CopyFileTool(this.pathValidator, this.configManager);
      this.deleteFileTool = new DeleteFileTool(this.pathValidator, this.configManager);
    }

    this.setupHandlers();
    this.setupGracefulShutdown();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing requests
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Array<{name: string, description: string, inputSchema: any}> = [
        {
          name: this.readFileTool.name,
          description: this.readFileTool.description,
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Path to the file to read"
              }
            },
            required: ["path"],
            additionalProperties: false
          },
        },
        {
          name: this.writeFileTool.name,
          description: this.writeFileTool.description,
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                type: "string",
                minLength: 1
              },
              content: {
                type: "string",
                description: "Content to write to the file"
              },
              encoding: {
                type: "string",
                default: "utf8"
              },
              createDirectories: {
                type: "boolean",
                default: false
              },
              overwrite: {
                type: "boolean",
                default: true
              }
            },
            required: ["path", "content"],
            additionalProperties: false
          },
        },
        {
          name: this.listDirectoryTool.name,
          description: this.listDirectoryTool.description,
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                type: "string",
                minLength: 1
              },
              showHidden: {
                type: "boolean",
                default: false
              },
              sortBy: {
                type: "string",
                enum: ["name", "size", "modified", "type"],
                default: "name"
              },
              sortOrder: {
                type: "string",
                enum: ["asc", "desc"],
                default: "asc"
              }
            },
            required: ["path"],
            additionalProperties: false
          },
        },
      ];

      // Add enhanced tools if enabled
      if (this.copyFileTool) {
        tools.push({
          name: this.copyFileTool.name,
          description: this.copyFileTool.description,
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              source: {
                type: "string",
                minLength: 1
              },
              destination: {
                type: "string",
                minLength: 1
              },
              recursive: {
                type: "boolean",
                default: false
              },
              collisionStrategy: {
                type: "string",
                enum: ["skip", "overwrite", "rename", "fail"],
                default: "fail"
              },
              preserveTimestamps: {
                type: "boolean",
                default: true
              },
              followSymlinks: {
                type: "boolean",
                default: false
              }
            },
            required: ["source", "destination"],
            additionalProperties: false
          },
        });
      }
      
      if (this.deleteFileTool) {
        tools.push({
          name: this.deleteFileTool.name,
          description: this.deleteFileTool.description,
          inputSchema: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              path: {
                anyOf: [
                  {
                    type: "string",
                    minLength: 1
                  },
                  {
                    type: "array",
                    items: {
                      type: "string",
                      minLength: 1
                    },
                    minItems: 1
                  }
                ]
              },
              recursive: {
                type: "boolean",
                default: false
              },
              confirmationStrategy: {
                type: "string",
                enum: ["none", "prompt", "dry_run", "safe_mode"],
                default: "prompt"
              },
              force: {
                type: "boolean",
                default: false
              },
              createBackup: {
                type: "boolean",
                default: false
              },
              backupDirectory: {
                type: "string"
              },
              dryRun: {
                type: "boolean",
                default: false
              }
            },
            required: ["path"],
            additionalProperties: false
          },
        });
      }

      return { tools };
    });

    // Handle tool execution requests
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case this.readFileTool.name:
            return {
              content: await this.readFileTool.handler(args as any),
            };

          case this.writeFileTool.name:
            return {
              content: await this.writeFileTool.handler(args as any),
            };

          case this.listDirectoryTool.name:
            return {
              content: await this.listDirectoryTool.handler(args as any),
            };

          case this.copyFileTool?.name:
            if (this.copyFileTool) {
              return {
                content: await this.copyFileTool.handler(args as any),
              };
            }
            throw new Error(`Tool not enabled: ${name}`);
            

          case this.deleteFileTool?.name:
            if (this.deleteFileTool) {
              return {
                content: await this.deleteFileTool.handler(args as any),
              };
            }
            throw new Error(`Tool not enabled: ${name}`);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        // Log security events if any occurred during tool execution
        const securityEvents = this.pathValidator.getSecurityEvents();
        if (securityEvents.length > 0) {
          console.error('Security events detected:', securityEvents);
          this.pathValidator.clearSecurityEvents();
        }

        // Re-throw the error to be handled by MCP framework
        throw error;
      }
    });
  }

  /**
   * Set up graceful shutdown handling
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      
      try {
        // Log any remaining security events
        const securityEvents = this.pathValidator.getSecurityEvents();
        if (securityEvents.length > 0) {
          console.log('Final security events:', securityEvents);
        }

        // Close the server
        await this.server.close();
        console.log('Server closed successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle common termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
      shutdown('unhandledRejection');
    });
  }

  /**
   * Start the MCP server with stdio transport
   */
  public async start(): Promise<void> {
    try {
      // Get configuration details
      const config = this.configManager.getConfiguration();
      const configWithMetadata = this.configManager.getConfigurationWithMetadata();

      // Display configuration warnings and errors
      if (configWithMetadata.errors.length > 0) {
        console.error('Configuration errors:');
        configWithMetadata.errors.forEach(error => console.error(`  - ${error}`));
      }

      if (configWithMetadata.warnings.length > 0) {
        console.warn('Configuration warnings:');
        configWithMetadata.warnings.forEach(warning => console.warn(`  - ${warning}`));
      }

      // Check permissions on startup
      const permissionStatus = await this.permissionManager.checkPermissions();
      
      if (!permissionStatus.hasFullDiskAccess) {
        console.warn('Warning: Full Disk Access not detected');
        console.warn('Some filesystem operations may fail');
        console.warn('Setup instructions:');
        console.warn(this.permissionManager.generateSetupInstructions());
      }

      // Create and connect stdio transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      
      console.log('MCP Filesystem Server started successfully');
      console.log(`Security level: ${config.securityLevel}`);
      console.log(`Max file size: ${config.maxFileSize}`);
      console.log('Allowed directories:', this.pathValidator.getAllowedPrefixes());
      const registeredTools = [
        this.readFileTool.name,
        this.writeFileTool.name,
        this.listDirectoryTool.name
      ];
      
      if (this.copyFileTool) {
        registeredTools.push(this.copyFileTool.name);
      }
      
      if (this.deleteFileTool) {
        registeredTools.push(this.deleteFileTool.name);
      }
      
      console.log('Registered tools:', registeredTools);

      if (configWithMetadata.configFile) {
        console.log(`Configuration loaded from: ${configWithMetadata.configFile}`);
      }
      
    } catch (error) {
      console.error('Failed to start MCP server:', error);
      throw error;
    }
  }

  /**
   * Get server instance for testing
   */
  public getServer(): Server {
    return this.server;
  }

  /**
   * Get registered tools for testing
   */
  public getTools() {
    return {
      readFile: this.readFileTool,
      writeFile: this.writeFileTool,
      listDirectory: this.listDirectoryTool,
    };
  }

  /**
   * Get security components for testing
   */
  public getSecurityComponents() {
    return {
      pathValidator: this.pathValidator,
      permissionManager: this.permissionManager,
    };
  }

  /**
   * Get configuration manager for testing
   */
  public getConfigurationManager(): ConfigurationManager {
    return this.configManager;
  }
}