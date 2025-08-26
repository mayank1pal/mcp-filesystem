# Security Policy

## 🔒 Security Overview

The MCP Filesystem Server is designed with security as a primary concern. This document outlines our security practices, supported versions, and how to report security vulnerabilities.

## 🛡️ Security Features

### Multi-Layer Security Architecture

1. **Path Validation**: All file paths are validated against allowed directories
2. **Directory Traversal Protection**: Prevents access outside allowed directories
3. **File Type Filtering**: Configurable allowlist/blocklist for file extensions
4. **Size Limits**: Configurable maximum file sizes to prevent resource exhaustion
5. **Security Levels**: Three configurable security modes (strict, moderate, permissive)
6. **Audit Logging**: Comprehensive logging of all security events

### Security Levels

#### Strict Mode (Default - Recommended for Production)
- ✅ Only explicitly allowed directories
- ✅ No symlink following
- ✅ Maximum file size restrictions (10MB default)
- ✅ Enhanced tools disabled by default
- ✅ Comprehensive security logging
- ✅ File type restrictions enforced

#### Moderate Mode (Recommended for Development)
- ✅ Allowed directories + reasonable subdirectories
- ⚠️ Limited symlink following (within allowed directories)
- ✅ Reasonable file size limits (50MB default)
- ✅ Enhanced tools can be enabled
- ✅ Standard security logging
- ✅ File type restrictions enforced

#### Permissive Mode (Use with Caution)
- ⚠️ Broader directory access
- ⚠️ Symlink following allowed
- ⚠️ Higher file size limits (100MB default)
- ⚠️ All features available
- ⚠️ Reduced logging overhead
- ⚠️ Minimal file type restrictions

## 🔐 Secure Configuration Guidelines

### Recommended Directory Configuration

#### ✅ Safe Directories
```json
{
  "allowedDirectories": [
    "~/Documents",
    "~/Downloads", 
    "~/Desktop",
    "~/Projects",
    "/tmp"
  ]
}
```

#### ❌ Avoid These Directories
```json
{
  "allowedDirectories": [
    "/",              // Root directory - too broad
    "~",              // Home directory - too broad
    "/System",        // System directories
    "/usr",           // System binaries
    "/etc",           // System configuration
    "/var",           // System variables
    "/bin",           // System binaries
    "/sbin",          // System binaries
    "C:\\Windows",    // Windows system directory
    "C:\\Program Files" // Windows program files
  ]
}
```

### File Type Security

#### Recommended Blocked Extensions
```json
{
  "blockedExtensions": [
    // Executable files
    ".exe", ".bat", ".cmd", ".scr", ".com", ".pif",
    ".vbs", ".vbe", ".js", ".jse", ".ws", ".wsf",
    ".ps1", ".ps1xml", ".ps2", ".ps2xml", ".psc1", ".psc2",
    
    // Archive files that could contain executables
    ".jar", ".war", ".ear",
    
    // System files
    ".sys", ".dll", ".drv",
    
    // Mobile executables
    ".apk", ".ipa", ".app", ".dmg", ".pkg",
    
    // Linux executables
    ".deb", ".rpm", ".run", ".bin",
    
    // Script files
    ".sh", ".bash", ".zsh", ".fish", ".csh"
  ]
}
```

### Environment Variable Security

When using environment variables, ensure they are properly scoped:

```bash
# ✅ Good - Specific to the application
export MCP_FS_ALLOWED_DIRS="~/Documents,~/Projects"
export MCP_FS_SECURITY_LEVEL="strict"

# ❌ Avoid - Too permissive
export MCP_FS_ALLOWED_DIRS="/"
export MCP_FS_SECURITY_LEVEL="permissive"
```

## 🚨 Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported          | Security Updates |
| ------- | ------------------ | ---------------- |
| 2.x.x   | ✅ Yes             | ✅ Yes           |
| 1.x.x   | ❌ No              | ❌ No            |

## 🐛 Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### 1. **Do Not** Create a Public Issue

Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.

### 2. Report Privately

Send an email to: **security@[project-domain]** with:

- **Subject**: "Security Vulnerability Report - MCP Filesystem Server"
- **Description**: Detailed description of the vulnerability
- **Steps to Reproduce**: Clear steps to reproduce the issue
- **Impact Assessment**: Your assessment of the potential impact
- **Suggested Fix**: If you have suggestions for fixing the issue

### 3. Include This Information

- **Version**: Which version(s) are affected
- **Configuration**: Relevant configuration that triggers the issue
- **Environment**: Operating system, Node.js version, etc.
- **Proof of Concept**: Code or steps that demonstrate the vulnerability

### 4. Response Timeline

- **Initial Response**: Within 48 hours
- **Assessment**: Within 1 week
- **Fix Development**: Within 2 weeks (depending on complexity)
- **Release**: Security fixes are prioritized for immediate release

### 5. Disclosure Policy

- We follow responsible disclosure practices
- We will work with you to understand and fix the issue
- We will credit you in the security advisory (unless you prefer to remain anonymous)
- We will coordinate the public disclosure timeline with you

## 🛠️ Security Best Practices for Users

### 1. Regular Updates
```bash
# Check for updates regularly
npm update -g mcp-filesystem-server

# Or for local installations
npm update
```

### 2. Principle of Least Privilege
- Only allow access to directories you actually need
- Use the most restrictive security level that meets your needs
- Regularly review and audit your allowed directories

### 3. Monitor Logs
```bash
# Enable security logging
export MCP_FS_LOG_LEVEL=info

# Review logs regularly for suspicious activity
tail -f /var/log/mcp-filesystem-server.log
```

### 4. Configuration Validation
```bash
# Test your configuration before deployment
mcp-filesystem-server --validate-config
```

### 5. Network Security
- Run the server in a sandboxed environment when possible
- Use firewall rules to restrict network access
- Consider running in a container for additional isolation

## 🔍 Security Auditing

### Self-Assessment Checklist

- [ ] Using supported version (2.x.x)
- [ ] Configured with appropriate security level
- [ ] Limited allowed directories to necessary paths only
- [ ] Enabled appropriate file type restrictions
- [ ] Configured reasonable file size limits
- [ ] Enabled security logging
- [ ] Regularly reviewing logs for suspicious activity
- [ ] Keeping the server updated

### Configuration Review

Use this command to review your current security configuration:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "security-audit", "version": "1.0.0"}}}' | mcp-filesystem-server
```

Look for these security indicators in the response:
- Security level setting
- Allowed directories list
- Maximum file size
- Enabled tools list

## 🚫 Known Security Limitations

### 1. Symlink Handling
- In moderate/permissive modes, symlinks within allowed directories are followed
- This could potentially allow access to files outside intended directories
- **Mitigation**: Use strict mode or carefully audit symlinks

### 2. File Content Validation
- The server validates file paths and types but not file content
- Malicious content could be written to allowed files
- **Mitigation**: Use additional content scanning tools if needed

### 3. Resource Exhaustion
- Large file operations could consume significant system resources
- **Mitigation**: Configure appropriate file size limits

### 4. Concurrent Access
- Multiple clients could potentially interfere with each other's operations
- **Mitigation**: Implement file locking at the application level if needed

## 📋 Security Compliance

### Standards Alignment
- **OWASP**: Follows OWASP secure coding practices
- **Principle of Least Privilege**: Minimal necessary permissions
- **Defense in Depth**: Multiple security layers
- **Secure by Default**: Restrictive default configuration

### Audit Trail
All security-relevant operations are logged with:
- Timestamp
- Operation type
- File paths involved
- Success/failure status
- Security violations

## 🆘 Emergency Response

### If You Suspect a Security Breach

1. **Immediate Actions**:
   - Stop the MCP Filesystem Server
   - Preserve logs for analysis
   - Assess the scope of potential access

2. **Investigation**:
   - Review security logs for unauthorized access
   - Check file modification timestamps
   - Verify integrity of sensitive files

3. **Recovery**:
   - Update to the latest version
   - Review and tighten configuration
   - Rotate any potentially compromised credentials
   - Restart with enhanced monitoring

4. **Reporting**:
   - Report the incident following the vulnerability reporting process
   - Document lessons learned
   - Update security procedures as needed

---

**Remember**: Security is a shared responsibility. While we work hard to make the MCP Filesystem Server secure by default, proper configuration and operational practices are essential for maintaining security in your environment.