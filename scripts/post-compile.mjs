// tsc 只編譯 .ts，不會把 src/pricing-data.json 帶到 out/。
// 這個 post-compile 步驟負責把快照複製到 out/，讓編譯後的 out/pricing.js
// 能正確 require('./pricing-data.json')。
// 使用場景：npm run compile（`tsc -p ./ && node scripts/post-compile.mjs`）。

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const src = 'src/pricing-data.json';
const dest = 'out/pricing-data.json';

if (!existsSync(src)) {
  console.error(`[post-compile] ${src} does not exist yet. Run \`npm run update-pricing\` first or commit a snapshot.`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[post-compile] copied ${src} -> ${dest}`);
