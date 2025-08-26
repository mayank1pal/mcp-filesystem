/**
 * DeleteFileTool Class
 * MCP-compliant tool for deleting files and directories with confirmation system
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { McpContent, McpTextContent, McpResourceContent } from '../types/index';
import { PathValidator } from '../security/PathValidator';
import { ConfigurationManager } from '../config/ConfigurationManager';

// Confirmation strategies
export enum ConfirmationStrategy {
  NONE = 'none',           // No confirmation required
  PROMPT = 'prompt',       // Require explicit confirmation
  DRY_RUN = 'dry_run',     // Show what would be deleted without deleting
  SAFE_MODE = 'safe_mode'  // Extra safety checks and confirmations
}

// Recovery information for undo operations
interface RecoveryInfo {
  originalPath: string;
  isDirectory: boolean;
  size: number;
  permissions: string;
  owner?: string;
  group?: string;
  modified: Date;
  created?: Date;
  backupPath?: string; // For potential recovery
}

// Zod schema for input validation
const deleteFileSchema = z.object({
  path: z.union([
    z.string().min(1, 'Path is required'),
    z.array(z.string().min(1, 'Each path must be non-empty')).min(1, 'At least one path is required')
  ]),
  recursive: z.boolean().optional().default(false),
  confirmationStrategy: z.nativeEnum(ConfirmationStrategy).optional().default(ConfirmationStrategy.PROMPT),
  force: z.boolean().optional().default(false),
  createBackup: z.boolean().optional().default(false),
  backupDirectory: z.string().optional(),
  dryRun: z.boolean().optional().default(false)
});

// Type for validated input
type DeleteFileInput = z.infer<typeof deleteFileSchema>;

// Delete operation result
interface DeleteResult {
  success: boolean;
  operation: 'delete';
  paths: string[];
  itemsDeleted: number;
  itemsSkipped: number;
  totalSize: number;
  errors: string[];
  warnings: string[];
  recoveryInfo: RecoveryInfo[];
  backupsCreated: string[];
  dryRun: boolean;
}

export class DeleteFileTool {
  public readonly name = 'delete_file';
  public readonly description = 'Delete files or directories with confirmation system and recovery information';
  
  public readonly inputSchema = deleteFileSchema;

  private pathValidator: PathValidator;
  private configManager: ConfigurationManager; // Used for configuration-based validation

  constructor(pathValidator: PathValidator, configManager?: ConfigurationManager) {
    this.pathValidator = pathValidator;
    this.configManager = configManager || ConfigurationManager.getInstance();
  }

  /**
   * Main handler for the delete_file tool
   */
  public async handler(args: any): Promise<McpContent[]> {
    // Validate and parse input with defaults
    const parseResult = deleteFileSchema.safeParse(args);
    if (!parseResult.success) {
      return this.createErrorResponse(
        `Invalid input: ${parseResult.error.errors.map(e => e.message).join(', ')}`,
        'validation'
      );
    }
    
    const validatedArgs = parseResult.data;

    try {
      // Normalize paths to array
      const paths = Array.isArray(validatedArgs.path) ? validatedArgs.path : [validatedArgs.path];

      // Step 1: Validate all paths
      const validatedPaths: string[] = [];
      for (const inputPath of paths) {
        const pathValidation = this.pathValidator.validatePath(inputPath);
        if (!pathValidation.isValid) {
          return this.createErrorResponse(
            `Invalid path: ${inputPath} - ${pathValidation.error || 'Path validation failed'}`,
            'validation'
          );
        }
        validatedPaths.push(pathValidation.resolvedPath!);
      }

      // Step 2: Check if all paths exist and gather information
      const pathsInfo: Array<{ path: string; stats: fs.Stats; exists: boolean }> = [];
      for (const resolvedPath of validatedPaths) {
        const exists = fs.existsSync(resolvedPath);
        if (!exists) {
          return this.createErrorResponse(
            `Path does not exist: ${resolvedPath}`,
            'filesystem'
          );
        }
        
        const stats = fs.lstatSync(resolvedPath);
        pathsInfo.push({ path: resolvedPath, stats, exists });
      }

      // Step 3: Validate directory deletion requirements
      for (const info of pathsInfo) {
        if (info.stats.isDirectory() && !validatedArgs.recursive) {
          return this.createErrorResponse(
            `Path is a directory. Use recursive option to delete directories: ${info.path}`,
            'validation'
          );
        }
      }

      // Step 4: Apply confirmation strategy
      const confirmationResult = await this.handleConfirmation(
        pathsInfo,
        validatedArgs
      );
      
      if (!confirmationResult.confirmed) {
        return this.createErrorResponse(
          confirmationResult.message || 'Operation cancelled by confirmation strategy',
          'validation'
        );
      }

      // Step 5: Perform the delete operation
      const deleteResult = await this.performDelete(
        pathsInfo,
        validatedArgs
      );

      // Step 6: Return success response
      return this.createSuccessResponse(deleteResult);

    } catch (error) {
      return this.handleError(error, validatedArgs.path);
    }
  }

  /**
   * Handle confirmation strategy
   */
  private async handleConfirmation(
    pathsInfo: Array<{ path: string; stats: fs.Stats; exists: boolean }>,
    options: DeleteFileInput
  ): Promise<{ confirmed: boolean; message?: string }> {
    const totalItems = pathsInfo.length;
    const totalSize = pathsInfo.reduce((sum, info) => sum + (info.stats.size || 0), 0);
    const hasDirectories = pathsInfo.some(info => info.stats.isDirectory());

    // Get configuration for safety limits
    const config = this.configManager.getConfiguration();
    const maxFileSize = this.parseFileSize(config.maxFileSize || '100MB');

    switch (options.confirmationStrategy) {
      case ConfirmationStrategy.NONE:
        return { confirmed: true };

      case ConfirmationStrategy.PROMPT:
        // In a real implementation, this would prompt the user
        // For now, we'll require the 'force' flag to proceed
        if (!options.force) {
          return {
            confirmed: false,
            message: `Confirmation required to delete ${totalItems} item(s) (${this.formatSize(totalSize)}). Use 'force: true' to proceed.`
          };
        }
        return { confirmed: true };

      case ConfirmationStrategy.DRY_RUN:
        // Always run in dry-run mode regardless of the dryRun flag
        return { confirmed: true };

      case ConfirmationStrategy.SAFE_MODE:
        // Extra safety checks
        if (hasDirectories && !options.recursive) {
          return {
            confirmed: false,
            message: 'Safe mode: Cannot delete directories without recursive flag'
          };
        }
        
        if (totalSize > maxFileSize && !options.force) {
          return {
            confirmed: false,
            message: `Safe mode: Large deletion (${this.formatSize(totalSize)}) requires 'force: true'`
          };
        }
        
        if (totalItems > 10 && !options.force) {
          return {
            confirmed: false,
            message: `Safe mode: Bulk deletion (${totalItems} items) requires 'force: true'`
          };
        }
        
        return { confirmed: true };

      default:
        return { confirmed: false, message: 'Unknown confirmation strategy' };
    }
  }

  /**
   * Perform the actual delete operation
   */
  private async performDelete(
    pathsInfo: Array<{ path: string; stats: fs.Stats; exists: boolean }>,
    options: DeleteFileInput
  ): Promise<DeleteResult> {
    const result: DeleteResult = {
      success: true,
      operation: 'delete',
      paths: pathsInfo.map(info => info.path),
      itemsDeleted: 0,
      itemsSkipped: 0,
      totalSize: 0,
      errors: [],
      warnings: [],
      recoveryInfo: [],
      backupsCreated: [],
      dryRun: options.dryRun || options.confirmationStrategy === ConfirmationStrategy.DRY_RUN
    };

    for (const info of pathsInfo) {
      try {
        // Gather recovery information before deletion
        const recoveryInfo = await this.gatherRecoveryInfo(info.path, info.stats);
        result.recoveryInfo.push(recoveryInfo);

        // Create backup if requested
        if (options.createBackup && !result.dryRun) {
          const backupPath = await this.createBackup(info.path, options.backupDirectory);
          if (backupPath) {
            result.backupsCreated.push(backupPath);
          }
        }

        // Perform deletion (or simulate in dry-run mode)
        if (result.dryRun) {
          result.warnings.push(`DRY RUN: Would delete ${info.path}`);
          result.itemsDeleted++;
          result.totalSize += info.stats.size || 0;
        } else {
          await this.deleteItem(info.path, info.stats.isDirectory(), options.recursive);
          result.itemsDeleted++;
          result.totalSize += info.stats.size || 0;
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(`Failed to delete ${info.path}: ${errorMessage}`);
        result.itemsSkipped++;
        result.success = false;
      }
    }

    return result;
  }

  /**
   * Gather recovery information for potential undo operations
   */
  private async gatherRecoveryInfo(filePath: string, stats: fs.Stats): Promise<RecoveryInfo> {
    const recoveryInfo: RecoveryInfo = {
      originalPath: filePath,
      isDirectory: stats.isDirectory(),
      size: stats.size || 0,
      permissions: stats.mode?.toString(8) || '0644',
      modified: stats.mtime,
      created: stats.birthtime
    };

    // Try to get owner/group information (Unix-like systems)
    try {
      if (stats.uid !== undefined) {
        recoveryInfo.owner = stats.uid.toString();
      }
      if (stats.gid !== undefined) {
        recoveryInfo.group = stats.gid.toString();
      }
    } catch (error) {
      // Owner/group information not available on this system
    }

    return recoveryInfo;
  }

  /**
   * Create a backup of the file/directory before deletion
   */
  private async createBackup(filePath: string, backupDirectory?: string): Promise<string | null> {
    try {
      const fileName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFileName = `${fileName}.backup.${timestamp}`;
      
      const backupDir = backupDirectory || path.join(path.dirname(filePath), '.backups');
      
      // Ensure backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const backupPath = path.join(backupDir, backupFileName);
      
      // Copy the file/directory to backup location
      const stats = fs.lstatSync(filePath);
      if (stats.isDirectory()) {
        await this.copyDirectory(filePath, backupPath);
      } else {
        fs.copyFileSync(filePath, backupPath);
        
        // Preserve timestamps
        fs.utimesSync(backupPath, stats.atime, stats.mtime);
      }
      
      return backupPath;
    } catch (error) {
      console.warn(`Failed to create backup for ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Copy directory recursively for backup
   */
  private async copyDirectory(source: string, destination: string): Promise<void> {
    fs.mkdirSync(destination, { recursive: true });
    
    const items = fs.readdirSync(source);
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      const stats = fs.lstatSync(sourcePath);
      
      if (stats.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
        fs.utimesSync(destPath, stats.atime, stats.mtime);
      }
    }
  }

  /**
   * Delete a single item (file or directory)
   */
  private async deleteItem(itemPath: string, isDirectory: boolean, recursive: boolean): Promise<void> {
    if (isDirectory) {
      if (recursive) {
        // Delete directory recursively
        try {
          const items = fs.readdirSync(itemPath);
          for (const item of items) {
            const itemFullPath = path.join(itemPath, item);
            const itemStats = fs.lstatSync(itemFullPath);
            await this.deleteItem(itemFullPath, itemStats.isDirectory(), recursive);
          }
          fs.rmdirSync(itemPath);
        } catch (error) {
          // If directory reading fails, try to delete it anyway
          fs.rmdirSync(itemPath);
        }
      } else {
        // Try to delete empty directory
        fs.rmdirSync(itemPath);
      }
    } else {
      // Delete file
      fs.unlinkSync(itemPath);
    }
  }

  /**
   * Parse file size string to bytes
   */
  private parseFileSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/i);
    if (!match) {
      return 100 * 1024 * 1024; // Default to 100MB
    }
    
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toUpperCase();
    
    const multipliers: { [key: string]: number } = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
  }

  /**
   * Format file size in human-readable format
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Create a successful response with delete results
   */
  private createSuccessResponse(result: DeleteResult): McpContent[] {
    const summary = [
      `Delete operation ${result.dryRun ? '(DRY RUN) ' : ''}completed`,
      `Items ${result.dryRun ? 'would be ' : ''}deleted: ${result.itemsDeleted}`,
      `Items skipped: ${result.itemsSkipped}`,
      `Total size: ${this.formatSize(result.totalSize)}`
    ];

    if (result.errors.length > 0) {
      summary.push(`Errors: ${result.errors.length}`);
    }

    if (result.warnings.length > 0) {
      summary.push(`Warnings: ${result.warnings.length}`);
    }

    if (result.backupsCreated.length > 0) {
      summary.push(`Backups created: ${result.backupsCreated.length}`);
    }

    const textContent: McpTextContent = {
      type: 'text',
      text: summary.join('\n')
    };

    // Include detailed results as a resource
    const resourceContent: McpResourceContent = {
      type: 'resource',
      resource: {
        uri: `delete-result://${Date.now()}`,
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

    // Add recovery information if available
    if (result.recoveryInfo.length > 0 && !result.dryRun) {
      const recoveryText = [
        'Recovery Information:',
        ...result.recoveryInfo.map(info => 
          `- ${info.originalPath}: ${info.isDirectory ? 'Directory' : 'File'}, ${this.formatSize(info.size)}, Modified: ${info.modified.toISOString()}`
        )
      ];

      content.push({
        type: 'text',
        text: recoveryText.join('\n')
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
          'Ensure the path is within allowed directories',
          'Check that paths do not contain traversal sequences like "../"',
          'Verify that the security level allows the requested operation',
          'Use absolute paths when possible'
        ];
        break;
      case 'permission':
        recommendations = [
          'Check file and directory permissions',
          'Ensure the application has delete access to the target',
          'Verify that parent directories are writable',
          'Check if files are locked or in use by other processes'
        ];
        break;
      case 'filesystem':
        recommendations = [
          'Verify that the file or directory exists',
          'Check that the filesystem is not read-only',
          'Ensure sufficient permissions for the operation',
          'Verify that the filesystem is not corrupted'
        ];
        break;
      case 'validation':
        recommendations = [
          'Check that all required parameters are provided',
          'Use recursive option for directory deletion',
          'Set appropriate confirmation strategy',
          'Use force option if confirmation is required'
        ];
        break;
      case 'system':
        recommendations = [
          'Check system resources and available memory',
          'Verify that the filesystem is accessible',
          'Try the operation again or restart the application',
          'Check system logs for additional error information'
        ];
        break;
    }

    const errorContent: McpTextContent = {
      type: 'text',
      text: `Error deleting file(s): ${message}\n\nRecommendations:\n${recommendations.map(r => `- ${r}`).join('\n')}`
    };

    return [errorContent];
  }

  /**
   * Handle unexpected errors during delete operation
   */
  private handleError(error: unknown, paths: string | string[]): McpContent[] {
    let errorMessage = 'Unknown error occurred';
    let errorType: 'security' | 'permission' | 'filesystem' | 'validation' | 'system' = 'system';

    if (error instanceof Error) {
      errorMessage = error.message;
      
      // Classify common error types
      if (error.message.includes('ENOENT')) {
        errorType = 'filesystem';
        errorMessage = 'File or directory does not exist';
      } else if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
        errorType = 'permission';
        errorMessage = 'Permission denied - insufficient access rights';
      } else if (error.message.includes('EBUSY')) {
        errorType = 'filesystem';
        errorMessage = 'File or directory is busy or locked';
      } else if (error.message.includes('ENOTEMPTY')) {
        errorType = 'filesystem';
        errorMessage = 'Directory is not empty (use recursive option)';
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        errorType = 'system';
        errorMessage = 'Too many open files';
      }
    }

    const pathsStr = Array.isArray(paths) ? paths.join(', ') : paths;
    return this.createErrorResponse(
      `${errorMessage} (${pathsStr})`,
      errorType
    );
  }

  /**
   * Static factory method to create DeleteFileTool with default PathValidator
   */
  public static createWithPathValidator(pathValidator: PathValidator): DeleteFileTool {
    return new DeleteFileTool(pathValidator);
  }

  /**
   * Static factory method to create DeleteFileTool with configuration-based PathValidator
   */
  public static createFromConfiguration(): DeleteFileTool {
    const pathValidator = PathValidator.createFromConfiguration();
    return new DeleteFileTool(pathValidator);
  }
}