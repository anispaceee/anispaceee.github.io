const https = require('https');

// Fetch the JS and look around the error location
https.get('https://afterrain-2005.github.io/assets/index-TUaV4coO.js', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let js = '';
  res.on('data', c => js += c);
  res.on('end', () => {
    // The error is at line 4665, char 137465
    // Let's look for "extends" near that position
    // Since we can't easily map line:col to byte offset, search for class extends patterns
    // that might reference undefined modules

    // Look for WebTorrent related code
    const wtIdx = js.indexOf('WebTorrent');
    if (wtIdx >= 0) {
      console.log('WebTorrent found at:', wtIdx);
      console.log('Context:', js.substring(Math.max(0, wtIdx - 50), wtIdx + 200));
    }

    // Look for common "extends undefined" patterns
    const extendsIdx = js.indexOf('extends ');
    let count = 0;
    let pos = 0;
    while (count < 5 && pos < js.length) {
      const idx = js.indexOf('extends ', pos);
      if (idx === -1) break;
      // Check if what follows looks like a variable (not a known class)
      const after = js.substring(idx + 8, idx + 40);
      if (!after.startsWith('Event') && !after.startsWith('Error') && !after.startsWith('React') && !after.startsWith('Component') && !after.startsWith('Transform') && !after.startsWith('Readable') && !after.startsWith('Writable') && !after.startsWith('Duplex') && !after.startsWith('Stream')) {
        console.log(`\nExtends at ${idx}: ...${js.substring(Math.max(0, idx - 30), idx + 50)}...`);
        count++;
      }
      pos = idx + 8;
    }
  });
}).on('error', e => console.error(e.message));
