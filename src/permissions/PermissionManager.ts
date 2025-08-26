/**
 * PermissionManager Class
 * Handles macOS permission detection and user guidance
 * Provides Full Disk Access detection without TCC database modification
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PermissionStatus } from '../types/index';

export class PermissionManager {
  private homeDir: string;
  private documentsDir: string;
  private desktopDir: string;

  constructor() {
    this.homeDir = os.homedir();
    this.documentsDir = path.join(this.homeDir, 'Documents');
    this.desktopDir = path.join(this.homeDir, 'Desktop');
  }

  /**
   * Checks overall permission status including Full Disk Access
   */
  public async checkPermissions(): Promise<PermissionStatus> {
    const hasFullDiskAccess = await this.detectFullDiskAccess();
    const canAccessDocuments = await this.checkDirectoryAccess(this.documentsDir);
    const canAccessDesktop = await this.checkDirectoryAccess(this.desktopDir);

    const recommendations = this.generateRecommendations(
      hasFullDiskAccess,
      canAccessDocuments,
      canAccessDesktop
    );

    return {
      hasFullDiskAccess,
      canAccessDocuments,
      canAccessDesktop,
      recommendations
    };
  }

  /**
   * Detects Full Disk Access using system hints
   * Uses indirect methods to avoid TCC database access
   */
  public async detectFullDiskAccess(): Promise<boolean> {
    try {
      // Method 1: Try to access a system directory that requires FDA
      // This is a non-intrusive way to detect FDA without modifying anything
      const testPaths = [
        '/Library/Application Support',
        '/System/Library/CoreServices',
        path.join(this.homeDir, 'Library', 'Mail'),
        path.join(this.homeDir, 'Library', 'Safari')
      ];

      for (const testPath of testPaths) {
        try {
          if (fs.existsSync(testPath)) {
            // Try to read the directory - this requires FDA for some system paths
            await fs.promises.access(testPath, fs.constants.R_OK);
            
            // If we can read system directories, we likely have FDA
            if (testPath.startsWith('/System/') || testPath.startsWith('/Library/')) {
              return true;
            }
          }
        } catch {
          // Access denied - continue to next test
          continue;
        }
      }

      // Method 2: Check if we can access protected user directories
      const protectedPaths = [
        path.join(this.homeDir, 'Library', 'Mail'),
        path.join(this.homeDir, 'Library', 'Safari', 'History.db'),
        path.join(this.homeDir, 'Library', 'Messages')
      ];

      let accessibleProtectedPaths = 0;
      for (const protectedPath of protectedPaths) {
        try {
          if (fs.existsSync(protectedPath)) {
            await fs.promises.access(protectedPath, fs.constants.R_OK);
            accessibleProtectedPaths++;
          }
        } catch {
          // Expected for paths that require FDA
        }
      }

      // If we can access multiple protected paths, we likely have FDA
      return accessibleProtectedPaths >= 2;

    } catch (error) {
      // If we can't determine FDA status, assume we don't have it
      console.warn('Could not determine Full Disk Access status:', error);
      return false;
    }
  }

  /**
   * Checks if we can access a specific directory
   */
  public async checkDirectoryAccess(directoryPath: string): Promise<boolean> {
    try {
      // Check if directory exists
      if (!fs.existsSync(directoryPath)) {
        return false;
      }

      // Check if we can read the directory
      await fs.promises.access(directoryPath, fs.constants.R_OK);
      
      // Check if we can write to the directory (create a temporary file)
      const testFile = path.join(directoryPath, '.mcp-test-' + Date.now());
      try {
        await fs.promises.writeFile(testFile, 'test', { flag: 'wx' });
        await fs.promises.unlink(testFile);
        return true;
      } catch {
        // Can read but not write - still consider it accessible for read operations
        return true;
      }

    } catch {
      return false;
    }
  }

  /**
   * Generates setup instructions for enabling Full Disk Access
   */
  public generateSetupInstructions(): string[] {
    return [
      '1. Open System Preferences (or System Settings on macOS Ventura+)',
      '2. Navigate to Security & Privacy → Privacy (or Privacy & Security)',
      '3. Click on "Full Disk Access" in the left sidebar',
      '4. Click the lock icon and enter your password to make changes',
      '5. Click the "+" button to add an application',
      '6. Navigate to and select your terminal application (Terminal.app, iTerm2, etc.)',
      '7. Alternatively, select the Node.js binary if running directly',
      '8. Ensure the checkbox next to the application is checked',
      '9. Close System Preferences',
      '10. Restart your terminal application',
      '11. Run the MCP server again to verify access'
    ];
  }

  /**
   * Generates contextual recommendations based on permission status
   */
  private generateRecommendations(
    hasFullDiskAccess: boolean,
    canAccessDocuments: boolean,
    canAccessDesktop: boolean
  ): string[] {
    const recommendations: string[] = [];

    if (!hasFullDiskAccess) {
      recommendations.push(
        'Enable Full Disk Access for complete filesystem access',
        'Follow the setup instructions to grant Full Disk Access',
        'Restart your terminal application after enabling permissions'
      );
    }

    if (!canAccessDocuments) {
      recommendations.push(
        'Documents directory is not accessible',
        'Check folder permissions for ~/Documents',
        'Ensure the directory exists and is readable'
      );
    }

    if (!canAccessDesktop) {
      recommendations.push(
        'Desktop directory is not accessible',
        'Check folder permissions for ~/Desktop',
        'Ensure the directory exists and is readable'
      );
    }

    if (hasFullDiskAccess && canAccessDocuments && canAccessDesktop) {
      recommendations.push(
        'All permissions are properly configured',
        'MCP filesystem connector is ready to use'
      );
    }

    return recommendations;
  }

  /**
   * Provides detailed permission status report
   */
  public async generatePermissionReport(): Promise<string> {
    const status = await this.checkPermissions();
    
    const report = [
      '=== MCP Filesystem Perplexity Permission Report ===',
      '',
      `Full Disk Access: ${status.hasFullDiskAccess ? '✅ Enabled' : '❌ Disabled'}`,
      `Documents Access: ${status.canAccessDocuments ? '✅ Available' : '❌ Unavailable'}`,
      `Desktop Access: ${status.canAccessDesktop ? '✅ Available' : '❌ Unavailable'}`,
      '',
      'Recommendations:',
      ...status.recommendations.map(rec => `• ${rec}`),
      ''
    ];

    if (!status.hasFullDiskAccess) {
      report.push(
        'Setup Instructions:',
        ...this.generateSetupInstructions().map(instruction => `  ${instruction}`),
        ''
      );
    }

    return report.join('\n');
  }

  /**
   * Checks if the system meets minimum requirements
   */
  public async meetsMinimumRequirements(): Promise<boolean> {
    const status = await this.checkPermissions();
    
    // Minimum requirement: access to at least one of the allowed directories
    return status.canAccessDocuments || status.canAccessDesktop;
  }

  /**
   * Provides troubleshooting information for common issues
   */
  public generateTroubleshootingGuide(): string[] {
    return [
      'Common Issues and Solutions:',
      '',
      '1. "Permission denied" errors:',
      '   • Enable Full Disk Access in System Preferences',
      '   • Restart your terminal application',
      '   • Check that the correct application is added to Full Disk Access',
      '',
      '2. Documents/Desktop not accessible:',
      '   • Verify the directories exist in your home folder',
      '   • Check folder permissions with: ls -la ~/',
      '   • Ensure you\'re running as the correct user',
      '',
      '3. Full Disk Access not working:',
      '   • Make sure you added the correct application (Terminal, iTerm2, etc.)',
      '   • Try adding the Node.js binary directly',
      '   • Restart the application after granting permissions',
      '   • Check System Preferences → Security & Privacy for any prompts',
      '',
      '4. macOS version compatibility:',
      '   • macOS 10.14+ required for Full Disk Access',
      '   • Older versions may have different permission models',
      '   • Check Apple\'s documentation for your macOS version',
      '',
      '5. Still having issues?',
      '   • Run: npm run inspect to test the connection',
      '   • Check the console for detailed error messages',
      '   • Verify your macOS version and security settings'
    ];
  }

  /**
   * Static factory method to create PermissionManager
   */
  public static create(): PermissionManager {
    return new PermissionManager();
  }

  /**
   * Gets the home directory path
   */
  public getHomeDirectory(): string {
    return this.homeDir;
  }

  /**
   * Gets the Documents directory path
   */
  public getDocumentsDirectory(): string {
    return this.documentsDir;
  }

  /**
   * Gets the Desktop directory path
   */
  public getDesktopDirectory(): string {
    return this.desktopDir;
  }
}