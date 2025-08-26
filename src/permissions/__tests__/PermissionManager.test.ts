/**
 * PermissionManager Tests
 * Tests for macOS permission detection and user guidance
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PermissionManager } from '../PermissionManager';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  constants: {
    R_OK: 4
  },
  promises: {
    access: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn()
  }
}));

jest.mock('os', () => ({
  homedir: jest.fn()
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;
const mockOs = os as jest.Mocked<typeof os>;

describe('PermissionManager', () => {
  let permissionManager: PermissionManager;
  let homeDir: string;
  let documentsDir: string;
  let desktopDir: string;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    homeDir = '/Users/testuser';
    documentsDir = path.join(homeDir, 'Documents');
    desktopDir = path.join(homeDir, 'Desktop');
    
    // Mock os.homedir()
    mockOs.homedir.mockReturnValue(homeDir);
    
    permissionManager = new PermissionManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    test('should initialize with correct directory paths', () => {
      expect(permissionManager.getHomeDirectory()).toBe(homeDir);
      expect(permissionManager.getDocumentsDirectory()).toBe(documentsDir);
      expect(permissionManager.getDesktopDirectory()).toBe(desktopDir);
    });

    test('should create instance with factory method', () => {
      const manager = PermissionManager.create();
      expect(manager).toBeInstanceOf(PermissionManager);
      expect(manager.getHomeDirectory()).toBe(homeDir);
    });
  });

  describe('Directory Access Checking', () => {
    test('should return true for accessible directory with read/write access', async () => {
      const testDir = '/test/directory';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await permissionManager.checkDirectoryAccess(testDir);
      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith(testDir);
      expect(mockFsPromises.access).toHaveBeenCalledWith(testDir, fs.constants.R_OK);
    });

    test('should return true for read-only accessible directory', async () => {
      const testDir = '/test/directory';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockRejectedValue(new Error('Permission denied'));

      const result = await permissionManager.checkDirectoryAccess(testDir);
      expect(result).toBe(true);
    });

    test('should return false for non-existent directory', async () => {
      const testDir = '/nonexistent/directory';
      
      mockFs.existsSync.mockReturnValue(false);

      const result = await permissionManager.checkDirectoryAccess(testDir);
      expect(result).toBe(false);
      expect(mockFsPromises.access).not.toHaveBeenCalled();
    });

    test('should return false for inaccessible directory', async () => {
      const testDir = '/restricted/directory';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockRejectedValue(new Error('Permission denied'));

      const result = await permissionManager.checkDirectoryAccess(testDir);
      expect(result).toBe(false);
    });
  });

  describe('Full Disk Access Detection', () => {
    test('should detect Full Disk Access when system directories are accessible', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockFsPromises.access).toHaveBeenCalled();
    });

    test('should detect Full Disk Access when multiple protected paths are accessible', async () => {
      // Mock system directories as inaccessible
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string') {
          return path.includes('Library') && path.includes(homeDir);
        }
        return false;
      });
      
      mockFsPromises.access.mockImplementation(async (path: fs.PathLike) => {
        if (typeof path === 'string' && path.includes('Library')) {
          return Promise.resolve();
        }
        throw new Error('Access denied');
      });

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(true);
    });

    test('should return false when no protected directories are accessible', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFsPromises.access.mockRejectedValue(new Error('Access denied'));

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(false);
    });

    test('should return false when access checks throw errors', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Filesystem error');
      });

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(false);
    });

    test('should handle partial access to protected directories', async () => {
      let callCount = 0;
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          return Promise.resolve(); // First call succeeds (system directory)
        }
        throw new Error('Access denied'); // Subsequent calls fail
      });

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(true); // First system directory access indicates FDA
    });
  });

  describe('Permission Status Checking', () => {
    test('should return complete permission status', async () => {
      // Mock Full Disk Access as enabled
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const status = await permissionManager.checkPermissions();

      expect(status.hasFullDiskAccess).toBe(true);
      expect(status.canAccessDocuments).toBe(true);
      expect(status.canAccessDesktop).toBe(true);
      expect(status.recommendations).toContain('All permissions are properly configured');
    });

    test('should provide recommendations when FDA is disabled', async () => {
      // Mock Full Disk Access as disabled
      mockFs.existsSync.mockReturnValue(false);
      mockFsPromises.access.mockRejectedValue(new Error('Access denied'));

      const status = await permissionManager.checkPermissions();

      expect(status.hasFullDiskAccess).toBe(false);
      expect(status.recommendations).toContain('Enable Full Disk Access for complete filesystem access');
      expect(status.recommendations).toContain('Follow the setup instructions to grant Full Disk Access');
    });

    test('should provide specific recommendations for inaccessible directories', async () => {
      // Mock Documents as inaccessible, Desktop as accessible
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string') {
          return !path.includes('Documents');
        }
        return false;
      });
      
      mockFsPromises.access.mockImplementation(async (path: fs.PathLike) => {
        if (typeof path === 'string' && path.includes('Documents')) {
          throw new Error('Access denied');
        }
        return Promise.resolve();
      });
      
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const status = await permissionManager.checkPermissions();

      expect(status.canAccessDocuments).toBe(false);
      expect(status.canAccessDesktop).toBe(true);
      expect(status.recommendations).toContain('Documents directory is not accessible');
      expect(status.recommendations).not.toContain('Desktop directory is not accessible');
    });
  });

  describe('Setup Instructions', () => {
    test('should generate comprehensive setup instructions', () => {
      const instructions = permissionManager.generateSetupInstructions();

      expect(instructions).toHaveLength(11);
      expect(instructions[0]).toContain('Open System Preferences');
      expect(instructions[2]).toContain('Full Disk Access');
      expect(instructions[5]).toContain('Navigate to and select your terminal application');
      expect(instructions[10]).toContain('Run the MCP server again');
    });

    test('should include step-by-step guidance', () => {
      const instructions = permissionManager.generateSetupInstructions();

      // Check that instructions are numbered and detailed
      expect(instructions.some(inst => inst.includes('1.'))).toBe(true);
      expect(instructions.some(inst => inst.includes('System Preferences'))).toBe(true);
      expect(instructions.some(inst => inst.includes('Security & Privacy'))).toBe(true);
      expect(instructions.some(inst => inst.includes('terminal application'))).toBe(true);
    });
  });

  describe('Permission Report Generation', () => {
    test('should generate detailed permission report with all access', async () => {
      // Mock all permissions as available
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const report = await permissionManager.generatePermissionReport();

      expect(report).toContain('MCP Filesystem Perplexity Permission Report');
      expect(report).toContain('Full Disk Access: ✅ Enabled');
      expect(report).toContain('Documents Access: ✅ Available');
      expect(report).toContain('Desktop Access: ✅ Available');
      expect(report).toContain('All permissions are properly configured');
    });

    test('should generate report with setup instructions when FDA is disabled', async () => {
      // Mock FDA as disabled
      mockFs.existsSync.mockReturnValue(false);
      mockFsPromises.access.mockRejectedValue(new Error('Access denied'));

      const report = await permissionManager.generatePermissionReport();

      expect(report).toContain('Full Disk Access: ❌ Disabled');
      expect(report).toContain('Setup Instructions:');
      expect(report).toContain('Open System Preferences');
      expect(report).toContain('Enable Full Disk Access');
    });

    test('should show mixed permission status', async () => {
      // Mock partial access
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string') {
          return path.includes('Desktop');
        }
        return false;
      });
      
      mockFsPromises.access.mockImplementation(async (path: fs.PathLike) => {
        if (typeof path === 'string' && path.includes('Documents')) {
          throw new Error('Access denied');
        }
        return Promise.resolve();
      });

      const report = await permissionManager.generatePermissionReport();

      expect(report).toContain('Documents Access: ❌ Unavailable');
      expect(report).toContain('Desktop Access: ✅ Available');
    });
  });

  describe('Minimum Requirements Check', () => {
    test('should return true when Documents is accessible', async () => {
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string') {
          return path.includes('Documents');
        }
        return false;
      });
      
      mockFsPromises.access.mockImplementation(async (path: fs.PathLike) => {
        if (typeof path === 'string' && path.includes('Documents')) {
          return Promise.resolve();
        }
        throw new Error('Access denied');
      });

      const meetsRequirements = await permissionManager.meetsMinimumRequirements();
      expect(meetsRequirements).toBe(true);
    });

    test('should return true when Desktop is accessible', async () => {
      mockFs.existsSync.mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string') {
          return path.includes('Desktop');
        }
        return false;
      });
      
      mockFsPromises.access.mockImplementation(async (path: fs.PathLike) => {
        if (typeof path === 'string' && path.includes('Desktop')) {
          return Promise.resolve();
        }
        throw new Error('Access denied');
      });

      const meetsRequirements = await permissionManager.meetsMinimumRequirements();
      expect(meetsRequirements).toBe(true);
    });

    test('should return false when neither directory is accessible', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFsPromises.access.mockRejectedValue(new Error('Access denied'));

      const meetsRequirements = await permissionManager.meetsMinimumRequirements();
      expect(meetsRequirements).toBe(false);
    });
  });

  describe('Troubleshooting Guide', () => {
    test('should generate comprehensive troubleshooting guide', () => {
      const guide = permissionManager.generateTroubleshootingGuide();

      expect(guide.length).toBeGreaterThan(10);
      expect(guide.some(item => item.includes('Permission denied'))).toBe(true);
      expect(guide.some(item => item.includes('Full Disk Access'))).toBe(true);
      expect(guide.some(item => item.includes('Documents/Desktop'))).toBe(true);
      expect(guide.some(item => item.includes('macOS version'))).toBe(true);
      expect(guide.some(item => item.includes('npm run inspect'))).toBe(true);
    });

    test('should include common issues and solutions', () => {
      const guide = permissionManager.generateTroubleshootingGuide();
      const guideText = guide.join(' ');

      expect(guideText).toContain('Permission denied');
      expect(guideText).toContain('Terminal');
      expect(guideText).toContain('Node.js binary');
      expect(guideText).toContain('macOS 10.14+');
      expect(guideText).toContain('System Preferences');
    });
  });

  describe('Error Handling', () => {
    test('should handle filesystem errors gracefully', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Filesystem error');
      });

      const result = await permissionManager.checkDirectoryAccess('/test');
      expect(result).toBe(false);
    });

    test('should handle promise rejections in FDA detection', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockImplementation(async () => {
        throw new Error('Unexpected error');
      });

      const result = await permissionManager.detectFullDiskAccess();
      expect(result).toBe(false);
    });

    test('should handle mixed success/failure scenarios', async () => {
      let accessCallCount = 0;
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockImplementation(async () => {
        accessCallCount++;
        if (accessCallCount % 2 === 0) {
          throw new Error('Access denied');
        }
        return Promise.resolve();
      });

      const status = await permissionManager.checkPermissions();
      expect(status).toBeDefined();
      expect(typeof status.hasFullDiskAccess).toBe('boolean');
      expect(typeof status.canAccessDocuments).toBe('boolean');
      expect(typeof status.canAccessDesktop).toBe('boolean');
      expect(Array.isArray(status.recommendations)).toBe(true);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle typical first-run scenario', async () => {
      // Simulate first run without FDA
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockRejectedValue(new Error('Operation not permitted'));

      const status = await permissionManager.checkPermissions();
      const report = await permissionManager.generatePermissionReport();
      const meetsMin = await permissionManager.meetsMinimumRequirements();

      expect(status.hasFullDiskAccess).toBe(false);
      expect(status.canAccessDocuments).toBe(false);
      expect(status.canAccessDesktop).toBe(false);
      expect(meetsMin).toBe(false);
      expect(report).toContain('Setup Instructions');
    });

    test('should handle successful setup scenario', async () => {
      // Simulate successful FDA setup
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.access.mockResolvedValue(undefined);
      mockFsPromises.writeFile.mockResolvedValue(undefined);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const status = await permissionManager.checkPermissions();
      const meetsMin = await permissionManager.meetsMinimumRequirements();

      expect(status.hasFullDiskAccess).toBe(true);
      expect(status.canAccessDocuments).toBe(true);
      expect(status.canAccessDesktop).toBe(true);
      expect(meetsMin).toBe(true);
      expect(status.recommendations).toContain('All permissions are properly configured');
    });
  });
});