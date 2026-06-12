const https = require('https');

// Get the latest index.html
https.get('https://afterrain-2005.github.io/', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('HTML status:', res.statusCode);
    // Extract all asset references
    const jsMatch = d.match(/src="(\/assets\/[^"]+\.js)"/g);
    const cssMatch = d.match(/href="(\/assets\/[^"]+\.css)"/g);
    console.log('JS refs:', jsMatch);
    console.log('CSS refs:', cssMatch);

    // Check for CSP meta tag
    const cspMatch = d.match(/content="(Content-Security-Policy[^"]+)"/);
    if (cspMatch) {
      console.log('\nCSP:', cspMatch[1].substring(0, 500));
    }
  });
}).on('error', e => console.error(e.message));
