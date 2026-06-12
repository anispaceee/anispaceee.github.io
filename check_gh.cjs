const https = require('https');

https.get('https://api.github.com/repos/afterRain-2005/afterRain-2005.github.io/actions/runs?per_page=5', {
  headers: { 'User-Agent': 'ANISpace', 'Accept': 'application/vnd.github+json' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    try {
      const data = JSON.parse(d);
      data.workflow_runs.forEach(run => {
        console.log(`#${run.run_number} ${run.status} ${run.conclusion || '-'} ${run.head_commit.message.split('\n')[0]} (${run.created_at})`);
      });
    } catch(e) {
      console.log('Parse error:', d.substring(0, 500));
    }
  });
}).on('error', e => console.error(e.message));
