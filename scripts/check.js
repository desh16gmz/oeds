// `npm run check` — syntax-checks every .js file so mistakes are caught before you start the bot.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const root = path.join(__dirname, '..');
let failed = 0;
for (const file of [...walk(path.join(root, 'src')), ...walk(__dirname)]) {
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (r.status !== 0) {
    failed++;
    console.error(`✖ ${path.relative(root, file)}\n${r.stderr}`);
  }
}
console.log(failed ? `\n${failed} file(s) have errors.` : '✔ All files passed the syntax check.');
process.exit(failed ? 1 : 0);
