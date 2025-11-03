#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.github', 'config', 'ComparisonConfig.yml');
const HISTORY_PATH = path.join(WORKSPACE_ROOT, 'metadata', 'comparison-history.json');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'Comparison');
const FILTERED_MATRIX = process.env.FILTERED_MATRIX || '[]';
const RUN_TIMESTAMP = process.env.RUN_TIMESTAMP || new Date().toISOString();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return {};
  }

  try {
    const content = fs.readFileSync(HISTORY_PATH, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn(`⚠️  Unable to parse history file. Starting fresh. Error: ${error.message}`);
  }

  return {};
}

function parseProfiles(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const profiles = [];

  let inProfiles = false;
  let current = null;

  const pushCurrent = () => {
    if (current && current.dest) {
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
  });

  pushCurrent();
  return profiles;
}

function loadCurrentProfiles() {
  const yamlContent = fs.readFileSync(CONFIG_PATH, 'utf8');
  const profiles = parseProfiles(yamlContent);
  const map = new Map();
  profiles.forEach((profile) => {
    map.set(profile.dest, {
      leftIg: profile.leftIg,
      rightIg: profile.rightIg,
    });
  });
  return map;
}

function readComparisonStatus(entry) {
  const searchRoot = path.join(OUTPUT_DIR, entry.artifactName || path.basename(entry.dest));

  function findStatusFile(dir) {
    if (!fs.existsSync(dir)) {
      return null;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entryDirent of entries) {
      const entryPath = path.join(dir, entryDirent.name);
      if (entryDirent.isFile() && entryDirent.name === 'comparison-status.json') {
        return entryPath;
      }
      if (entryDirent.isDirectory()) {
        const nested = findStatusFile(entryPath);
        if (nested) {
          return nested;
        }
      }
    }

    return null;
  }

  const statusPath = findStatusFile(searchRoot);
  if (!statusPath) {
    return null;
  }

  try {
    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (statusData && typeof statusData.status === 'string') {
      return statusData;
    }
  } catch (error) {
    console.warn(`⚠️  Unable to parse status file for ${entry.dest}: ${error.message}`);
  }

  return null;
}

function main() {
  const history = readHistory();
  const currentProfiles = loadCurrentProfiles();
  const filteredEntries = JSON.parse(FILTERED_MATRIX);
  const filteredByDest = new Map(filteredEntries.map((entry) => [entry.dest, entry]));

  // Remove entries no longer present in config
  Object.keys(history).forEach((dest) => {
    if (!currentProfiles.has(dest)) {
      delete history[dest];
    }
  });

  // Update or add entries based on run
  currentProfiles.forEach((profileMeta, dest) => {
    const existing = history[dest] || {};
    const updated = {
      leftIg: profileMeta.leftIg,
      rightIg: profileMeta.rightIg,
      status: existing.status || 'unknown',
      lastRun: existing.lastRun || null,
    };

    if (filteredByDest.has(dest)) {
      const entry = filteredByDest.get(dest);
      const statusData = readComparisonStatus(entry);
      if (statusData) {
        updated.status = statusData.status;
        updated.lastRun = statusData.timestamp || RUN_TIMESTAMP;
      }
    }

    history[dest] = updated;
  });

  const sortedKeys = Object.keys(history).sort();
  const sortedHistory = {};
  sortedKeys.forEach((key) => {
    sortedHistory[key] = history[key];
  });

  fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(sortedHistory, null, 2)}\n`, 'utf8');
  console.log(`✅ Updated comparison history for ${sortedKeys.length} entries.`);
}

main();
