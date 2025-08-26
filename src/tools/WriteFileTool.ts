/**
 * WriteFileTool Class
 * MCP-compliant tool for writing files with security validation and content sanitization
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpContent, McpTextContent, McpResourceContent } from '../types/index';
import { PathValidator } from '../security/PathValidator';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { FileValidator } from '../validation/FileValidator';

// Zod schema for input validation
const writeFileSchema = z.object({
  path: z.string().min(1, 'File path is required'),
  content: z.string().describe('Content to write to the file'),
  encoding: z.string().optional().default('utf8'),
  createDirectories: z.boolean().optional().default(false),
  overwrite: z.boolean().optional().default(true)
});

// Type for validated input (with optional properties)
type WriteFileInput = {
  path: string;
  content: string;
  encoding?: string;
  createDirectories?: boolean;
  overwrite?: boolean;
};

export class WriteFileTool {
  public readonly name = 'write_file';
  public readonly description = 'Write content to a file in the filesystem';
  
  public readonly inputSchema = writeFileSchema;

  private pathValidator: PathValidator;
  private configManager: ConfigurationManager;
  private fileValidator: FileValidator;
  private allowedEncodings: Set<string>;

  constructor(pathValidator: PathValidator, configManager?: ConfigurationManager) {
    this.pathValidator = pathValidator;
    this.configManager = configManager || ConfigurationManager.getInstance();
    this.fileValidator = new FileValidator(this.configManager);
    
    // Allowed text encodings
    this.allowedEncodings = new Set([
      'utf8', 'utf-8', 'ascii', 'latin1', 'base64', 'hex'
    ]);
  }

  /**
   * Main handler for the write_file tool
   */
  public async handler(args: WriteFileInput): Promise<McpContent[]> {
    try {
      // Step 1: Validate the input path
      const validationResult = this.pathValidator.validatePath(args.path);
      
      if (!validationResult.isValid) {
        return this.createErrorResponse(
          `Invalid path: ${validationResult.error || 'Path validation failed'}`,
          validationResult.securityViolation ? 'security' : 'validation'
        );
      }

      const filePath = validationResult.resolvedPath;
      
      // Step 2: Validate content size
      const maxContentSize = this.configManager.getMaxFileSizeBytes();
      if (args.content.length > maxContentSize) {
        return this.createErrorResponse(
          `Content size exceeds maximum allowed size (${this.formatSize(args.content.length)} > ${this.formatSize(maxContentSize)})`,
          'validation'
        );
      }

      // Step 2.5: Enhanced file validation (extension, MIME type, category, etc.)
      const fileValidationResult = this.fileValidator.validateFile(filePath, {
        checkSize: false, // We already checked content size above
        checkExtension: true,
        checkMimeType: true
      });
      
      if (!fileValidationResult.isValid) {
        return this.createErrorResponse(
          fileValidationResult.error || 'File validation failed',
          'validation'
        );
      }
      
      // Show warnings if any
      if (fileValidationResult.warnings && fileValidationResult.warnings.length > 0) {
        console.warn('File validation warnings:', fileValidationResult.warnings.join(', '));
      }

      // Step 3: Validate encoding
      if (args.encoding && !this.allowedEncodings.has(args.encoding.toLowerCase())) {
        return this.createErrorResponse(
          `Unsupported encoding: ${args.encoding}. Supported encodings: ${Array.from(this.allowedEncodings).join(', ')}`,
          'validation'
        );
      }

      // Step 4: Validate and sanitize content
      const sanitizedContent = this.sanitizeContent(args.content);
      
      // Step 5: Check if file exists and handle overwrite logic
      const fileExists = await this.fileExists(filePath);
      if (fileExists && !args.overwrite) {
        return this.createErrorResponse(
          `File already exists and overwrite is disabled: ${args.path}`,
          'validation'
        );
      }

      // Step 6: Create directories if needed
      if (args.createDirectories) {
        const dirPath = path.dirname(filePath);
        await this.ensureDirectoryExists(dirPath);
      }

      // Step 7: Write the file
      await fs.promises.writeFile(filePath, sanitizedContent, { 
        encoding: args.encoding as BufferEncoding || 'utf8' 
      });

      // Step 8: Get file stats for response
      const stats = await fs.promises.stat(filePath);
      
      return this.createSuccessResponse(filePath, args.path, stats, sanitizedContent.length, fileExists);

    } catch (error) {
      return this.handleError(error, args.path);
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists, creating it if necessary
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.promises.access(dirPath, fs.constants.F_OK);
    } catch {
      // Directory doesn't exist, create it
      await fs.promises.mkdir(dirPath, { recursive: true });
    }
  }

  /**
   * Sanitize content to prevent potential security issues
   */
  private sanitizeContent(content: string): string {
    // Remove null bytes which can cause issues
    let sanitized = content.replace(/\0/g, '');
    
    // Normalize line endings to Unix style
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // Ensure content ends with newline if it's not empty and doesn't already end with one
    if (sanitized.length > 0 && !sanitized.endsWith('\n')) {
      sanitized += '\n';
    }
    
    return sanitized;
  }

  /**
   * Create a successful response with file information
   */
  private createSuccessResponse(
    filePath: string,
    originalPath: string,
    stats: fs.Stats,
    contentLength: number,
    wasUpdate: boolean
  ): McpContent[] {
    const operation = wasUpdate ? 'updated' : 'created';
    
    const textContent: McpTextContent = {
      type: 'text',
      text: `File ${operation} successfully: ${originalPath}\nSize: ${this.formatSize(stats.size)}\nContent length: ${this.formatSize(contentLength)}`
    };

    // Include file metadata as a resource
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `file://${filePath}`,
        mimeType: this.getMimeType(filePath),
        text: `File: ${path.basename(filePath)}\nOperation: ${operation}\nSize: ${this.formatSize(stats.size)}\nModified: ${stats.mtime.toISOString()}\nPath: ${originalPath}`
      }
    };

    return [textContent, resourceContent];
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
          'Check file and directory permissions',
          'Ensure Full Disk Access is enabled for the terminal',
          'Verify write permissions for the target directory',
          'Check if the file is read-only or locked'
        ];
        break;
      case 'filesystem':
        recommendations = [
          'Verify the target directory exists',
          'Check available disk space',
          'Ensure the path is valid for the filesystem',
          'Try creating parent directories first'
        ];
        break;
      case 'validation':
        recommendations = [
          'Check file path format and length',
          'Verify content size is within limits',
          'Ensure encoding is supported',
          'Review overwrite and directory creation settings'
        ];
        break;
      case 'system':
        recommendations = [
          'Check system resources and disk space',
          'Verify the application has necessary permissions',
          'Try again later or restart the application',
          'Check for filesystem corruption or issues'
        ];
        break;
    }

    const errorContent: McpTextContent = {
      type: 'text',
      text: `Error writing file: ${message}\n\nRecommendations:\n${recommendations.map(r => `- ${r}`).join('\n')}`
    };

    return [errorContent];
  }

  /**
   * Handle unexpected errors during file writing
   */
  private handleError(error: unknown, filePath: string): McpContent[] {
    let errorMessage = 'Unknown error occurred';
    let errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system' = 'system';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Classify common error types
      if (error.message.includes('ENOENT')) {
        errorType = 'filesystem';
        errorMessage = 'Directory does not exist or path is invalid';
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        errorType = 'permission';
        errorMessage = 'Permission denied - insufficient write permissions';
      } else if (error.message.includes('ENOSPC')) {
        errorType = 'filesystem';
        errorMessage = 'No space left on device';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        errorType = 'system';
        errorMessage = 'Too many open files';
      } else if (error.message.includes('EISDIR')) {
        errorType = 'filesystem';
        errorMessage = 'Target is a directory, not a file';
      } else if (error.message.includes('ENOTDIR')) {
        errorType = 'filesystem';
        errorMessage = 'Parent path is not a directory';
      }
    }

    return this.createErrorResponse(
      `${errorMessage} (${filePath})`,
      errorType
    );
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
      '.scala': 'text/x-scala',
      '.r': 'text/x-r',
      '.m': 'text/x-objcsrc',
      '.mm': 'text/x-objc++src',
      '.pl': 'text/x-perl',
      '.lua': 'text/x-lua',
      '.vim': 'text/x-vim',
      '.dockerfile': 'text/x-dockerfile',
      '.gitignore': 'text/plain',
      '.env': 'text/plain',
      '.ini': 'text/plain',
      '.cfg': 'text/plain',
      '.conf': 'text/plain',
      '.properties': 'text/plain',
      '.toml': 'text/x-toml'
    };

    return mimeTypes[ext] || 'text/plain';
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
   * Static factory method to create WriteFileTool with default macOS PathValidator
   */
  public static createForMacOS(): WriteFileTool {
    const pathValidator = PathValidator.createForMacOS();
    return new WriteFileTool(pathValidator);
  }
}