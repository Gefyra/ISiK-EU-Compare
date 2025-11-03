#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.github', 'config', 'ComparisonConfig.yml');
const HISTORY_PATH = path.join(WORKSPACE_ROOT, 'metadata', 'comparison-history.json');
const RUN_ALL = String(process.env.RUN_ALL_COMPARISONS || '').toLowerCase() === 'true';

function readConfig() {
  try {
    return fs.readFileSync(CONFIG_PATH, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ComparisonConfig.yml: ${error.message}`);
  }
}

function parseProfiles(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const profiles = [];

  let inProfiles = false;
  let current = null;

  const pushCurrent = () => {
    if (current && current.dest && current.leftIg && current.rightIg && current.leftProfile && current.rightProfile) {
      profiles.push(current);
    }
    current = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (!inProfiles) {
      if (/^\s*profiles\s*:/u.test(line)) {
        inProfiles = true;
      }
      return;
    }

    if (!line || /^\s*#/u.test(line)) {
      return;
    }

    const destMatch = line.match(/^\s*-\s+dest:\s*(.+)\s*$/u);
    if (destMatch) {
      pushCurrent();
      current = {
        dest: destMatch[1].trim(),
      };
      return;
    }

    if (!current) {
      return;
    }

    const leftIgMatch = line.match(/^\s*leftIg:\s*(.+)\s*$/u);
    if (leftIgMatch) {
      current.leftIg = leftIgMatch[1].trim();
      return;
    }

    const rightIgMatch = line.match(/^\s*rightIg:\s*(.+)\s*$/u);
    if (rightIgMatch) {
      current.rightIg = rightIgMatch[1].trim();
      return;
    }

    const leftProfileMatch = line.match(/^\s*leftProfile:\s*(.+)\s*$/u);
    if (leftProfileMatch) {
      current.leftProfile = leftProfileMatch[1].trim();
      return;
    }

    const rightProfileMatch = line.match(/^\s*rightProfile:\s*(.+)\s*$/u);
    if (rightProfileMatch) {
      current.rightProfile = rightProfileMatch[1].trim();
    }
  });

  pushCurrent();

  return profiles;
}

function loadHistory() {
  try {
    const content = fs.readFileSync(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn(`⚠️  Unable to read comparison history: ${error.message}. Treating as empty history.`);
  }
  return {};
}

function shouldInclude(entry, previous) {
  if (RUN_ALL) {
    return true;
  }

  if (!previous) {
    return true;
  }

  if (!previous.status || previous.status !== 'success') {
    return true;
  }

  if (previous.leftIg !== entry.leftIg || previous.rightIg !== entry.rightIg) {
    return true;
  }

  return false;
}

function writeOutput(matrix, total, selected) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    throw new Error('GITHUB_OUTPUT is not defined.');
  }

  fs.appendFileSync(outputFile, `matrix=${matrix}${os.EOL}`, 'utf8');
  fs.appendFileSync(outputFile, `total=${total}${os.EOL}`, 'utf8');
  fs.appendFileSync(outputFile, `selected=${selected}${os.EOL}`, 'utf8');
  fs.appendFileSync(outputFile, `hasSelections=${selected > 0}${os.EOL}`, 'utf8');
}

function main() {
  const yamlContent = readConfig();
  const profiles = parseProfiles(yamlContent);
  const history = loadHistory();

  const enriched = profiles.map((profile) => ({
    ...profile,
    artifactName: path.basename(profile.dest),
  }));

  const filtered = enriched.filter((entry) => shouldInclude(entry, history[entry.dest]));

  console.log(`Matrix entries total: ${enriched.length}. Selected for run: ${filtered.length}.`);
  if (!RUN_ALL && filtered.length === 0) {
    console.log('All comparisons succeeded previously with unchanged packages. Skipping comparisons.');
  }

  const matrixJson = JSON.stringify(filtered);
  writeOutput(matrixJson, enriched.length, filtered.length);

  console.log(`Prepared comparison matrix with ${filtered.length} entries.`);
}

main();
