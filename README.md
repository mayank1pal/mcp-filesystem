# MCP Filesystem Server

A generic, secure, and configurable Model Context Protocol (MCP) filesystem server that provides comprehensive file operations for any MCP-compatible client.

## 🚀 Features

### Core Filesystem Operations
- **📖 Read Files** - Read file contents with automatic encoding detection
- **✏️ Write Files** - Write content to files with directory creation support
- **📁 List Directories** - Browse directories with detailed metadata and sorting

### Enhanced Operations (Optional)
- **📋 Copy Files/Directories** - Copy with collision handling and progress tracking
- **🗑️ Delete Files/Directories** - Safe deletion with confirmation system and recovery info

### Security & Configuration
- **🔒 Configurable Security Levels** - Strict, moderate, or permissive modes
- **📂 Directory Access Control** - Restrict access to specific directories
- **📏 File Size Limits** - Configurable maximum file sizes
- **🛡️ File Type Filtering** - Allow/block specific file extensions
- **📊 Comprehensive Logging** - Detailed operation logs and security events

## 📦 Installation

### Option 1: NPM Global Installation
```bash
npm install -g mcp-filesystem-server
```

### Option 2: Local Development Setup
```bash
git clone <repository-url>
cd mcp-filesystem-server
npm install
npm run build
```

## ⚙️ Configuration

The server supports multiple configuration methods with the following priority order:
1. Command line arguments
2. Environment variables
3. Configuration files (JSON/YAML)
4. Default settings

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_FS_ALLOWED_DIRS` | Comma-separated list of allowed directories | `~/Documents,~/Desktop` |
| `MCP_FS_SECURITY_LEVEL` | Security level: `strict`, `moderate`, `permissive` | `strict` |
| `MCP_FS_MAX_FILE_SIZE` | Maximum file size (e.g., "10MB", "1GB") | `10MB` |
| `MCP_FS_ENABLE_ENHANCED_TOOLS` | Enable copy/delete tools: `true`/`false` | `false` |
| `MCP_FS_CONFIG_FILE` | Path to configuration file | - |

### Configuration File Example

Create `mcp-filesystem.json`:
```json
{
  "allowedDirectories": [
    "~/Documents",
    "~/Downloads", 
    "~/Desktop",
    "~/Projects"
  ],
  "securityLevel": "moderate",
  "maxFileSize": "50MB",
  "enableEnhancedTools": true,
  "allowedExtensions": ["*"],
  "blockedExtensions": [".exe", ".bat", ".scr"],
  "logLevel": "info"
}
```

## 🔧 Setup Tutorial

### For Perplexity Desktop

1. **Install or build the server** (see Installation section above)

2. **Create configuration file** (optional but recommended):
   ```bash
   cat > ~/.config/mcp-filesystem.json << EOF
   {
     "allowedDirectories": ["~/Documents", "~/Downloads", "~/Desktop"],
     "securityLevel": "moderate",
     "enableEnhancedTools": true,
     "maxFileSize": "10MB"
   }
   EOF
   ```

3. **Add to Perplexity Desktop configuration**:
   
   Open Perplexity Desktop settings and add this MCP server configuration:
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

   Or for local development:
   ```json
   {
     "mcpServers": {
       "filesystem": {
         "command": "node",
         "args": ["/path/to/mcp-filesystem-server/dist/index.js"],
         "env": {
           "MCP_FS_ALLOWED_DIRS": "~/Documents,~/Downloads,~/Desktop",
           "MCP_FS_SECURITY_LEVEL": "moderate",
           "MCP_FS_ENABLE_ENHANCED_TOOLS": "true"
         }
       }
     }
   }
   ```

4. **Restart Perplexity Desktop** completely to load the new configuration

### For Claude Desktop

1. **Install the server** (same as above)

2. **Add to Claude Desktop configuration**:
   
   Edit `~/.claude_desktop_config.json`:
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

3. **Restart Claude Desktop**

### For Other MCP Clients

The server works with any MCP-compatible client. Use the same configuration format with the appropriate client's configuration method.

## 🛠️ Available Tools

### Core Tools (Always Available)

#### `read_file`
Read the contents of a file from the filesystem.

**Parameters:**
- `path` (string, required): Path to the file to read

**Example:**
```json
{
  "name": "read_file",
  "arguments": {
    "path": "~/Documents/example.txt"
  }
}
```

#### `write_file`
Write content to a file in the filesystem.

**Parameters:**
- `path` (string, required): Path to the file to write
- `content` (string, required): Content to write to the file
- `encoding` (string, optional): File encoding (default: "utf8")
- `createDirectories` (boolean, optional): Create parent directories if they don't exist
- `overwrite` (boolean, optional): Overwrite existing files (default: true)

#### `list_directory`
List the contents of a directory with file type indicators and metadata.

**Parameters:**
- `path` (string, required): Path to the directory to list
- `showHidden` (boolean, optional): Show hidden files (default: false)
- `sortBy` (string, optional): Sort by "name", "size", "modified", or "type" (default: "name")
- `sortOrder` (string, optional): Sort order "asc" or "desc" (default: "asc")

### Enhanced Tools (Optional)

Enable with `enableEnhancedTools: true` in configuration.

#### `copy_file`
Copy files or directories with collision handling and progress tracking.

**Parameters:**
- `source` (string, required): Source path
- `destination` (string, required): Destination path
- `recursive` (boolean, optional): Copy directories recursively
- `collisionStrategy` (string, optional): "skip", "overwrite", "rename", or "fail"
- `preserveTimestamps` (boolean, optional): Preserve file timestamps
- `followSymlinks` (boolean, optional): Follow symbolic links

#### `delete_file`
Delete files or directories with confirmation system and recovery information.

**Parameters:**
- `path` (string|array, required): Path(s) to delete
- `recursive` (boolean, optional): Delete directories recursively
- `confirmationStrategy` (string, optional): "none", "prompt", "dry_run", or "safe_mode"
- `force` (boolean, optional): Force deletion without confirmation
- `createBackup` (boolean, optional): Create backup before deletion
- `dryRun` (boolean, optional): Show what would be deleted without deleting

## 🔒 Security Levels

### Strict Mode (Default)
- Only explicitly allowed directories
- No symlink following
- Maximum security restrictions
- Comprehensive logging
- Enhanced tools disabled by default

### Moderate Mode
- Allowed directories + reasonable subdirectories
- Limited symlink following
- Balanced security and functionality
- Standard logging
- Enhanced tools can be enabled

### Permissive Mode
- Broader directory access
- Symlink following allowed
- Minimal restrictions with basic safety
- Reduced logging
- All features available

## 🧪 Testing

### Run Tests
```bash
npm test
npm run test:coverage
```

### Manual Testing
```bash
# Test with MCP Inspector
npm run inspect

# Test with direct JSON-RPC
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node dist/index.js
```

## 🐛 Troubleshooting

### Common Issues

#### "No tools listed" or empty capabilities
- **Cause**: Running old version or wrong server path
- **Solution**: Verify correct path in client configuration, restart client completely

#### "Invalid literal value, expected 'object'" error
- **Cause**: Client-side validation issue or version mismatch
- **Solution**: Update to latest version, ensure proper JSON Schema format

#### Permission denied errors
- **Cause**: Insufficient filesystem permissions
- **Solution**: Check file permissions, ensure allowed directories are accessible

#### Files not found in allowed directories
- **Cause**: Path not in allowed directories list
- **Solution**: Add directory to `allowedDirectories` configuration

### Debug Mode

Enable debug logging:
```bash
export MCP_FS_LOG_LEVEL=debug
node dist/index.js
```

### Verify Server Status

Test server initialization:
```bash
echo '{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test", "version": "1.0.0"}}}' | node dist/index.js
```

Expected response should include:
```json
{
  "result": {
    "serverInfo": {
      "name": "mcp-filesystem-server",
      "version": "2.0.0"
    },
    "capabilities": {
      "tools": {
        "listChanged": true
      }
    }
  }
}
```

## 📝 Development

### Project Structure
```
src/
├── config/          # Configuration management
├── permissions/     # Permission checking
├── security/        # Security validation
├── server/          # MCP server implementation
├── tools/           # Filesystem tools
├── types/           # TypeScript type definitions
└── validation/      # Input validation
```

### Building
```bash
npm run build
```

### Linting
```bash
npm run lint
npm run lint:fix
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

ISC License - see LICENSE file for details.

## 🆘 Support

For issues, questions, or contributions:
1. Check the troubleshooting section above
2. Search existing issues
3. Create a new issue with detailed information
4. Include server logs and configuration when reporting bugs

---

**Made with ❤️ for the MCP community**