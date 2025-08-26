const { spawn } = require('child_process');

// Test the MCP server
function testMCPServer() {
  return new Promise((resolve, reject) => {
    const server = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    server.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    server.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Send tools/list request
    const request = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {}
    }) + '\n';

    server.stdin.write(request);
    server.stdin.end();

    server.on('close', (code) => {
      console.log('Server stderr:', stderr);
      console.log('Server stdout:', stdout);
      
      try {
        // Parse the JSON response
        const lines = stdout.trim().split('\n');
        const jsonLine = lines.find(line => line.startsWith('{"result"') || line.startsWith('{"error"'));
        
        if (jsonLine) {
          const response = JSON.parse(jsonLine);
          console.log('Parsed response:', JSON.stringify(response, null, 2));
          
          if (response.result && response.result.tools) {
            console.log('✅ Success! Found', response.result.tools.length, 'tools');
            response.result.tools.forEach((tool, index) => {
              console.log(`Tool ${index + 1}: ${tool.name}`);
              console.log(`  Schema type: ${tool.inputSchema?.type || 'MISSING'}`);
              console.log(`  Has properties: ${!!tool.inputSchema?.properties}`);
            });
          } else if (response.error) {
            console.log('❌ Error response:', response.error);
          }
        } else {
          console.log('❌ No JSON response found in stdout');
        }
        
        resolve({ stdout, stderr, code });
      } catch (error) {
        console.log('❌ Failed to parse response:', error.message);
        reject(error);
      }
    });

    server.on('error', (error) => {
      console.log('❌ Server error:', error);
      reject(error);
    });
  });
}

// Run the test
testMCPServer().catch(console.error);