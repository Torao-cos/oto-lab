const fs = require('fs');
const s = fs.readFileSync('index.html', 'utf8');
for (const m of s.matchAll(/<script>([\s\S]*?)<\/script>/g)) new Function(m[1]);
console.log('JS構文OK');
