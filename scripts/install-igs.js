#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.github', 'config', 'ComparisonConfig.yml');
const DEFAULT_REGISTRY = 'https://packages.simplifier.net';

function readConfig(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read comparison config at ${filePath}: ${error.message}`);
  }
}

function extractPackageEntries(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const entries = [];
  let inIgsSection = false;
  let current = null;

  const pushCurrent = () => {
    if (current && current.name) {
      entries.push(current);
    }
    current = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (/^\s*#/u.test(line)) {
      return;
    }

    if (!inIgsSection) {
      if (/^\s*igs\s*:/u.test(line)) {
        inIgsSection = true;
      }
      return;
    }

    if (/^\s*profiles\s*:/u.test(line)) {
      pushCurrent();
      inIgsSection = false;
      return;
    }

    const nameMatch = line.match(/^\s*-\s+name:\s*(.+)\s*$/u);
    if (nameMatch) {
      pushCurrent();
      current = {
        spec: nameMatch[1].trim(),
      };
      const { name } = splitPackageSpec(current.spec);
      current.name = name;
      return;
    }

    if (!current) {
      return;
    }

    const overrideMatch = line.match(/^\s*overrideNpm:\s*(.+)\s*$/u);
    if (overrideMatch) {
      current.override = overrideMatch[1].trim();
    }
  });

  pushCurrent();
  return entries;
}

function splitPackageSpec(spec) {
  const atIndex = spec.indexOf('@', 1);
  if (atIndex > 0) {
    return {
      name: spec.slice(0, atIndex),
      version: spec.slice(atIndex + 1),
    };
  }
  return { name: spec, version: null };
}

function installPackages(entries, registry) {
  const installSpecs = [
    ...new Set(
      entries.map((entry) => entry.override || entry.spec),
    ),
  ];

  if (!installSpecs.length) {
    console.log('No IG packages to install.');
    return;
  }

  const npmArgs = ['--registry', registry, 'install', '--no-save', ...installSpecs];
  const spawnOptions = {
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  };

  let result;
  if (process.platform === 'win32') {
    const shell = process.env.ComSpec || 'cmd.exe';
    result = spawnSync(shell, ['/c', 'npm', ...npmArgs], spawnOptions);
  } else {
    result = spawnSync('npm', npmArgs, spawnOptions);
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`npm exited with code ${result.status}`);
  }
}

function syncCache(entries) {
  const cacheDir = process.env.FHIR_CACHE_DIR || path.join(os.homedir(), '.fhir', 'packages');
  fs.mkdirSync(cacheDir, { recursive: true });

  const uniqueNames = [...new Set(entries.map((entry) => entry.name))];

  uniqueNames.forEach((pkgName) => {
    const nodeModulesDir = path.join(WORKSPACE_ROOT, 'node_modules');
    let modulePath = path.join(nodeModulesDir, pkgName);

    if (!fs.existsSync(modulePath) && fs.existsSync(nodeModulesDir)) {
      const matchedName = fs
        .readdirSync(nodeModulesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .find((entryName) => entryName.toLowerCase() === pkgName.toLowerCase());

      if (matchedName) {
        modulePath = path.join(nodeModulesDir, matchedName);
      }
    }

    if (!fs.existsSync(modulePath)) {
      console.warn(`⚠️  Skipping ${pkgName} – not found in node_modules.`);
      return;
    }

    const packagedSubDir = path.join(modulePath, 'package');
    const hasPackageSubDir = fs.existsSync(packagedSubDir) && fs.statSync(packagedSubDir).isDirectory();
    const contentDir = hasPackageSubDir ? packagedSubDir : modulePath;
    const metadataPath = hasPackageSubDir
      ? path.join(packagedSubDir, 'package.json')
      : path.join(modulePath, 'package.json');

    if (!fs.existsSync(contentDir)) {
      console.warn(`⚠️  Skipping ${pkgName} – expected package content directory is missing.`);
      return;
    }

    if (!fs.existsSync(metadataPath)) {
      console.warn(`⚠️  Skipping ${pkgName} – missing package metadata (${metadataPath}).`);
      return;
    }

    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      console.warn(`⚠️  Skipping ${pkgName} – unable to read package metadata: ${error.message}`);
      return;
    }

    const targetName = `${metadata.name}#${metadata.version}`;
    const targetDir = path.join(cacheDir, targetName);
    const targetPackageDir = path.join(targetDir, 'package');

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetPackageDir, { recursive: true });

    fs.cpSync(contentDir, targetPackageDir, { recursive: true });
    console.log(`✅ Cached ${targetName}`);
  });
}

function main() {
  const yamlContent = readConfig(CONFIG_PATH);
  const packageEntries = extractPackageEntries(yamlContent);
  const uniqueEntries = packageEntries.filter(
    (entry, index, arr) => arr.findIndex((other) => other.spec === entry.spec) === index,
  );
  const isDryRun = process.argv.includes('--dry-run');
  const syncCacheRequested = process.argv.includes('--sync-cache');

  if (!uniqueEntries.length) {
    console.log('No IG packages found in ComparisonConfig.yml. Nothing to install.');
    return;
  }

  const registry = process.env.SIMPLIFIER_REGISTRY || DEFAULT_REGISTRY;

  console.log('Installing IG packages:');
  uniqueEntries.forEach((entry) => {
    if (entry.override) {
      console.log(`  - ${entry.spec} (override: ${entry.override})`);
    } else {
      console.log(`  - ${entry.spec} (registry: ${registry})`);
    }
  });

  if (isDryRun) {
    console.log('Dry run enabled; skipping npm install.');
    if (syncCacheRequested) {
      console.log('Cache sync skipped because this is a dry run.');
    }
    return;
  }

  installPackages(uniqueEntries, registry);

  if (syncCacheRequested) {
    syncCache(uniqueEntries);
  }
}
if (require.main === module) {
  main();
}
