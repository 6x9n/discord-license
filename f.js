const fs = require('fs');
let s = fs.readFileSync('panel_x7k2n9p4h8r3/admin.js','utf8');
s = s.replace(/ \+ '<td data-label="Boosts">[\s\S]*?<\/td>'/g, '');
fs.writeFileSync('panel_x7k2n9p4h8r3/admin.js', s);