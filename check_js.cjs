const https = require('https');

// Check the built JS for potential runtime errors
https.get('https://afterrain-2005.github.io/assets/index-TUaV4coO.js', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let js = '';
  res.on('data', c => js += c);
  res.on('end', () => {
    // Check for the checkAccessibility method - look for AbortSignal.timeout
    const idx = js.indexOf('AbortSignal.timeout');
    if (idx >= 0) {
      console.log('AbortSignal.timeout found at index:', idx);
      console.log('Context:', js.substring(Math.max(0, idx - 100), idx + 100));
    } else {
      console.log('AbortSignal.timeout NOT found (may be minified differently)');
    }

    // Check for any obvious syntax issues around nsfw-toggle
    const nsfwIdx = js.indexOf('nsfw-toggle');
    if (nsfwIdx >= 0) {
      console.log('\nnsfw-toggle context:', js.substring(Math.max(0, nsfwIdx - 200), nsfwIdx + 200));
    }
  });
}).on('error', e => console.error(e.message));
