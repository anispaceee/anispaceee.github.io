const https = require('https');
const fs = require('fs');

https.get('https://afterrain-2005.github.io/assets/index-TUaV4coO.js', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let js = '';
  res.on('data', c => js += c);
  res.on('end', () => {
    // Error at line 4665:137465
    // Split by newlines to find line 4665
    const lines = js.split('\n');
    console.log('Total lines:', lines.length);

    if (lines.length >= 4665) {
      const line = lines[4664]; // 0-indexed
      console.log('Line 4665 length:', line.length);
      // Character 137465
      const pos = 137465;
      console.log('Around pos 137465:', line.substring(Math.max(0, pos - 200), pos + 200));
    } else {
      console.log('File has fewer lines than 4665');
      // The file might be minified to fewer lines
      // Try to find the error by searching for "extends" near position
      // 137465 is likely a byte offset in the whole file
      console.log('Around byte 137465:', js.substring(137265, 137665));
    }
  });
}).on('error', e => console.error(e.message));
