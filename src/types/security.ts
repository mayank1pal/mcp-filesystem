/**
 * Security and Path Validation Types
 * Handles security validation and audit logging
 */

export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  error?: string | undefined;
  securityViolation?: boolean | undefined;
}

export interface SecurityEvent {
  timestamp: Date;
  type: 'path_traversal' | 'unauthorized_access' | 'permission_denied';
  attemptedPath: string;
  resolvedPath?: string | undefined;
  clientInfo?: string | undefined;
}

export interface PermissionStatus {
  hasFullDiskAccess: boolean;
  canAccessDocuments: boolean;
  canAccessDesktop: boolean;
  recommendations: string[];
}

/**
 * Security validation options
 */
export interface ValidationOptions {
  allowedPrefixes: string[];
  enableAuditLogging: boolean;
  strictMode: boolean;
}

/**
 * Security audit log entry
 */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  event: SecurityEvent;
  severity: 'low' | 'medium' | 'high' | 'critical';
  handled: boolean;
}