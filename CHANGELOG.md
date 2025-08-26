# Changelog

All notable changes to the MCP Filesystem Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-07-25

### 🎉 Major Release - Generic MCP Filesystem Server

This release transforms the project from a Perplexity-specific implementation to a generic, configurable MCP filesystem server that works with any MCP-compatible client.

### ✨ Added

#### Core Features
- **Generic MCP Server**: Renamed from PerplexityFilesystemServer to McpFilesystemServer
- **Configuration Management**: Comprehensive configuration system supporting:
  - Environment variables (MCP_FS_* prefix)
  - JSON/YAML configuration files
  - Command-line arguments
  - Default settings with priority system
- **Configurable Security Levels**: 
  - `strict` (default): Maximum security restrictions
  - `moderate`: Balanced security and functionality  
  - `permissive`: Minimal restrictions with basic safety
- **Enhanced File Operations**: New tools for comprehensive file management
- **File Type Filtering**: Configurable allowlist/blocklist for file extensions
- **Flexible Directory Access**: Dynamic allowed directories configuration

#### Enhanced Tools
- **`copy_file`**: Copy files/directories with collision handling strategies
- **`delete_file`**: Safe deletion with confirmation system and recovery information
- **Collision Handling**: Skip, overwrite, rename, or fail strategies
- **Backup Creation**: Optional backup before deletion operations
- **Dry Run Mode**: Preview operations without executing them

#### Security & Validation
- **Path Validation**: Enhanced security with configurable allowed directories
- **File Size Limits**: Configurable maximum file sizes with human-readable formats
- **Security Event Logging**: Comprehensive audit trails
- **Input Validation**: Robust validation using Zod schemas
- **Permission Management**: macOS Full Disk Access detection and guidance

#### Developer Experience
- **Comprehensive Testing**: 90%+ test coverage across all components
- **TypeScript Support**: Full TypeScript implementation with strict typing
- **Error Handling**: Detailed error classification and user-friendly messages
- **Logging System**: Configurable logging levels and destinations
- **Development Tools**: Hot-reload, debugging, and inspection support

### 🔄 Changed

#### Breaking Changes
- **Server Name**: Changed from `mcp-filesystem-perplexity` to `mcp-filesystem-server`
- **Configuration Format**: New configuration schema (migration guide provided)
- **Tool Schemas**: Updated to proper JSON Schema format for MCP compliance
- **Security Defaults**: More restrictive defaults for enhanced security

#### Improvements
- **Performance**: Optimized file operations and memory usage
- **Error Messages**: More descriptive and actionable error messages
- **Documentation**: Complete rewrite with setup tutorials and examples
- **Code Structure**: Modular architecture for better maintainability

### 🐛 Fixed
- **JSON Schema Validation**: Fixed "invalid literal value, expected 'object'" errors
- **Tool Registration**: Proper MCP capabilities advertisement
- **Path Resolution**: Improved path handling and validation
- **Memory Leaks**: Fixed potential memory issues in large file operations
- **Cross-Platform**: Better Windows/macOS/Linux compatibility

### 🗑️ Removed
- **Perplexity-Specific Code**: All client-specific implementations removed
- **Legacy Configuration**: Old configuration format deprecated
- **Unused Dependencies**: Cleaned up package dependencies

### 📚 Documentation
- **README.md**: Complete rewrite with feature overview and quick start
- **SETUP_TUTORIAL.md**: Comprehensive setup guide for all MCP clients
- **API Documentation**: Detailed tool schemas and examples
- **Security Guide**: Best practices and configuration recommendations
- **Troubleshooting**: Common issues and solutions

### 🧪 Testing
- **Unit Tests**: Comprehensive test suite for all components
- **Integration Tests**: End-to-end testing with real MCP clients
- **Security Tests**: Validation of security boundaries and restrictions
- **Performance Tests**: Large file and directory handling validation

### 🚀 Deployment
- **NPM Package**: Ready for global installation via npm
- **Docker Support**: Container deployment configuration
- **System Service**: systemd service file templates
- **CI/CD**: Automated testing and release workflows

## [1.0.0] - 2024-07-01

### Initial Release (Perplexity-Specific)
- Basic filesystem operations (read, write, list)
- Perplexity Desktop integration
- macOS-specific implementation
- Basic security validation

---

## Migration Guide from 1.x to 2.x

### Configuration Changes
```json
// Old format (1.x)
{
  "allowedPaths": ["~/Documents"]
}

// New format (2.x)
{
  "allowedDirectories": ["~/Documents"],
  "securityLevel": "moderate",
  "enableEnhancedTools": true
}
```

### Client Configuration
```json
// Old
{
  "mcpServers": {
    "filesystem": {
      "command": "perplexity-filesystem-server"
    }
  }
}

// New
{
  "mcpServers": {
    "filesystem": {
      "command": "mcp-filesystem-server",
      "env": {
        "MCP_FS_ALLOWED_DIRS": "~/Documents,~/Downloads",
        "MCP_FS_SECURITY_LEVEL": "moderate"
      }
    }
  }
}
```

### Tool Names
All tool names remain the same:
- `read_file` ✅
- `write_file` ✅  
- `list_directory` ✅
- `copy_file` ✨ (new)
- `delete_file` ✨ (new)

For detailed migration instructions, see [SETUP_TUTORIAL.md](./SETUP_TUTORIAL.md).