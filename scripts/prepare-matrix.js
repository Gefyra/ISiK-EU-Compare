#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.github', 'config', 'ComparisonConfig.yml');

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

function writeOutput(matrix) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    throw new Error('GITHUB_OUTPUT is not defined.');
  }

  fs.appendFileSync(outputFile, `matrix=${matrix}${require('os').EOL}`, 'utf8');
}

function main() {
  const yamlContent = readConfig();
  const profiles = parseProfiles(yamlContent);

  const enriched = profiles.map((profile) => ({
    ...profile,
    artifactName: path.basename(profile.dest),
  }));

  const matrixJson = JSON.stringify(enriched);
  writeOutput(matrixJson);

  console.log(`Prepared comparison matrix with ${enriched.length} entries.`);
}

main();
