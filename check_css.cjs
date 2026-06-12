const https = require('https');

// Check if the CSS file exists
https.get('https://afterrain-2005.github.io/assets/index-DNzRD86c.css', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  console.log('CSS status:', res.statusCode);
  console.log('CSS content-type:', res.headers['content-type']);
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    console.log('CSS length:', d.length);
    console.log('Has nsfw-toggle:', d.includes('nsfw-toggle'));
    console.log('Has nsfw-notice:', d.includes('nsfw-notice'));
  });
}).on('error', e => console.error(e.message));
