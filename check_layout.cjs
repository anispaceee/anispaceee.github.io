const https = require('https');
https.get('https://afterrain-2005.github.io/', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const m = d.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (m) {
      console.log('JS:', m[1]);
      https.get('https://afterrain-2005.github.io' + m[1], {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, r2 => {
        let j = '';
        r2.on('data', c => j += c);
        r2.on('end', () => {
          console.log('Has detail-two-column:', j.includes('detail-two-column'));
          console.log('Has detail-nsfw-notice:', j.includes('detail-nsfw-notice'));
          console.log('Has detail-sidebar:', j.includes('detail-sidebar'));
          console.log('Has detail-breadcrumb:', j.includes('detail-breadcrumb'));
        });
      }).on('error', e => console.error(e.message));
    }
  });
}).on('error', e => console.error(e.message));
