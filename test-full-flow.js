const { spawn } = require('child_process');

function testFullMCPFlow() {
  const server = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let responses = [];
  
  server.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Server output:', output);
    
    // Look for JSON responses
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.startsWith('{"result"') || line.startsWith('{"error"')) {
        try {
          const parsed = JSON.parse(line);
          responses.push(parsed);
        } catch (e) {
          // Ignore parsing errors
        }
      }
    });
  });

  server.stderr.on('data', (data) => {
    console.error('Server stderr:', data.toString());
  });

  // Test sequence
  const tests = [
    // 1. Initialize
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" }
      }
    },
    // 2. List tools
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }
  ];

  let testIndex = 0;
  
  function sendNextTest() {
    if (testIndex < tests.length) {
      const test = tests[testIndex++];
      console.log(`\n=== Sending test ${testIndex}: ${test.method} ===`);
      server.stdin.write(JSON.stringify(test) + '\n');
      
      // Send next test after a delay
      setTimeout(sendNextTest, 1000);
    } else {
      // End the test
      server.stdin.end();
    }
  }

  server.on('close', (code) => {
    console.log('\n=== FINAL RESULTS ===');
    console.log(`Server exited with code: ${code}`);
    console.log(`Total responses: ${responses.length}`);
    
    responses.forEach((response, i) => {
      console.log(`\nResponse ${i + 1}:`);
      if (response.result && response.result.serverInfo) {
        console.log(`  Server: ${response.result.serverInfo.name} v${response.result.serverInfo.version}`);
        console.log(`  Capabilities:`, JSON.stringify(response.result.capabilities));
      }
      if (response.result && response.result.tools) {
        console.log(`  Tools found: ${response.result.tools.length}`);
        response.result.tools.forEach(tool => {
          console.log(`    - ${tool.name}: ${tool.inputSchema?.type || 'NO TYPE'}`);
        });
      }
      if (response.error) {
        console.log(`  ERROR:`, response.error);
      }
    });
  });

  // Start the test sequence
  sendNextTest();
}

testFullMCPFlow();