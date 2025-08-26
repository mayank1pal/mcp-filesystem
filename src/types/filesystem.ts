/**
 * File System Entity Types
 * Represents filesystem objects and operations
 */

export interface FileSystemEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  permissions?: {
    readable: boolean;
    writable: boolean;
  };
}

export interface DirectoryListing {
  path: string;
  entries: FileSystemEntry[];
  totalCount: number;
}

/**
 * File operation result types
 */
export interface FileReadResult {
  success: boolean;
  content?: string;
  isBinary?: boolean;
  mimeType?: string;
  error?: string;
}

export interface FileWriteResult {
  success: boolean;
  bytesWritten?: number;
  error?: string;
}

export interface DirectoryListResult {
  success: boolean;
  listing?: DirectoryListing;
  error?: string;
}