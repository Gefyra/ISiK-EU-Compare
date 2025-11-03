#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(WORKSPACE_ROOT, '.github', 'config', 'ComparisonConfig.yml');
const EXCLUDED_RESOURCE_TYPES = new Set(['Bundle', 'Composition', 'Observation', 'Parameter']);

function readConfigFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ComparisonConfig.yml: ${error.message}`);
  }
}

function parseIgs(yamlContent) {
  const lines = yamlContent.split(/\r?\n/);
  const igs = [];

  let inIgsSection = false;
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*#/u.test(rawLine)) {
      continue;
    }

    if (/^\s*igs\s*:/u.test(rawLine)) {
      inIgsSection = true;
      current = null;
      continue;
    }

    if (/^\s*profiles\s*:/u.test(rawLine)) {
      break;
    }

    if (!inIgsSection) {
      continue;
    }

    const nameMatch = rawLine.match(/^\s*-\s+name:\s*(.+)\s*$/u);
    if (nameMatch) {
      const rawName = nameMatch[1].trim();
      const { name, version } = splitPackageSpec(rawName);
      current = {
        rawName,
        name,
        requestedVersion: version,
      };
      igs.push(current);
      continue;
    }

    if (!current) {
      continue;
    }

    const groupMatch = rawLine.match(/^\s*group:\s*(.+)\s*$/u);
    if (groupMatch) {
      current.group = groupMatch[1].trim();
    }

    const overrideMatch = rawLine.match(/^\s*overrideNpm:\s*(.+)\s*$/u);
    if (overrideMatch) {
      current.override = overrideMatch[1].trim();
    }
  }

  return igs;
}

function locateModule(pkgName) {
  const nodeModulesDir = path.join(WORKSPACE_ROOT, 'node_modules');
  let modulePath = path.join(nodeModulesDir, pkgName);

  if (fs.existsSync(modulePath)) {
    return modulePath;
  }

  if (!fs.existsSync(nodeModulesDir)) {
    throw new Error(`node_modules directory not found. Please run 'npm run install-igs -- --sync-cache' first.`);
  }

  const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const matched = entries.find((entry) => entry.name.toLowerCase() === pkgName.toLowerCase());
  if (matched) {
    modulePath = path.join(nodeModulesDir, matched.name);
    if (fs.existsSync(modulePath)) {
      return modulePath;
    }
  }

  throw new Error(`Package '${pkgName}' not found in node_modules. Run 'npm run install-igs -- --sync-cache' first.`);
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

function capitalize(value) {
  if (!value) {
    return '';
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function packageLabel(pkgName) {
  if (pkgName === 'hl7.fhir.eu.base') {
    return 'EU-Base';
  }

  if (pkgName === 'de.gematik.isik') {
    return 'ISiK';
  }

  const parts = pkgName.split('.');
  const suffix = parts[parts.length - 1] || pkgName;

  if (pkgName.startsWith('hl7.fhir.eu.')) {
    if (suffix.length <= 3) {
      return suffix.toUpperCase();
    }
    return capitalize(suffix);
  }

  if (parts.length > 1) {
    return parts.slice(parts.length - 2).map(capitalize).join('-');
  }

  return capitalize(pkgName);
}

function slugify(value) {
  if (!value) {
    return 'Profile';
  }

  return value
    .replace(/[^A-Za-z0-9]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function sanitizeLabel(value) {
  if (!value) {
    return 'Label';
  }

  return value
    .replace(/[^A-Za-z0-9-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'Label';
}

function readStructureDefinitions(modulePath) {
  const packagedSubDir = path.join(modulePath, 'package');
  const hasPackageSubDir = fs.existsSync(packagedSubDir) && fs.statSync(packagedSubDir).isDirectory();
  const contentDir = hasPackageSubDir ? packagedSubDir : modulePath;
  const metadataPath = hasPackageSubDir
    ? path.join(packagedSubDir, 'package.json')
    : path.join(modulePath, 'package.json');

  if (!fs.existsSync(contentDir)) {
    throw new Error(`Package directory missing for ${modulePath}. Expected to find package contents.`);
  }

  if (!fs.existsSync(metadataPath)) {
    throw new Error(`FHIR package metadata missing: ${metadataPath}`);
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));

  const files = [];
  collectJsonFiles(contentDir, files);

  const profiles = [];

  files.forEach((filePath) => {
    if (path.basename(filePath) === 'package.json') {
      return;
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.warn(`⚠️  Skipping invalid JSON file ${filePath}: ${error.message}`);
      return;
    }

    if (!json || json.resourceType !== 'StructureDefinition') {
      return;
    }

    if (json.kind !== 'resource') {
      return;
    }

    if (!json.type || !json.url) {
      return;
    }

    if (json.abstract) {
      return;
    }

    profiles.push({
      id: json.id || path.basename(filePath, '.json'),
      name: json.name || json.id || path.basename(filePath, '.json'),
      title: json.title || '',
      type: json.type,
      url: json.url,
      filePath,
    });
  });

  return {
    metadata,
    profiles,
    packageDir: contentDir,
  };
}

function collectJsonFiles(currentDir, results) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });

  entries.forEach((entry) => {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(entryPath, results);
      return;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push(entryPath);
    }
  });

  return results;
}

function buildTypeIndex(packageProfiles) {
  const typeIndex = new Map();

  packageProfiles.forEach((pkg) => {
    pkg.profiles.forEach((profile) => {
      const type = profile.type;
      if (!type) {
        return;
      }

      if (EXCLUDED_RESOURCE_TYPES.has(type)) {
        return;
      }

      if (!typeIndex.has(type)) {
        typeIndex.set(type, []);
      }

      typeIndex.get(type).push({
        profile,
        pkg,
      });
    });
  });

  return typeIndex;
}

function createDestPath(rightPkg, rightProfile, leftPkg, leftProfile) {
  const rightLabel = sanitizeLabel(packageLabel(rightPkg.metadata.name || rightPkg.pkgName || 'right'));
  const leftLabel = sanitizeLabel(packageLabel(leftPkg.metadata.name || leftPkg.pkgName || 'left'));
  const rightSlug = slugify(rightProfile.id || rightProfile.name);
  const leftSlug = slugify(leftProfile.id || leftProfile.name);

  return `Comparison/${rightLabel}-${rightSlug}__${leftLabel}-${leftSlug}`;
}

function ensureMetadataName(pkgName, pkgData) {
  if (!pkgData.metadata.name) {
    pkgData.metadata.name = pkgName;
  }
  pkgData.pkgName = pkgName;
}

function generateProfiles(igs) {
  const leftPackages = [];
  const rightPackages = [];

  igs.forEach((ig) => {
    if (!ig.group || !ig.name) {
      return;
    }

    let modulePath;
    try {
      modulePath = locateModule(ig.name);
    } catch (error) {
      const displayName = ig.rawName || ig.name;
      throw new Error(`Package '${displayName}' not found in node_modules. Run 'npm run install-igs -- --sync-cache' first.`);
    }
    const pkgData = readStructureDefinitions(modulePath);
    ensureMetadataName(ig.name, pkgData);

    if (ig.group.toLowerCase() === 'left') {
      leftPackages.push(pkgData);
    } else if (ig.group.toLowerCase() === 'right') {
      rightPackages.push(pkgData);
    }
  });

  if (!leftPackages.length) {
    throw new Error('No IGs are configured with group: left. Unable to generate comparisons.');
  }

  if (!rightPackages.length) {
    throw new Error('No IGs are configured with group: right. Nothing to compare.');
  }

  const leftTypeIndex = buildTypeIndex(leftPackages);
  const comparisons = [];
  const seen = new Set();

  rightPackages.forEach((rightPkg) => {
    rightPkg.profiles.forEach((rightProfile) => {
      if (EXCLUDED_RESOURCE_TYPES.has(rightProfile.type)) {
        return;
      }

      const candidates = leftTypeIndex.get(rightProfile.type);
      if (!candidates || !candidates.length) {
        return;
      }

      candidates.forEach(({ profile: leftProfile, pkg: leftPkg }) => {
        const key = [
          rightPkg.metadata.name,
          rightPkg.metadata.version,
          rightProfile.url,
          leftPkg.metadata.name,
          leftPkg.metadata.version,
          leftProfile.url,
        ].join('|');

        if (seen.has(key)) {
          return;
        }
        seen.add(key);

        const dest = createDestPath(rightPkg, rightProfile, leftPkg, leftProfile);

        comparisons.push({
          dest,
          leftIg: `${leftPkg.metadata.name}@${leftPkg.metadata.version}`,
          rightIg: `${rightPkg.metadata.name}@${rightPkg.metadata.version}`,
          leftProfile: leftProfile.url,
          rightProfile: rightProfile.url,
        });
      });
    });
  });

  comparisons.sort((a, b) => a.dest.localeCompare(b.dest));
  return comparisons;
}

function buildConfigContent(igs, profiles) {
  const lines = [];
  lines.push('igs:');
  igs.forEach((ig) => {
    const nameField = ig.rawName || ig.name;
    lines.push(`  - name: ${nameField}`);
    if (ig.group) {
      lines.push(`    group: ${ig.group}`);
    }
    if (ig.override) {
      lines.push(`    overrideNpm: ${ig.override}`);
    }
  });

  lines.push('');
  lines.push('profiles:');

  if (!profiles.length) {
    lines.push('  # No profile comparisons generated.');
  } else {
    lines.push('  # Auto-generated by scripts/generate-profile-config.js');
    profiles.forEach((profile) => {
      lines.push(`  - dest: ${profile.dest}`);
      lines.push(`    leftIg: ${profile.leftIg}`);
      lines.push(`    rightIg: ${profile.rightIg}`);
      lines.push(`    leftProfile: ${profile.leftProfile}`);
      lines.push(`    rightProfile: ${profile.rightProfile}`);
    });
  }

  lines.push('');
  return `${lines.join('\n')}`;
}

function main() {
  const yamlContent = readConfigFile(CONFIG_PATH);
  const igs = parseIgs(yamlContent);

  if (!igs.length) {
    throw new Error('No IG definitions found in ComparisonConfig.yml.');
  }

  const generatedProfiles = generateProfiles(igs);
  const newContent = buildConfigContent(igs, generatedProfiles);

  fs.writeFileSync(CONFIG_PATH, newContent, 'utf8');

  console.log(`✅ Generated ${generatedProfiles.length} profile comparisons.`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}
