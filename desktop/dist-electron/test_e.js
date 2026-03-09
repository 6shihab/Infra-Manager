const e = require('electron');
console.log('type:', typeof e);
if (typeof e === 'object') {
  console.log('keys:', Object.keys(e || {}).slice(0, 10).join(', '));
  console.log('app:', typeof e.app);
} else {
  console.log('value:', String(e).slice(0, 80));
}
process.exit(0);
