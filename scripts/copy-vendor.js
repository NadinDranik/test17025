const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'gsap', 'dist', 'gsap.min.js');
const destDir = path.join(__dirname, '..', 'js', 'vendor');
const dest = path.join(destDir, 'gsap.min.js');

if (!fs.existsSync(src)) {
  console.warn('copy-vendor: gsap not found, skip');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('copy-vendor: gsap.min.js OK');
