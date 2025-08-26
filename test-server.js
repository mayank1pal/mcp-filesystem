const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { zodToJsonSchema } = require('zod-to-json-schema');
const { z } = require('zod');

// Create a simple test schema
const testSchema = z.object({
  path: z.string().min(1, 'Path is required')
});

// Create server
const server = new Server(
  { name: 'test-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Set up handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const schema = zodToJsonSchema(testSchema);
  console.error('Generated schema:', JSON.stringify(schema, null, 2));
  
  return {
    tools: [
      {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: schema
      }
    ]
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Test server started');
}

main().catch(console.error);