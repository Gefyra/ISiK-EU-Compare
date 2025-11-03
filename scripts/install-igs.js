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

function extractPackageNames(yamlContent) {
  const matches = [...yamlContent.matchAll(/^\s*-\s+name:\s*(.+?)\s*$/gm)];
  return matches
    .map(([, name]) => name.trim())
    .filter(Boolean);
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

function installPackages(packages, registry) {
  const npmArgs = ['--registry', registry, 'install', '--no-save', ...packages];
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

function syncCache(packageNames) {
  const cacheDir = process.env.FHIR_CACHE_DIR || path.join(os.homedir(), '.fhir', 'packages');
  fs.mkdirSync(cacheDir, { recursive: true });

  packageNames.forEach((pkgSpec) => {
    const { name: pkgName } = splitPackageSpec(pkgSpec);
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

    const packagedSubDir = path.join(modulePath, 'package');
    const hasPackageSubDir = fs.existsSync(packagedSubDir) && fs.statSync(packagedSubDir).isDirectory();
    const contentDir = hasPackageSubDir ? packagedSubDir : modulePath;
    const metadataPath = hasPackageSubDir
      ? path.join(packagedSubDir, 'package.json')
      : path.join(modulePath, 'package.json');

    if (!fs.existsSync(contentDir)) {
      console.warn(`⚠️  Skipping ${pkgSpec} – expected package content directory is missing.`);
      return;
    }

    if (!fs.existsSync(metadataPath)) {
      console.warn(`⚠️  Skipping ${pkgSpec} – missing package metadata (${metadataPath}).`);
      return;
    }

    let metadata;
    try {
      metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    } catch (error) {
      console.warn(`⚠️  Skipping ${pkgSpec} – unable to read package metadata: ${error.message}`);
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
  const packageNames = extractPackageNames(yamlContent);
  const uniquePackages = [...new Set(packageNames)];
  const isDryRun = process.argv.includes('--dry-run');
  const syncCacheRequested = process.argv.includes('--sync-cache');

  if (!uniquePackages.length) {
    console.log('No IG packages found in ComparisonConfig.yml. Nothing to install.');
    return;
  }

  const registry = process.env.SIMPLIFIER_REGISTRY || DEFAULT_REGISTRY;

  console.log(`Installing IG packages from ${registry}:`);
  uniquePackages.forEach((pkg) => console.log(`  - ${pkg}`));

  if (isDryRun) {
    console.log('Dry run enabled; skipping npm install.');
    if (syncCacheRequested) {
      console.log('Cache sync skipped because this is a dry run.');
    }
    return;
  }

  installPackages(uniquePackages, registry);

  if (syncCacheRequested) {
    syncCache(uniquePackages);
  }
}
if (require.main === module) {
  main();
}
