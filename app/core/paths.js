const path = require('path');
const fs = require('fs');

let root = '';

function init(base) {
  root = base;
  for (const d of ['versions', 'libraries', 'assets/indexes', 'assets/objects', 'assets/log_configs', 'runtime', 'instances', 'cache']) {
    fs.mkdirSync(path.join(root, d), { recursive: true });
  }
}

const p = (...a) => path.join(root, ...a);

module.exports = { init, p, get root() { return root; } };
