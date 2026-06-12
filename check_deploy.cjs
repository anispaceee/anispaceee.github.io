const https = require('https');
https.get('https://afterrain-2005.github.io/', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('HTML status:', res.statusCode);
    console.log('HTML length:', d.length);
    // Check for JS file reference
    const m = d.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (m) {
      console.log('JS ref:', m[1]);
      // Try fetching the JS
      https.get('https://afterrain-2005.github.io' + m[1], {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, r2 => {
        let j = '';
        r2.on('data', c => j += c);
        r2.on('end', () => {
          console.log('JS status:', r2.statusCode);
          console.log('JS length:', j.length);
          // Check for syntax errors by looking for common patterns
          console.log('Has createRoot:', j.includes('createRoot'));
          console.log('Has App:', j.includes('App'));
          // Check for the 404.html redirect issue
        });
      }).on('error', e => console.error('JS error:', e.message));
    }
    // Also check the 404.html
    https.get('https://afterrain-2005.github.io/info/anime/1', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, r3 => {
      console.log('SPA route status:', r3.statusCode);
    }).on('error', e => console.error('SPA route error:', e.message));
  });
}).on('error', e => console.error('HTML error:', e.message));
