const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');

const server = new Server(
  { name: 'minimal-filesystem-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Minimal tool definitions with explicit schemas
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path'
            }
          },
          required: ['path'],
          additionalProperties: false
        }
      },
      {
        name: 'write_file', 
        description: 'Write a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path'
            },
            content: {
              type: 'string',
              description: 'File content'
            }
          },
          required: ['path', 'content'],
          additionalProperties: false
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'read_file') {
    return {
      content: [{
        type: 'text',
        text: `Reading file: ${args.path}`
      }]
    };
  }
  
  if (name === 'write_file') {
    return {
      content: [{
        type: 'text', 
        text: `Writing to file: ${args.path}`
      }]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Minimal server started');
}

main().catch(console.error);