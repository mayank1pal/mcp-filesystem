/**
 * File Validator
 * Enhanced file validation including size, type, and content restrictions
 */

import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager } from '../config/ConfigurationManager';
import { SecurityLevel } from '../config/types';

// MIME type mappings for common file extensions
const MIME_TYPE_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.ts': 'application/typescript',
  '.py': 'text/x-python',
  '.html': 'text/html',
  '.css': 'text/css',
  '.md': 'text/markdown',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.exe': 'application/x-msdownload',
  '.bat': 'application/x-bat',
  '.sh': 'application/x-sh'
};

// Dangerous file extensions
const DANGEROUS_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.pif', '.scr', '.vbs', '.vbe', 
  '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh', '.ps1', '.ps1xml', 
  '.ps2', '.ps2xml', '.psc1', '.psc2', '.msh', '.msh1', '.msh2', 
  '.mshxml', '.msh1xml', '.msh2xml', '.scf', '.lnk', '.inf', 
  '.reg', '.dll', '.cpl', '.jar', '.app', '.deb', '.rpm', '.dmg'
];

// File categories
export enum FileCategory {
  TEXT = 'text',
  CODE = 'code',
  IMAGE = 'image',
  DOCUMENT = 'document',
  ARCHIVE = 'archive',
  EXECUTABLE = 'executable',
  MEDIA = 'media',
  UNKNOWN = 'unknown'
}

// File validation result
export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  fileInfo?: {
    extension: string;
    mimeType: string;
    category: FileCategory;
    size?: number;
  };
}

// File validation options
export interface FileValidationOptions {
  checkSize?: boolean;
  checkExtension?: boolean;
  checkMimeType?: boolean;
  maxSize?: number;
  allowedExtensions?: string[];
  blockedExtensions?: string[];
  allowedMimeTypes?: string[];
  blockedMimeTypes?: string[];
  allowedCategories?: FileCategory[];
  blockedCategories?: FileCategory[];
}

export class FileValidator {
  private configManager: ConfigurationManager;

  constructor(configManager?: ConfigurationManager) {
    this.configManager = configManager || ConfigurationManager.getInstance();
  }

  /**
   * Validate a file based on current configuration
   */
  public validateFile(filePath: string, options?: FileValidationOptions): FileValidationResult {
    const config = this.configManager.getConfiguration();
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = this.getMimeType(extension);
    const category = this.getFileCategory(extension, mimeType);
    const warnings: string[] = [];

    // Get file size if file exists
    let fileSize: number | undefined;
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
      }
    } catch (error) {
      // File doesn't exist or can't be accessed - this is okay for write operations
    }

    const fileInfo = {
      extension,
      mimeType,
      category,
      ...(fileSize !== undefined && { size: fileSize })
    };

    // Check file size
    if (options?.checkSize !== false && fileSize !== undefined) {
      const maxSize = options?.maxSize || this.configManager.getMaxFileSizeBytes();
      if (fileSize > maxSize) {
        return {
          isValid: false,
          error: `File too large: ${this.formatFileSize(fileSize)} (max: ${this.formatFileSize(maxSize)})`,
          fileInfo
        };
      }
    }

    // Check extension restrictions
    if (options?.checkExtension !== false && extension) {
      // Check custom blocked extensions first
      const blockedExtensions = options?.blockedExtensions || config.blockedExtensions;
      if (blockedExtensions.includes(extension)) {
        return {
          isValid: false,
          error: `File extension blocked: ${extension}`,
          fileInfo
        };
      }

      // Check custom allowed extensions
      const allowedExtensions = options?.allowedExtensions || config.allowedExtensions;
      if (!allowedExtensions.includes('*') && !allowedExtensions.includes(extension)) {
        return {
          isValid: false,
          error: `File extension not allowed: ${extension}`,
          fileInfo
        };
      }

      // Security level specific checks
      if (config.securityLevel === SecurityLevel.STRICT && DANGEROUS_EXTENSIONS.includes(extension)) {
        return {
          isValid: false,
          error: `Dangerous file extension blocked in strict mode: ${extension}`,
          fileInfo
        };
      }
    }

    // Check MIME type restrictions
    if (options?.checkMimeType !== false && mimeType) {
      // Check blocked MIME types
      const blockedMimeTypes = options?.blockedMimeTypes || [];
      if (blockedMimeTypes.includes(mimeType)) {
        return {
          isValid: false,
          error: `MIME type blocked: ${mimeType}`,
          fileInfo
        };
      }

      // Check allowed MIME types
      const allowedMimeTypes = options?.allowedMimeTypes;
      if (allowedMimeTypes && allowedMimeTypes.length > 0 && !allowedMimeTypes.includes(mimeType)) {
        return {
          isValid: false,
          error: `MIME type not allowed: ${mimeType}`,
          fileInfo
        };
      }
    }

    // Check file category restrictions
    if (category !== FileCategory.UNKNOWN) {
      // Check blocked categories
      const blockedCategories = options?.blockedCategories || [];
      if (blockedCategories.includes(category)) {
        return {
          isValid: false,
          error: `File category blocked: ${category}`,
          fileInfo
        };
      }

      // Check allowed categories
      const allowedCategories = options?.allowedCategories;
      if (allowedCategories && allowedCategories.length > 0 && !allowedCategories.includes(category)) {
        return {
          isValid: false,
          error: `File category not allowed: ${category}`,
          fileInfo
        };
      }

      // Security warnings for certain categories
      if (config.securityLevel === SecurityLevel.STRICT) {
        if (category === FileCategory.EXECUTABLE) {
          warnings.push('Executable files may pose security risks');
        } else if (category === FileCategory.ARCHIVE) {
          warnings.push('Archive files may contain executable content');
        }
      }
    }

    const result: FileValidationResult = {
      isValid: true,
      fileInfo
    };
    
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    
    return result;
  }

  /**
   * Get MIME type for a file extension
   */
  public getMimeType(extension: string): string {
    return MIME_TYPE_MAP[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Get file category based on extension and MIME type
   */
  public getFileCategory(extension: string, mimeType?: string): FileCategory {
    const ext = extension.toLowerCase();
    const mime = mimeType || this.getMimeType(ext);

    if (mime.startsWith('text/') || ['.txt', '.md', '.csv'].includes(ext)) {
      return FileCategory.TEXT;
    }
    
    if (mime.includes('javascript') || mime.includes('typescript') || 
        ['.js', '.ts', '.py', '.html', '.css'].includes(ext)) {
      return FileCategory.CODE;
    }
    
    if (mime.startsWith('image/')) {
      return FileCategory.IMAGE;
    }
    
    if (mime.includes('pdf') || mime.includes('msword') || mime.includes('excel') || 
        mime.includes('powerpoint') || mime.includes('officedocument')) {
      return FileCategory.DOCUMENT;
    }
    
    if (mime.includes('zip') || mime.includes('tar') || mime.includes('gzip') || 
        mime.includes('rar') || mime.includes('7z') || ['.zip', '.tar', '.gz', '.rar', '.7z'].includes(ext)) {
      return FileCategory.ARCHIVE;
    }
    
    if (DANGEROUS_EXTENSIONS.includes(ext) || mime.includes('executable') || 
        mime.includes('msdownload') || mime.includes('x-sh') || mime.includes('x-bat')) {
      return FileCategory.EXECUTABLE;
    }
    
    if (mime.startsWith('audio/') || mime.startsWith('video/')) {
      return FileCategory.MEDIA;
    }

    return FileCategory.UNKNOWN;
  }

  /**
   * Check if a file extension is considered dangerous
   */
  public isDangerousExtension(extension: string): boolean {
    return DANGEROUS_EXTENSIONS.includes(extension.toLowerCase());
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
  }
}