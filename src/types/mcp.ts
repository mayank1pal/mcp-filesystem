/**
 * MCP Content Response Types
 * Based on Model Context Protocol specification
 */

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
  };
}

export type McpContent = McpTextContent | McpResourceContent;

/**
 * MCP Error Response Format
 */
export interface McpError {
  code: number;
  message: string;
  data?: {
    type: 'security' | 'permission' | 'filesystem' | 'validation' | 'system';
    details?: string;
    recommendations?: string[];
    securityContext?: boolean;
  };
}

/**
 * MCP Server Configuration
 */
export interface McpServerConfig {
  name: string;
  version: string;
  allowedDirectories: string[];
  transport: 'stdio';
}