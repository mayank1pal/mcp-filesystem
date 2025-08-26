/**
 * ReadFileTool Class
 * MCP-compliant tool for reading file contents with security validation
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpContent, McpTextContent, McpResourceContent } from '../types/index';
import { PathValidator } from '../security/PathValidator';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { FileValidator } from '../validation/FileValidator';

export class ReadFileTool {
  public readonly name = 'read_file';
  public readonly description = 'Read the contents of a file from the filesystem';
  
  public readonly inputSchema = z.object({
    path: z.string().describe('Path to the file to read')
  });

  private pathValidator: PathValidator;
  private configManager: ConfigurationManager;
  private fileValidator: FileValidator;

  constructor(pathValidator: PathValidator, configManager?: ConfigurationManager) {
    this.pathValidator = pathValidator;
    this.configManager = configManager || ConfigurationManager.getInstance();
    this.fileValidator = new FileValidator(this.configManager);
  }

  /**
   * Main handler for the read_file tool
   */
  public async handler(args: { path: string }): Promise<McpContent[]> {
    try {
      // Step 1: Validate the input path
      const validationResult = this.pathValidator.validatePath(args.path);
      
      if (!validationResult.isValid) {
        return this.createErrorResponse(
          validationResult.error || 'Invalid path',
          validationResult.securityViolation ? 'SECURITY_ERROR' : 'VALIDATION_ERROR'
        );
      }

      const resolvedPath = validationResult.resolvedPath;

      // Step 2: Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        return this.createErrorResponse(
          `File not found: ${args.path}`,
          'FILE_NOT_FOUND'
        );
      }

      // Step 3: Check if path is a file (not a directory)
      const stats = await fs.promises.stat(resolvedPath);
      if (!stats.isFile()) {
        return this.createErrorResponse(
          `Path is not a file: ${args.path}`,
          'NOT_A_FILE'
        );
      }

      // Step 4: Check file size (prevent reading extremely large files)
      const maxFileSize = this.configManager.getMaxFileSizeBytes();
      if (stats.size > maxFileSize) {
        return this.createErrorResponse(
          `File too large: ${this.formatFileSize(stats.size)} (max: ${this.formatFileSize(maxFileSize)})`,
          'FILE_TOO_LARGE'
        );
      }

      // Step 4.5: Enhanced file validation (extension, MIME type, category, etc.)
      const fileValidationResult = this.fileValidator.validateFile(resolvedPath, {
        checkSize: false, // We already checked file size above
        checkExtension: true,
        checkMimeType: true
      });
      
      if (!fileValidationResult.isValid) {
        return this.createErrorResponse(
          fileValidationResult.error || 'File validation failed',
          'VALIDATION_ERROR'
        );
      }
      
      // Show warnings if any
      if (fileValidationResult.warnings && fileValidationResult.warnings.length > 0) {
        console.warn('File validation warnings:', fileValidationResult.warnings.join(', '));
      }

      // Step 5: Detect if file is binary
      const isBinary = await this.isBinaryFile(resolvedPath);
      
      if (isBinary) {
        return this.handleBinaryFile(resolvedPath, stats, args.path);
      }

      // Step 6: Read text file content
      const content = await fs.promises.readFile(resolvedPath, 'utf8');
      
      return this.createSuccessResponse(content, resolvedPath, stats);

    } catch (error) {
      return this.handleError(error, args.path);
    }
  }

  /**
   * Detects if a file is binary by reading the first chunk
   */
  private async isBinaryFile(filePath: string): Promise<boolean> {
    try {
      const buffer = Buffer.alloc(512);
      const fd = await fs.promises.open(filePath, 'r');
      
      try {
        const { bytesRead } = await fd.read(buffer, 0, 512, 0);
        
        // Check for null bytes which indicate binary content
        for (let i = 0; i < bytesRead; i++) {
          if (buffer[i] === 0) {
            return true;
          }
        }
        
        // Check for high percentage of non-printable characters
        let nonPrintableCount = 0;
        for (let i = 0; i < bytesRead; i++) {
          const byte = buffer[i];
          // Consider bytes outside printable ASCII range (except common whitespace)
          if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            nonPrintableCount++;
          }
        }
        
        // If more than 30% of characters are non-printable, consider it binary
        return (nonPrintableCount / bytesRead) > 0.3;
        
      } finally {
        await fd.close();
      }
    } catch {
      // If we can't read the file, assume it's binary for safety
      return true;
    }
  }

  /**
   * Handles binary files by returning metadata instead of content
   */
  private handleBinaryFile(
    filePath: string, 
    stats: fs.Stats, 
    originalPath: string
  ): McpContent[] {
    const mimeType = this.getMimeType(filePath);
    
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `file://${filePath}`,
        mimeType,
        text: `Binary file: ${originalPath}\nSize: ${this.formatFileSize(stats.size)}\nType: ${mimeType}\nModified: ${stats.mtime.toISOString()}`
      }
    };

    return [resourceContent];
  }

  /**
   * Creates a successful response with file content
   */
  private createSuccessResponse(
    content: string, 
    filePath: string, 
    stats: fs.Stats
  ): McpContent[] {
    const textContent: McpTextContent = {
      type: 'text',
      text: content
    };

    // Also include file metadata as a resource
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `file://${filePath}`,
        mimeType: this.getMimeType(filePath),
        text: `File: ${path.basename(filePath)}\nSize: ${this.formatFileSize(stats.size)}\nModified: ${stats.mtime.toISOString()}`
      }
    };

    return [textContent, resourceContent];
  }

  /**
   * Creates an error response in MCP format
   */
  private createErrorResponse(message: string, errorType: string): McpContent[] {
    const errorContent: McpTextContent = {
      type: 'text',
      text: `Error reading file: ${message}\nError Type: ${errorType}`
    };

    return [errorContent];
  }

  /**
   * Handles unexpected errors during file reading
   */
  private handleError(error: unknown, filePath: string): McpContent[] {
    let errorMessage = 'Unknown error occurred';
    let errorType = 'UNKNOWN_ERROR';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Classify common error types
      if (error.message.includes('ENOENT')) {
        errorType = 'FILE_NOT_FOUND';
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        errorType = 'PERMISSION_DENIED';
      } else if (error.message.includes('EISDIR')) {
        errorType = 'IS_DIRECTORY';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        errorType = 'TOO_MANY_FILES';
      }
    }

    return this.createErrorResponse(
      `${errorMessage} (${filePath})`,
      errorType
    );
  }

  /**
   * Determines MIME type based on file extension
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
      '.toml': 'text/x-toml',
      '.makefile': 'text/x-makefile',
      '.cmake': 'text/x-cmake',
      '.gradle': 'text/x-gradle',
      '.pom': 'application/xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',
      '.exe': 'application/x-executable',
      '.dmg': 'application/x-apple-diskimage',
      '.pkg': 'application/x-newton-compatible-pkg',
      '.deb': 'application/x-debian-package',
      '.rpm': 'application/x-rpm'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Formats file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
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
   * Static factory method to create ReadFileTool with default macOS PathValidator
   */
  public static createForMacOS(): ReadFileTool {
    const pathValidator = PathValidator.createForMacOS();
    return new ReadFileTool(pathValidator);
  }
}