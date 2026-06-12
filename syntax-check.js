const fs = require('fs');
const s = fs.readFileSync('index.html', 'utf8');
const m = s.match(/<script>([\s\S]*)<\/script>/);
new Function(m[1]);
console.log('JS構文OK');
