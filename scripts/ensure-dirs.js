#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const dirs = process.argv.slice(2);

if (!dirs.length) {
  console.error('No directories provided.');
  process.exit(1);
}

dirs.forEach((dir) => {
  const target = path.resolve(WORKSPACE_ROOT, dir);
  fs.mkdirSync(target, { recursive: true });
  console.log(`Ensured directory ${path.relative(WORKSPACE_ROOT, target) || '.'}`);
});
