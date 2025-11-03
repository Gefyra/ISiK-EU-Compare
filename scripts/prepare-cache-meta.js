#!/usr/bin/env node

const fs = require('fs');
const os = require('os');

function formatDateUTC(date) {
  return date.toISOString().slice(0, 10);
}

function appendLine(filePath, line) {
  if (!filePath) {
    return;
  }
  fs.appendFileSync(filePath, `${line}${os.EOL}`, 'utf8');
}

function main() {
  const today = formatDateUTC(new Date());

  appendLine(process.env.GITHUB_ENV, `TODAY=${today}`);
  appendLine(process.env.GITHUB_OUTPUT, `today=${today}`);

  console.log(`Prepared cache metadata for ${today}`);
}

main();
