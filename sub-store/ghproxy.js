const https = require('https');
const http = require('http');

// Target resource URL to test connectivity
const targetUrl = 'https://raw.githubusercontent.com/peasoft/NoMoreWalls/refs/heads/master/list.meta.yml';

// Proxy base URLs (Acceleration services)
const proxyBases = [
  'https://ghfast.top/',
  'https://ghproxy.com/',
  'https://hub.gitfast.pro/',
  'https://gh.llkk.cc/'
];

function checkConnectivity(fullUrl, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const client = fullUrl.startsWith('https') ? https : http;
    let dataSize = 0;

    const req = client.get(fullUrl, (res) => {
      res.on('data', (chunk) => {
        dataSize += chunk.length;
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        // Check status code and data size > 1 byte
        const isSuccess = res.statusCode >= 200 && res.statusCode < 400 && dataSize > 1;
        resolve({ 
          url: fullUrl, 
          status: res.statusCode, 
          time: duration, 
          size: dataSize,
          success: isSuccess 
        });
      });
    });

    req.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({ 
        url: fullUrl, 
        error: err.message, 
        time: duration, 
        size: 0,
        success: false 
      });
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      resolve({ 
        url: fullUrl, 
        error: 'Timeout', 
        time: timeout, 
        size: 0,
        success: false 
      });
    });
  });
}

async function main() {
  console.log('Starting connectivity test...\n');
  console.log('URL'.padEnd(60), 'Status', 'Size', 'Time(ms)', 'Result');
  console.log('-'.repeat(90));

  for (const base of proxyBases) {
    // Construct full proxy URL
    const fullUrl = base + targetUrl;
    const result = await checkConnectivity(fullUrl);
    const status = result.success ? 'OK' : 'FAIL';
    const statusCode = result.status || 'N/A';
    const size = result.size || 0;
    console.log(
      result.url.padEnd(60), 
      String(statusCode).padEnd(6), 
      String(size).padEnd(4), 
      String(result.time).padEnd(9), 
      status
    );
  }
  
  console.log('-'.repeat(90));
  console.log('Test completed.');
}

main();