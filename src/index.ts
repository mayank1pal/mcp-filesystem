#!/usr/bin/env node

/**
 * MCP Filesystem Server Entry Point
 * Main entry point for the generic MCP filesystem server
 */

import { McpFilesystemServer } from './server/McpFilesystemServer';

async function main() {
  try {
    const server = new McpFilesystemServer();
    await server.start();
  } catch (error) {
    console.error('Fatal error starting MCP filesystem server:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error in main:', error);
    process.exit(1);
  });
}

export { McpFilesystemServer } from './server/McpFilesystemServer';
export { ReadFileTool } from './tools/ReadFileTool';
export { WriteFileTool } from './tools/WriteFileTool';
export { ListDirectoryTool } from './tools/ListDirectoryTool';
export { PathValidator } from './security/PathValidator';
export { PermissionManager } from './permissions/PermissionManager';