const https = require('https');

https.get('https://static-host-ujw2lrwn-moban-assets-0424.sealosbja.site/test.txt', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, data));
}).on('error', (err) => {
  console.error('Error:', err.message);
});