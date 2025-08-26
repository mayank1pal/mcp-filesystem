/**
 * MCP Tool Interface Types
 * Defines the structure for filesystem tools
 */

import { ZodSchema } from 'zod';
import { McpContent } from './mcp.js';

export interface FilesystemTool {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  handler: (args: any) => Promise<McpContent[]>;
}

/**
 * Tool input argument types
 */
export interface ReadFileArgs {
  path: string;
}

export interface WriteFileArgs {
  path: string;
  content: string;
}

export interface ListDirectoryArgs {
  path: string;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  toolName: string;
  args: Record<string, any>;
  timestamp: Date;
  clientInfo?: string;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  content: McpContent[];
  error?: string;
  executionTime?: number;
}