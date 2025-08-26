# MCP Filesystem Server - Complete Setup Tutorial

This tutorial will guide you through setting up the MCP Filesystem Server with various MCP clients and configurations.

## 📋 Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn** package manager
- An MCP-compatible client (Perplexity Desktop, Claude Desktop, etc.)

## 🚀 Quick Start (5 minutes)

### Step 1: Install the Server

Choose one of these installation methods:

#### Option A: Global NPM Installation (Recommended)
```bash
npm install -g mcp-filesystem-server
```

#### Option B: Local Development Setup
```bash
git clone <repository-url>
cd mcp-filesystem-server
npm install
npm run build
```

### Step 2: Basic Configuration

Create a configuration file:
```bash
mkdir -p ~/.config
cat > ~/.config/mcp-filesystem.json << EOF
{
  "allowedDirectories": [
    "~/Documents",
    "~/Downloads", 
    "~/Desktop"
  ],
  "securityLevel": "moderate",
  "maxFileSize": "10MB",
  "enableEnhancedTools": true,
  "logLevel": "info"
}
EOF
```

### Step 3: Configure Your MCP Client

#### For Perplexity Desktop:
Add this to your MCP configuration:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_CONFIG_FILE": "~/.config/mcp-filesystem.json"
      }
    }
  }
}
```

#### For Claude Desktop:
Edit `~/.claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_CONFIG_FILE": "~/.config/mcp-filesystem.json"
      }
    }
  }
}
```

### Step 4: Restart Your Client

Completely close and restart your MCP client to load the new configuration.

### Step 5: Test the Setup

Your client should now have access to these filesystem tools:
- `read_file` - Read file contents
- `write_file` - Write to files
- `list_directory` - Browse directories
- `copy_file` - Copy files/directories
- `delete_file` - Delete files/directories

## 🔧 Detailed Configuration Guide

### Configuration Methods

The server supports multiple configuration methods in this priority order:

1. **Command Line Arguments** (highest priority)
2. **Environment Variables**
3. **Configuration Files** (JSON/YAML)
4. **Default Settings** (lowest priority)

### Environment Variables Reference

| Variable | Description | Example | Default |
|----------|-------------|---------|---------|
| `MCP_FS_ALLOWED_DIRS` | Allowed directories (comma-separated) | `~/Documents,~/Projects` | `~/Documents,~/Desktop` |
| `MCP_FS_SECURITY_LEVEL` | Security level | `strict`, `moderate`, `permissive` | `strict` |
| `MCP_FS_MAX_FILE_SIZE` | Maximum file size | `10MB`, `1GB`, `500KB` | `10MB` |
| `MCP_FS_ENABLE_ENHANCED_TOOLS` | Enable copy/delete tools | `true`, `false` | `false` |
| `MCP_FS_LOG_LEVEL` | Logging level | `error`, `warn`, `info`, `debug` | `info` |
| `MCP_FS_CONFIG_FILE` | Path to config file | `~/.config/mcp-fs.json` | - |

### Configuration File Examples

#### Basic Configuration
```json
{
  "allowedDirectories": ["~/Documents", "~/Downloads"],
  "securityLevel": "moderate",
  "enableEnhancedTools": true
}
```

#### Advanced Configuration
```json
{
  "allowedDirectories": [
    "~/Documents",
    "~/Downloads",
    "~/Desktop",
    "~/Projects",
    "/tmp"
  ],
  "securityLevel": "moderate",
  "maxFileSize": "50MB",
  "enableEnhancedTools": true,
  "allowedExtensions": ["*"],
  "blockedExtensions": [
    ".exe", ".bat", ".scr", ".com", ".pif",
    ".vbs", ".js", ".jar", ".app", ".dmg"
  ],
  "logLevel": "info"
}
```

#### Development Configuration
```json
{
  "allowedDirectories": [
    "~/Documents",
    "~/Projects",
    "~/Code",
    "/tmp"
  ],
  "securityLevel": "permissive",
  "maxFileSize": "100MB",
  "enableEnhancedTools": true,
  "allowedExtensions": ["*"],
  "blockedExtensions": [],
  "logLevel": "debug"
}
```

## 🎯 Client-Specific Setup Guides

### Perplexity Desktop Setup

#### Method 1: Using Configuration File (Recommended)
1. Create config file as shown in Quick Start
2. Add to Perplexity Desktop MCP settings:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "command": "mcp-filesystem-server",
         "env": {
           "MCP_FS_CONFIG_FILE": "~/.config/mcp-filesystem.json"
         }
       }
     }
   }
   ```

#### Method 2: Using Environment Variables
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_ALLOWED_DIRS": "~/Documents,~/Downloads,~/Desktop,~/Projects",
        "MCP_FS_SECURITY_LEVEL": "moderate",
        "MCP_FS_ENABLE_ENHANCED_TOOLS": "true",
        "MCP_FS_MAX_FILE_SIZE": "25MB"
      }
    }
  }
}
```

#### Method 3: Local Development Version
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/mcp-filesystem-server/dist/index.js"],
      "env": {
        "MCP_FS_CONFIG_FILE": "~/.config/mcp-filesystem.json"
      }
    }
  }
}
```

### Claude Desktop Setup

#### Configuration Location
Edit the file: `~/.claude_desktop_config.json`

#### Basic Setup
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_ALLOWED_DIRS": "~/Documents,~/Downloads,~/Desktop",
        "MCP_FS_SECURITY_LEVEL": "moderate",
        "MCP_FS_ENABLE_ENHANCED_TOOLS": "true"
      }
    }
  }
}
```

#### Advanced Setup with Config File
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_CONFIG_FILE": "~/.config/mcp-filesystem.json"
      }
    }
  }
}
```

### Custom MCP Client Setup

For other MCP clients, use the same configuration pattern:

```json
{
  "servers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_CONFIG_FILE": "/path/to/config.json"
      }
    }
  }
}
```

## 🔒 Security Configuration Guide

### Security Levels Explained

#### Strict Mode (Default)
- **Use case**: Production environments, sensitive data
- **Features**:
  - Only explicitly allowed directories
  - No symlink following
  - Enhanced tools disabled by default
  - Comprehensive security logging
  - Maximum file size restrictions

#### Moderate Mode
- **Use case**: Development, general productivity
- **Features**:
  - Allowed directories + reasonable access
  - Limited symlink following
  - Enhanced tools can be enabled
  - Balanced security and functionality
  - Standard logging

#### Permissive Mode
- **Use case**: Development, testing, power users
- **Features**:
  - Broader directory access
  - Symlink following allowed
  - All features available
  - Minimal restrictions
  - Reduced logging overhead

### Directory Access Configuration

#### Safe Directory Examples
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

#### Avoid These Directories
```json
{
  "allowedDirectories": [
    "/",           // Root directory - too broad
    "~",           // Home directory - too broad  
    "/System",     // System directories
    "/usr/bin",    // Binary directories
    "/etc"         // Configuration directories
  ]
}
```

### File Type Filtering

#### Allow Specific Types Only
```json
{
  "allowedExtensions": [
    ".txt", ".md", ".json", ".yaml", ".yml",
    ".js", ".ts", ".py", ".java", ".cpp",
    ".html", ".css", ".xml", ".csv"
  ],
  "blockedExtensions": []
}
```

#### Block Dangerous Types
```json
{
  "allowedExtensions": ["*"],
  "blockedExtensions": [
    ".exe", ".bat", ".scr", ".com", ".pif",
    ".vbs", ".ps1", ".jar", ".app", ".dmg",
    ".deb", ".rpm", ".msi"
  ]
}
```

## 🧪 Testing Your Setup

### 1. Verify Server Installation

#### Test Global Installation
```bash
which mcp-filesystem-server
mcp-filesystem-server --version
```

#### Test Local Installation
```bash
node dist/index.js --version
```

### 2. Test Server Initialization

```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | mcp-filesystem-server
```

Expected output should include:
```
"serverInfo": {"name": "mcp-filesystem-server", "version": "2.0.0"}
```

### 3. Test Tool Listing

```bash
echo '{"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}' | mcp-filesystem-server
```

Should return 3-5 tools depending on your configuration.

### 4. Test File Operations

Create a test file:
```bash
echo "Hello, MCP!" > ~/Documents/test.txt
```

Test reading:
```bash
echo '{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "read_file", "arguments": {"path": "~/Documents/test.txt"}}}' | mcp-filesystem-server
```

### 5. Interactive Testing with MCP Inspector

```bash
npm run inspect
```

This opens a web interface for testing tools interactively.

## 🐛 Troubleshooting Guide

### Common Issues and Solutions

#### Issue: "No tools listed" or empty capabilities
**Symptoms:**
```json
{"capabilities": {"tools": {}}, "serverInfo": {"name": "mcp-filesystem-perplexity", "version": "1.0.0"}}
```

**Causes & Solutions:**
1. **Running old version**
   - Solution: Verify correct server path, rebuild if using local version
2. **Wrong configuration path**
   - Solution: Check MCP client configuration points to correct server
3. **Client cache**
   - Solution: Restart MCP client completely

#### Issue: "Invalid literal value, expected 'object'" error
**Symptoms:**
```json
{"error": "Invalid literal value, expected \"object\""}
```

**Causes & Solutions:**
1. **Version mismatch**
   - Solution: Update to latest version
2. **Client-side validation**
   - Solution: Restart client, verify configuration

#### Issue: Permission denied errors
**Symptoms:**
```
Error: EACCES: permission denied
```

**Solutions:**
1. Check file/directory permissions
2. Verify allowed directories configuration
3. Ensure server has access to specified paths

#### Issue: Files not found
**Symptoms:**
```
Error: Path not in allowed directories
```

**Solutions:**
1. Add directory to `allowedDirectories`
2. Use absolute paths or proper path expansion
3. Check path spelling and case sensitivity

### Debug Mode

Enable detailed logging:
```bash
export MCP_FS_LOG_LEVEL=debug
mcp-filesystem-server
```

Or in configuration:
```json
{
  "logLevel": "debug"
}
```

### Verify Configuration Loading

The server logs which configuration sources it's using:
```
Configuration loaded from: /path/to/config.json
```

### Check Server Status

Monitor server startup messages:
```
MCP Filesystem Server started successfully
Security level: moderate
Max file size: 10MB
Allowed directories: ['/Users/user/Documents', '/Users/user/Downloads']
Registered tools: ['read_file', 'write_file', 'list_directory', 'copy_file', 'delete_file']
```

## 🚀 Advanced Usage

### Custom Deployment

#### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

#### System Service (systemd)
```ini
[Unit]
Description=MCP Filesystem Server
After=network.target

[Service]
Type=simple
User=mcp
WorkingDirectory=/opt/mcp-filesystem-server
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=MCP_FS_CONFIG_FILE=/etc/mcp-filesystem.json

[Install]
WantedBy=multi-user.target
```

### Performance Tuning

#### For Large Files
```json
{
  "maxFileSize": "1GB",
  "logLevel": "warn"
}
```

#### For Many Small Files
```json
{
  "maxFileSize": "10MB",
  "logLevel": "info"
}
```

### Integration Examples

#### With CI/CD
```yaml
# .github/workflows/test.yml
- name: Setup MCP Filesystem Server
  run: |
    npm install -g mcp-filesystem-server
    export MCP_FS_ALLOWED_DIRS="./src,./tests"
    export MCP_FS_SECURITY_LEVEL="permissive"
```

#### With Development Tools
```json
{
  "allowedDirectories": [
    "~/Code",
    "~/Projects", 
    "/tmp"
  ],
  "securityLevel": "permissive",
  "enableEnhancedTools": true,
  "maxFileSize": "100MB"
}
```

## 📚 Next Steps

1. **Explore Tools**: Try each filesystem tool with your MCP client
2. **Customize Security**: Adjust security level based on your needs
3. **Add Directories**: Configure access to your specific directories
4. **Monitor Usage**: Check logs for any issues or security events
5. **Contribute**: Report issues or contribute improvements

## 🤝 Getting Help

- **Documentation**: Check README.md for detailed API reference
- **Issues**: Report bugs or request features on GitHub
- **Community**: Join MCP community discussions
- **Logs**: Always include server logs when reporting issues

---

**Happy file managing with MCP! 🎉**