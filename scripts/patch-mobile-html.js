const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

for (const file of fs.readdirSync(root).filter((name) => name.endsWith('.html'))) {
  const filePath = path.join(root, file);
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (html.includes('css/mobile.css') && !html.includes('css/mobile-perf.css')) {
    html = html.replace(
      '<link rel="stylesheet" href="css/mobile.css">',
      '<link rel="stylesheet" href="css/mobile.css">\n  <link rel="stylesheet" href="css/mobile-perf.css">'
    );
    changed = true;
  }

  if (html.includes('<script src="js/emoji-picker.js"></script>')) {
    html = html.replace(/\s*<script src="js\/emoji-picker\.js"><\/script>\n?/g, '\n');
    changed = true;
  }

  if (file === 'login.html' && !html.includes('css/mobile.css')) {
    html = html.replace(
      '<link rel="stylesheet" href="css/visual-refresh.css">',
      '<link rel="stylesheet" href="css/mobile.css">\n  <link rel="stylesheet" href="css/mobile-perf.css">\n  <link rel="stylesheet" href="css/visual-refresh.css">'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, html);
    console.log('updated', file);
  }
}
