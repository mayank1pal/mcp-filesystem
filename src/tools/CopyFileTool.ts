/**
 * CopyFileTool Class
 * MCP-compliant tool for copying files and directories with collision handling
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpContent, McpTextContent, McpResourceContent } from '../types/index';
import { PathValidator } from '../security/PathValidator';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { FileValidator } from '../validation/FileValidator';

// Collision resolution strategies
export enum CollisionStrategy {
  SKIP = 'skip',           // Skip if destination exists
  OVERWRITE = 'overwrite', // Overwrite existing files
  RENAME = 'rename',       // Rename with suffix (file_copy_1.txt)
  FAIL = 'fail'           // Fail if collision detected
}

// Zod schema for input validation
const copyFileSchema = z.object({
  source: z.string().min(1, 'Source path is required'),
  destination: z.string().min(1, 'Destination path is required'),
  recursive: z.boolean().optional().default(false),
  collisionStrategy: z.nativeEnum(CollisionStrategy).optional().default(CollisionStrategy.FAIL),
  preserveTimestamps: z.boolean().optional().default(true),
  followSymlinks: z.boolean().optional().default(false)
});

// Type for validated input
type CopyFileInput = z.infer<typeof copyFileSchema>;

// Copy operation result
interface CopyResult {
  success: boolean;
  operation: 'copy';
  source: string;
  destination: string;
  itemsProcessed: number;
  itemsSkipped: number;
  errors: string[];
  warnings: string[];
  renamedItems: Array<{ original: string; renamed: string }>;
}

export class CopyFileTool {
  public readonly name = 'copy_file';
  public readonly description = 'Copy files or directories with collision handling and progress tracking';
  
  public readonly inputSchema = copyFileSchema;

  private pathValidator: PathValidator;
  private configManager: ConfigurationManager;
  private fileValidator: FileValidator;

  constructor(pathValidator: PathValidator, configManager?: ConfigurationManager) {
    this.pathValidator = pathValidator;
    this.configManager = configManager || ConfigurationManager.getInstance();
    this.fileValidator = new FileValidator(this.configManager);
  }

  /**
   * Main handler for the copy_file tool
   */
  public async handler(args: any): Promise<McpContent[]> {
    // Validate and parse input with defaults
    const parseResult = copyFileSchema.safeParse(args);
    if (!parseResult.success) {
      return this.createErrorResponse(
        `Invalid input: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
        'validation'
      );
    }
    
    const validatedArgs = parseResult.data;
    try {
      // Step 1: Validate source path
      const sourceValidation = this.pathValidator.validatePath(validatedArgs.source);
      if (!sourceValidation.isValid) {
        return this.createErrorResponse(
          `Invalid source path: ${sourceValidation.error || 'Path validation failed'}`,
          'validation'
        );
      }

      // Step 2: Validate destination path
      const destValidation = this.pathValidator.validatePath(validatedArgs.destination);
      if (!destValidation.isValid) {
        return this.createErrorResponse(
          `Invalid destination path: ${destValidation.error || 'Path validation failed'}`,
          'validation'
        );
      }

      const sourcePath = sourceValidation.resolvedPath!;
      const destPath = destValidation.resolvedPath!;

      // Step 3: Check if source exists
      if (!fs.existsSync(sourcePath)) {
        return this.createErrorResponse(
          `Source does not exist: ${validatedArgs.source}`,
          'filesystem'
        );
      }

      // Step 4: Get source stats
      const sourceStats = fs.lstatSync(sourcePath);
      const isDirectory = sourceStats.isDirectory();
      const isSymlink = sourceStats.isSymbolicLink();

      // Step 5: Handle symlinks
      if (isSymlink && !validatedArgs.followSymlinks) {
        return this.createErrorResponse(
          'Source is a symbolic link. Use followSymlinks option to copy symlink targets.',
          'validation'
        );
      }

      // Step 6: Validate directory copying
      if (isDirectory && !validatedArgs.recursive) {
        return this.createErrorResponse(
          'Source is a directory. Use recursive option to copy directories.',
          'validation'
        );
      }

      // Step 7: Validate file restrictions
      if (!isDirectory) {
        const fileValidationResult = this.fileValidator.validateFile(sourcePath, {
          checkSize: true,
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
      }

      // Step 8: Perform the copy operation
      const copyResult = await this.performCopy(
        sourcePath,
        destPath,
        validatedArgs,
        sourceStats
      );

      // Step 9: Return success response
      return this.createSuccessResponse(copyResult, validatedArgs);

    } catch (error) {
      return this.handleError(error, validatedArgs.source, validatedArgs.destination);
    }
  }

  /**
   * Perform the actual copy operation
   */
  private async performCopy(
    sourcePath: string,
    destPath: string,
    options: CopyFileInput,
    sourceStats: fs.Stats
  ): Promise<CopyResult> {
    const result: CopyResult = {
      success: true,
      operation: 'copy',
      source: options.source,
      destination: options.destination,
      itemsProcessed: 0,
      itemsSkipped: 0,
      errors: [],
      warnings: [],
      renamedItems: []
    };

    if (sourceStats.isDirectory()) {
      await this.copyDirectory(sourcePath, destPath, options, result);
    } else {
      await this.copyFile(sourcePath, destPath, options, result);
    }

    return result;
  }

  /**
   * Copy a single file
   */
  private async copyFile(
    sourcePath: string,
    destPath: string,
    options: CopyFileInput,
    result: CopyResult
  ): Promise<void> {
    try {
      // Handle collision detection
      const finalDestPath = await this.handleCollision(destPath, options, result);
      if (!finalDestPath) {
        result.itemsSkipped++;
        return;
      }

      // Ensure destination directory exists
      const destDir = path.dirname(finalDestPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy the file
      fs.copyFileSync(sourcePath, finalDestPath);

      // Preserve timestamps if requested
      if (options.preserveTimestamps) {
        const sourceStats = fs.statSync(sourcePath);
        fs.utimesSync(finalDestPath, sourceStats.atime, sourceStats.mtime);
      }

      result.itemsProcessed++;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to copy ${sourcePath}: ${errorMessage}`);
      result.success = false;
    }
  }

  /**
   * Copy a directory recursively
   */
  private async copyDirectory(
    sourcePath: string,
    destPath: string,
    options: CopyFileInput,
    result: CopyResult
  ): Promise<void> {
    try {
      // Create destination directory if it doesn't exist
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }

      // Read directory contents
      const items = fs.readdirSync(sourcePath);

      for (const item of items) {
        const sourceItemPath = path.join(sourcePath, item);
        const destItemPath = path.join(destPath, item);

        try {
          const itemStats = fs.lstatSync(sourceItemPath);

          if (itemStats.isDirectory()) {
            // Recursively copy subdirectory
            await this.copyDirectory(sourceItemPath, destItemPath, options, result);
          } else if (itemStats.isSymbolicLink() && !options.followSymlinks) {
            // Skip symlinks if not following them
            result.warnings.push(`Skipped symbolic link: ${sourceItemPath}`);
            result.itemsSkipped++;
          } else {
            // Copy file
            await this.copyFile(sourceItemPath, destItemPath, options, result);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to process ${sourceItemPath}: ${errorMessage}`);
          result.success = false;
        }
      }

      // Preserve directory timestamps if requested
      if (options.preserveTimestamps) {
        const sourceStats = fs.statSync(sourcePath);
        fs.utimesSync(destPath, sourceStats.atime, sourceStats.mtime);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Failed to copy directory ${sourcePath}: ${errorMessage}`);
      result.success = false;
    }
  }

  /**
   * Handle file collision based on strategy
   */
  private async handleCollision(
    destPath: string,
    options: CopyFileInput,
    result: CopyResult
  ): Promise<string | null> {
    if (!fs.existsSync(destPath)) {
      return destPath; // No collision
    }

    switch (options.collisionStrategy) {
      case CollisionStrategy.SKIP:
        result.warnings.push(`Skipped existing file: ${destPath}`);
        return null;

      case CollisionStrategy.OVERWRITE:
        result.warnings.push(`Overwriting existing file: ${destPath}`);
        return destPath;

      case CollisionStrategy.RENAME:
        const renamedPath = this.generateUniqueName(destPath);
        result.renamedItems.push({
          original: destPath,
          renamed: renamedPath
        });
        return renamedPath;

      case CollisionStrategy.FAIL:
      default:
        throw new Error(`Destination already exists: ${destPath}`);
    }
  }

  /**
   * Generate a unique filename by adding a suffix
   */
  private generateUniqueName(filePath: string): string {
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);

    let counter = 1;
    let newPath: string;

    do {
      newPath = path.join(dir, `${baseName}_copy_${counter}${ext}`);
      counter++;
    } while (fs.existsSync(newPath));

    return newPath;
  }

  /**
   * Create a successful response with copy results
   */
  private createSuccessResponse(result: CopyResult, args: CopyFileInput): McpContent[] {
    const summary = [
      `Copy operation completed: ${args.source} → ${args.destination}`,
      `Items processed: ${result.itemsProcessed}`,
      `Items skipped: ${result.itemsSkipped}`
    ];

    if (result.errors.length > 0) {
      summary.push(`Errors: ${result.errors.length}`);
    }

    if (result.warnings.length > 0) {
      summary.push(`Warnings: ${result.warnings.length}`);
    }

    if (result.renamedItems.length > 0) {
      summary.push(`Items renamed: ${result.renamedItems.length}`);
    }

    const textContent: McpTextContent = {
      type: 'text',
      text: summary.join('\n')
    };

    // Include detailed results as a resource
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `copy-result://${Date.now()}`,
        mimeType: 'application/json',
        text: JSON.stringify(result, null, 2)
      }
    };

    const content: McpContent[] = [textContent, resourceContent];

    // Add warnings and errors if any
    if (result.warnings.length > 0 || result.errors.length > 0) {
      const issuesText = [];
      
      if (result.warnings.length > 0) {
        issuesText.push('Warnings:');
        result.warnings.forEach(warning => issuesText.push(`- ${warning}`));
      }
      
      if (result.errors.length > 0) {
        issuesText.push('Errors:');
        result.errors.forEach(error => issuesText.push(`- ${error}`));
      }

      content.push({
        type: 'text',
        text: issuesText.join('\n')
      });
    }

    return content;
  }

  /**
   * Create an error response in MCP format
   */
  private createErrorResponse(message: string, errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system'): McpContent[] {
    let recommendations: string[] = [];
    
    switch (errorType) {
      case 'security':
        recommendations = [
          'Ensure both source and destination are within allowed directories',
          'Check that paths do not contain traversal sequences like "../"',
          'Verify that the security level allows the requested operation',
          'Use absolute paths when possible'
        ];
        break;
      case 'permission':
        recommendations = [
          'Check file and directory permissions for both source and destination',
          'Ensure the application has read access to source and write access to destination',
          'Verify that parent directories exist and are writable',
          'Check if files are locked or in use by other processes'
        ];
        break;
      case 'filesystem':
        recommendations = [
          'Verify that the source file or directory exists',
          'Check that the destination directory exists or can be created',
          'Ensure sufficient disk space is available',
          'Verify that the filesystem supports the operation'
        ];
        break;
      case 'validation':
        recommendations = [
          'Check that source and destination paths are valid',
          'Use recursive option for directory copying',
          'Use followSymlinks option for symbolic link handling',
          'Choose appropriate collision strategy for existing files'
        ];
        break;
      case 'system':
        recommendations = [
          'Check system resources and available memory',
          'Verify that the filesystem is not corrupted',
          'Try the operation again or restart the application',
          'Check system logs for additional error information'
        ];
        break;
    }

    const errorContent: McpTextContent = {
      type: 'text',
      text: `Error copying file: ${message}\n\nRecommendations:\n${recommendations.map(r => `- ${r}`).join('\n')}`
    };

    return [errorContent];
  }

  /**
   * Handle unexpected errors during copy operation
   */
  private handleError(error: unknown, source: string, destination: string): McpContent[] {
    let errorMessage = 'Unknown error occurred';
    let errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system' = 'system';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Classify common error types
      if (error.message.includes('ENOENT')) {
        errorType = 'filesystem';
        errorMessage = 'Source file or directory does not exist';
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        errorType = 'permission';
        errorMessage = 'Permission denied - insufficient access rights';
      } else if (error.message.includes('ENOSPC')) {
        errorType = 'filesystem';
        errorMessage = 'No space left on device';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        errorType = 'system';
        errorMessage = 'Too many open files';
      } else if (error.message.includes('EEXIST')) {
        errorType = 'filesystem';
        errorMessage = 'Destination already exists';
      } else if (error.message.includes('EISDIR')) {
        errorType = 'filesystem';
        errorMessage = 'Cannot copy directory without recursive option';
      }
    }

    return this.createErrorResponse(
      `${errorMessage} (${source} → ${destination})`,
      errorType
    );
  }

  /**
   * Static factory method to create CopyFileTool with default macOS PathValidator
   */
  public static createForMacOS(): CopyFileTool {
    const pathValidator = PathValidator.createFromConfiguration();
    return new CopyFileTool(pathValidator);
  }
}