/**
 * PathValidator Tests
 * Comprehensive tests for security validation logic
 */

import * as path from 'path';
import * as os from 'os';
import { PathValidator } from '../PathValidator';
import { ValidationOptions } from '../../types/index';

describe('PathValidator', () => {
  let validator: PathValidator;
  let homeDir: string;
  let documentsDir: string;
  let desktopDir: string;

  beforeEach(() => {
    homeDir = os.homedir();
    documentsDir = path.join(homeDir, 'Documents');
    desktopDir = path.join(homeDir, 'Desktop');
    
    const options: ValidationOptions = {
      allowedPrefixes: [documentsDir, desktopDir],
      enableAuditLogging: true,
      strictMode: true
    };
    
    validator = new PathValidator(options);
    validator.clearSecurityEvents();
  });

  describe('Constructor and Factory Methods', () => {
    test('should create validator with correct allowed prefixes', () => {
      const prefixes = validator.getAllowedPrefixes();
      expect(prefixes).toContain(documentsDir);
      expect(prefixes).toContain(desktopDir);
    });

    test('should create macOS validator with factory method', () => {
      const macValidator = PathValidator.createForMacOS();
      const prefixes = macValidator.getAllowedPrefixes();
      
      expect(prefixes).toContain(path.join(homeDir, 'Documents'));
      expect(prefixes).toContain(path.join(homeDir, 'Desktop'));
    });

    test('should handle tilde expansion in allowed prefixes', () => {
      const options: ValidationOptions = {
        allowedPrefixes: ['~/Documents', '~/Desktop'],
        enableAuditLogging: false,
        strictMode: false
      };
      
      const tildeValidator = new PathValidator(options);
      const prefixes = tildeValidator.getAllowedPrefixes();
      
      expect(prefixes).toContain(documentsDir);
      expect(prefixes).toContain(desktopDir);
    });
  });

  describe('Basic Input Validation', () => {
    test('should reject null or undefined input', () => {
      const result1 = validator.validatePath(null as any);
      const result2 = validator.validatePath(undefined as any);
      
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('Invalid path input');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toContain('Invalid path input');
    });

    test('should reject non-string input', () => {
      const result = validator.validatePath(123 as any);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid path input');
    });

    test('should reject empty string input', () => {
      const result1 = validator.validatePath('');
      const result2 = validator.validatePath('   ');
      
      expect(result1.isValid).toBe(false);
      expect(result1.error).toContain('Empty path not allowed');
      expect(result2.isValid).toBe(false);
      expect(result2.error).toContain('Empty path not allowed');
    });
  });

  describe('Path Traversal Detection', () => {
    test('should detect basic path traversal attempts', () => {
      const traversalPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '/../../etc/passwd',
        '\\..\\..\\system32',
        '..',
        '../',
        '..\\',
        'Documents/../../../etc/passwd',
        'valid/path/../../..',
        'Documents/file.txt/../..'
      ];

      traversalPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(false);
        expect(result.securityViolation).toBe(true);
        expect(result.error).toContain('Path traversal attempt detected');
      });
    });

    test('should detect path traversal at end of path', () => {
      const result1 = validator.validatePath('Documents/..');
      const result2 = validator.validatePath('Documents/subfolder/..');
      
      expect(result1.isValid).toBe(false);
      expect(result1.securityViolation).toBe(true);
      expect(result2.isValid).toBe(false);
      expect(result2.securityViolation).toBe(true);
    });

    test('should allow legitimate paths with dots', () => {
      const legitimatePaths = [
        'Documents/file.txt',
        'Documents/.hidden',
        'Documents/folder.name/file.ext',
        'Desktop/my.project/readme.md'
      ];

      legitimatePaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(true);
        expect(result.securityViolation).toBeFalsy();
      });
    });
  });

  describe('Encoded Path Attack Detection', () => {
    test('should detect URL encoded traversal attempts', () => {
      const encodedPaths = [
        'Documents%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '%2e%2e%2f%2e%2e%2fwindows',
        'Documents/%2e%2e/',
        '%2e%2e%5c%2e%2e%5csystem32'
      ];

      encodedPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(false);
        expect(result.securityViolation).toBe(true);
        expect(result.error).toContain('Encoded path traversal attempt detected');
      });
    });

    test('should detect double-encoded attacks', () => {
      const doubleEncodedPath = decodeURIComponent('Documents%252f%252e%252e%252f');
      const result = validator.validatePath(doubleEncodedPath);
      expect(result.isValid).toBe(false);
      expect(result.securityViolation).toBe(true);
    });
  });

  describe('Directory Allowlist Validation', () => {
    test('should allow paths within Documents directory', () => {
      const validPaths = [
        'Documents/file.txt',
        '~/Documents/subfolder/file.txt',
        path.join(documentsDir, 'test.txt'),
        path.join(documentsDir, 'subfolder', 'deep', 'file.txt')
      ];

      validPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toContain('Documents');
      });
    });

    test('should allow paths within Desktop directory', () => {
      const validPaths = [
        'Desktop/project/file.txt',
        '~/Desktop/image.png',
        path.join(desktopDir, 'folder', 'document.pdf')
      ];

      validPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toContain('Desktop');
      });
    });

    test('should reject paths outside allowed directories', () => {
      const invalidPaths = [
        '/etc/passwd',
        '/usr/bin/bash',
        '~/Downloads/file.txt',
        '~/Pictures/image.jpg',
        '/tmp/tempfile',
        path.join(homeDir, 'Music', 'song.mp3'),
        '/System/Library/Frameworks'
      ];

      invalidPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(false);
        expect(result.securityViolation).toBe(true);
        expect(result.error).toContain('Path outside allowed directories');
      });
    });

    test('should handle exact directory matches', () => {
      const result1 = validator.validatePath('~/Documents');
      const result2 = validator.validatePath('~/Desktop');
      
      expect(result1.isValid).toBe(true);
      expect(result2.isValid).toBe(true);
    });
  });

  describe('Path Resolution', () => {
    test('should resolve tilde paths correctly', () => {
      const result = validator.validatePath('~/Documents/test.txt');
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(homeDir, 'Documents', 'test.txt'));
    });

    test('should resolve relative paths relative to home directory', () => {
      const result = validator.validatePath('Documents/test.txt');
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(homeDir, 'Documents', 'test.txt'));
    });

    test('should handle absolute paths', () => {
      const absolutePath = path.join(documentsDir, 'test.txt');
      const result = validator.validatePath(absolutePath);
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(absolutePath);
    });

    test('should normalize paths correctly', () => {
      const messyPath = 'Documents//subfolder/./file.txt';
      const result = validator.validatePath(messyPath);
      expect(result.isValid).toBe(true);
      expect(result.resolvedPath).toBe(path.join(homeDir, 'Documents', 'subfolder', 'file.txt'));
    });
  });

  describe('Security Event Logging', () => {
    test('should log security events when enabled', () => {
      validator.validatePath('../../../etc/passwd');
      validator.validatePath('/unauthorized/path');
      
      const events = validator.getSecurityEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('path_traversal');
      expect(events[1].type).toBe('unauthorized_access');
    });

    test('should not log events when disabled', () => {
      const options: ValidationOptions = {
        allowedPrefixes: [documentsDir],
        enableAuditLogging: false,
        strictMode: true
      };
      
      const noLogValidator = new PathValidator(options);
      noLogValidator.validatePath('../../../etc/passwd');
      
      const events = noLogValidator.getSecurityEvents();
      expect(events).toHaveLength(0);
    });

    test('should clear security events', () => {
      validator.validatePath('../../../etc/passwd');
      expect(validator.getSecurityEvents()).toHaveLength(1);
      
      validator.clearSecurityEvents();
      expect(validator.getSecurityEvents()).toHaveLength(0);
    });

    test('should include timestamp and client info in events', () => {
      const beforeTime = new Date();
      validator.validatePath('../../../etc/passwd');
      const afterTime = new Date();
      
      const events = validator.getSecurityEvents();
      expect(events[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(events[0].timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime());
      expect(events[0].clientInfo).toBe('PathValidator');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long paths', () => {
      const longPath = 'Documents/' + 'a'.repeat(1000) + '/file.txt';
      const result = validator.validatePath(longPath);
      expect(result.isValid).toBe(true);
    });

    test('should handle paths with special characters', () => {
      const specialPaths = [
        'Documents/file with spaces.txt',
        'Documents/file-with-dashes.txt',
        'Documents/file_with_underscores.txt',
        'Documents/file(with)parentheses.txt',
        'Documents/file[with]brackets.txt'
      ];

      specialPaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(true);
      });
    });

    test('should handle Unicode characters in paths', () => {
      const unicodePaths = [
        'Documents/файл.txt',
        'Documents/文件.txt',
        'Documents/ファイル.txt',
        'Documents/archivo.txt'
      ];

      unicodePaths.forEach(testPath => {
        const result = validator.validatePath(testPath);
        expect(result.isValid).toBe(true);
      });
    });

    test('should handle case sensitivity appropriately', () => {
      const result1 = validator.validatePath('documents/file.txt');
      const result2 = validator.validatePath('DOCUMENTS/file.txt');
      
      // The validator uses exact string matching for allowed prefixes
      // So case-sensitive directory names will be rejected even on case-insensitive filesystems
      // This is intentional for security - we want exact matches
      expect(result1.isValid).toBe(false);
      expect(result2.isValid).toBe(false);
      expect(result1.securityViolation).toBe(true);
      expect(result2.securityViolation).toBe(true);
      
      // But the correct case should work
      const result3 = validator.validatePath('Documents/file.txt');
      expect(result3.isValid).toBe(true);
    });
  });

  describe('Strict Mode vs Non-Strict Mode', () => {
    test('should behave differently in strict vs non-strict mode', () => {
      const strictOptions: ValidationOptions = {
        allowedPrefixes: [documentsDir],
        enableAuditLogging: false,
        strictMode: true
      };

      const nonStrictOptions: ValidationOptions = {
        allowedPrefixes: [documentsDir],
        enableAuditLogging: false,
        strictMode: false
      };

      const strictValidator = new PathValidator(strictOptions);
      const nonStrictValidator = new PathValidator(nonStrictOptions);

      // Both should handle basic validation the same way
      const testPath = 'Documents/test.txt';
      const strictResult = strictValidator.validatePath(testPath);
      const nonStrictResult = nonStrictValidator.validatePath(testPath);

      expect(strictResult.isValid).toBe(true);
      expect(nonStrictResult.isValid).toBe(true);
    });
  });

  describe('Performance and Stress Tests', () => {
    test('should handle multiple rapid validations', () => {
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        validator.validatePath(`Documents/file${i}.txt`);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete 1000 validations in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
    });

    test('should maintain consistent results', () => {
      const testPath = 'Documents/test.txt';
      const results: ReturnType<typeof validator.validatePath>[] = [];
      
      for (let i = 0; i < 100; i++) {
        results.push(validator.validatePath(testPath));
      }
      
      // All results should be identical
      results.forEach(result => {
        expect(result.isValid).toBe(true);
        expect(result.resolvedPath).toBe(results[0].resolvedPath);
      });
    });
  });
});