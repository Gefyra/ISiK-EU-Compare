#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'Comparison');
const INDEX_PATH = path.join(OUTPUT_DIR, 'index.html');

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function buildEntries() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return [];
  }

  const entries = fs
    .readdirSync(OUTPUT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return entries.map((name) => {
    const entryDir = path.join(OUTPUT_DIR, name);
    const hasIndex = fs.existsSync(path.join(entryDir, 'index.html'));
    const hasLog = fs.existsSync(path.join(entryDir, 'compare.log'));

    if (hasIndex) {
      return `<li><a href="${name}/index.html">${name}</a></li>`;
    }

    if (hasLog) {
      return `<li><strong>${name}</strong>: ❌ Failed – <a href="${name}/compare.log">View error log</a></li>`;
    }

    return `<li><strong>${name}</strong>: ⚠️ No result found</li>`;
  });
}

function main() {
  ensureOutputDir();
  const listItems = buildEntries();

  const html = [
    '<html><head><title>Overview</title></head><body><h1>Result overview</h1><ul>',
    ...listItems,
    '</ul></body></html>',
  ].join('');

  fs.writeFileSync(INDEX_PATH, html, 'utf8');
  console.log(`✅ Generated ${path.relative(WORKSPACE_ROOT, INDEX_PATH)}`);
}

main();
