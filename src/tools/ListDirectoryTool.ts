/**
 * ListDirectoryTool Class
 * MCP-compliant tool for listing directory contents with file type indicators and metadata
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpContent, McpTextContent, McpResourceContent } from '../types/index';
import { PathValidator } from '../security/PathValidator';


// Zod schema for input validation
const listDirectorySchema = z.object({
  path: z.string().min(1, 'Directory path is required'),
  showHidden: z.boolean().optional().default(false),
  sortBy: z.enum(['name', 'size', 'modified', 'type']).optional().default('name'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc')
});

// Type for validated input
type ListDirectoryInput = {
  path: string;
  showHidden?: boolean;
  sortBy?: 'name' | 'size' | 'modified' | 'type';
  sortOrder?: 'asc' | 'desc';
};

// Interface for directory entry information
interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size: number;
  modified: Date;
  permissions: string;
  isHidden: boolean;
  extension?: string | undefined;
  mimeType?: string | undefined;
}

export class ListDirectoryTool {
  public readonly name = 'list_directory';
  public readonly description = 'List the contents of a directory with file type indicators and metadata';
  
  public readonly inputSchema = listDirectorySchema;

  private pathValidator: PathValidator;

  constructor(pathValidator: PathValidator) {
    this.pathValidator = pathValidator;
  }

  /**
   * Main handler for the list_directory tool
   */
  public async handler(args: ListDirectoryInput): Promise<McpContent[]> {
    try {
      // Step 1: Validate the input path
      const validationResult = this.pathValidator.validatePath(args.path);
      
      if (!validationResult.isValid) {
        return this.createErrorResponse(
          `Invalid path: ${validationResult.error || 'Path validation failed'}`,
          validationResult.securityViolation ? 'security' : 'validation'
        );
      }

      const dirPath = validationResult.resolvedPath;
      
      // Step 2: Check if directory exists
      if (!await this.directoryExists(dirPath)) {
        return this.createErrorResponse(
          `Directory not found: ${args.path}`,
          'filesystem'
        );
      }

      // Step 3: Check if path is actually a directory
      const stats = await fs.promises.stat(dirPath);
      if (!stats.isDirectory()) {
        return this.createErrorResponse(
          `Path is not a directory: ${args.path}`,
          'validation'
        );
      }

      // Step 4: Read directory contents
      const entries = await this.readDirectoryEntries(dirPath, args.showHidden || false);
      
      // Step 5: Sort entries based on criteria
      const sortedEntries = this.sortEntries(entries, args.sortBy || 'name', args.sortOrder || 'asc');
      
      // Step 6: Create response with directory listing
      return this.createSuccessResponse(dirPath, args.path, sortedEntries, stats);

    } catch (error) {
      return this.handleError(error, args.path);
    }
  }

  /**
   * Check if a directory exists
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read directory entries with detailed information
   */
  private async readDirectoryEntries(dirPath: string, showHidden: boolean): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = [];
    
    try {
      const items = await fs.promises.readdir(dirPath);
      
      for (const item of items) {
        // Skip hidden files if not requested
        if (!showHidden && item.startsWith('.')) {
          continue;
        }
        
        const itemPath = path.join(dirPath, item);
        
        try {
          const stats = await fs.promises.stat(itemPath);
          const entry = await this.createDirectoryEntry(item, itemPath, stats);
          entries.push(entry);
        } catch (error) {
          // If we can't stat an individual item, create a basic entry
          entries.push({
            name: item,
            type: 'other',
            size: 0,
            modified: new Date(),
            permissions: '?',
            isHidden: item.startsWith('.'),
            extension: path.extname(item) || undefined
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to read directory contents: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    return entries;
  }

  /**
   * Create a directory entry with detailed information
   */
  private async createDirectoryEntry(name: string, fullPath: string, stats: fs.Stats): Promise<DirectoryEntry> {
    let type: DirectoryEntry['type'] = 'other';
    
    if (stats.isFile()) {
      type = 'file';
    } else if (stats.isDirectory()) {
      type = 'directory';
    } else if (stats.isSymbolicLink()) {
      type = 'symlink';
    }
    
    const extension = type === 'file' ? path.extname(name) : undefined;
    const mimeType = type === 'file' ? this.getMimeType(fullPath) : undefined;
    
    return {
      name,
      type,
      size: stats.size,
      modified: stats.mtime,
      permissions: this.formatPermissions(stats.mode),
      isHidden: name.startsWith('.'),
      extension,
      mimeType
    };
  }

  /**
   * Sort directory entries based on criteria
   */
  private sortEntries(entries: DirectoryEntry[], sortBy: string, sortOrder: string): DirectoryEntry[] {
    return entries.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'modified':
          comparison = a.modified.getTime() - b.modified.getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Format file permissions in human-readable format
   */
  private formatPermissions(mode: number): string {
    const permissions = [];
    
    // Owner permissions
    permissions.push((mode & 0o400) ? 'r' : '-');
    permissions.push((mode & 0o200) ? 'w' : '-');
    permissions.push((mode & 0o100) ? 'x' : '-');
    
    // Group permissions
    permissions.push((mode & 0o040) ? 'r' : '-');
    permissions.push((mode & 0o020) ? 'w' : '-');
    permissions.push((mode & 0o010) ? 'x' : '-');
    
    // Other permissions
    permissions.push((mode & 0o004) ? 'r' : '-');
    permissions.push((mode & 0o002) ? 'w' : '-');
    permissions.push((mode & 0o001) ? 'x' : '-');
    
    return permissions.join('');
  }

  /**
   * Create a successful response with directory listing
   */
  private createSuccessResponse(
    dirPath: string,
    originalPath: string,
    entries: DirectoryEntry[],
    dirStats: fs.Stats
  ): McpContent[] {
    // Create summary text
    const totalFiles = entries.filter(e => e.type === 'file').length;
    const totalDirs = entries.filter(e => e.type === 'directory').length;
    const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
    
    const summaryText = `Directory listing for: ${originalPath}\n` +
      `Total items: ${entries.length} (${totalFiles} files, ${totalDirs} directories)\n` +
      `Total size: ${this.formatSize(totalSize)}\n` +
      `Last modified: ${dirStats.mtime.toISOString()}\n\n` +
      this.formatDirectoryListing(entries);

    const textContent: McpTextContent = {
      type: 'text',
      text: summaryText
    };

    // Create structured resource with detailed information
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `file://${dirPath}`,
        mimeType: 'application/json',
        text: JSON.stringify({
          path: originalPath,
          resolvedPath: dirPath,
          totalItems: entries.length,
          totalFiles,
          totalDirectories: totalDirs,
          totalSize,
          lastModified: dirStats.mtime.toISOString(),
          entries: entries.map(entry => ({
            name: entry.name,
            type: entry.type,
            size: entry.size,
            sizeFormatted: this.formatSize(entry.size),
            modified: entry.modified.toISOString(),
            permissions: entry.permissions,
            isHidden: entry.isHidden,
            extension: entry.extension,
            mimeType: entry.mimeType
          }))
        }, null, 2)
      }
    };

    return [textContent, resourceContent];
  }

  /**
   * Format directory listing as human-readable text
   */
  private formatDirectoryListing(entries: DirectoryEntry[]): string {
    if (entries.length === 0) {
      return 'Directory is empty.';
    }
    
    const lines = ['Type | Size      | Modified             | Permissions | Name'];
    lines.push('-----|-----------|----------------------|-------------|-----');
    
    for (const entry of entries) {
      const typeIcon = this.getTypeIcon(entry.type);
      const size = entry.type === 'directory' ? '<DIR>' : this.formatSize(entry.size);
      const modified = entry.modified.toISOString().slice(0, 19).replace('T', ' ');
      const name = entry.isHidden ? `${entry.name} (hidden)` : entry.name;
      
      lines.push(`${typeIcon}    | ${size.padStart(9)} | ${modified} | ${entry.permissions} | ${name}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Get type icon for directory entry
   */
  private getTypeIcon(type: DirectoryEntry['type']): string {
    switch (type) {
      case 'file': return '📄';
      case 'directory': return '📁';
      case 'symlink': return '🔗';
      default: return '❓';
    }
  }

  /**
   * Get MIME type based on file extension
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.html': 'text/html',
      '.css': 'text/css',
      '.xml': 'text/xml',
      '.csv': 'text/csv',
      '.log': 'text/plain',
      '.yml': 'text/yaml',
      '.yaml': 'text/yaml',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.cpp': 'text/x-c++src',
      '.c': 'text/x-csrc',
      '.h': 'text/x-chdr',
      '.sh': 'text/x-shellscript',
      '.sql': 'text/x-sql',
      '.php': 'text/x-php',
      '.rb': 'text/x-ruby',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.swift': 'text/x-swift',
      '.kt': 'text/x-kotlin',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Format size in human-readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  /**
   * Create an error response in MCP format
   */
  private createErrorResponse(message: string, errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system'): McpContent[] {
    let recommendations: string[] = [];
    
    switch (errorType) {
      case 'security':
        recommendations = [
          'Use paths within allowed directories (~/Documents or ~/Desktop)',
          'Avoid path traversal sequences like "../"',
          'Use absolute paths when possible',
          'Ensure the target directory is within security boundaries'
        ];
        break;
      case 'permission':
        recommendations = [
          'Check directory permissions',
          'Ensure Full Disk Access is enabled for the terminal',
          'Verify read permissions for the target directory',
          'Check if the directory is accessible to your user'
        ];
        break;
      case 'filesystem':
        recommendations = [
          'Verify the directory exists at the specified path',
          'Check for typos in the directory path',
          'Ensure the path points to a valid directory',
          'Try listing the parent directory first'
        ];
        break;
      case 'validation':
        recommendations = [
          'Ensure the path is valid and points to a directory',
          'Check that the path format is correct',
          'Verify the directory path exists',
          'Use forward slashes in paths'
        ];
        break;
      case 'system':
        recommendations = [
          'Check system resources',
          'Verify the application has necessary permissions',
          'Try again later or restart the application',
          'Check for filesystem corruption or issues'
        ];
        break;
    }

    const errorContent: McpTextContent = {
      type: 'text',
      text: `Error listing directory: ${message}\n\nRecommendations:\n${recommendations.map(r => `- ${r}`).join('\n')}`
    };

    return [errorContent];
  }

  /**
   * Handle unexpected errors during directory listing
   */
  private handleError(error: unknown, dirPath: string): McpContent[] {
    let errorMessage = 'Unknown error occurred';
    let errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system' = 'system';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Classify common error types
      if (error.message.includes('ENOENT')) {
        errorType = 'filesystem';
        errorMessage = 'Directory does not exist';
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        errorType = 'permission';
        errorMessage = 'Permission denied - insufficient read permissions';
      } else if (error.message.includes('ENOTDIR')) {
        errorType = 'validation';
        errorMessage = 'Path is not a directory';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        errorType = 'system';
        errorMessage = 'Too many open files';
      }
    }

    return this.createErrorResponse(
      `${errorMessage} (${dirPath})`,
      errorType
    );
  }

  /**
   * Static factory method to create ListDirectoryTool with default macOS PathValidator
   */
  public static createForMacOS(): ListDirectoryTool {
    const pathValidator = PathValidator.createForMacOS();
    return new ListDirectoryTool(pathValidator);
  }
}