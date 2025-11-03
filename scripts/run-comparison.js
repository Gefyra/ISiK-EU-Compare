#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(WORKSPACE_ROOT, 'tmp');
const VALIDATOR_PATH = path.join(TMP_DIR, 'validator_cli.jar');

function toCamelCase(key) {
  return key.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[i + 1];
    if (typeof value === 'undefined' || value.startsWith('--')) {
      throw new Error(`Missing value for argument --${key}`);
    }
    args[toCamelCase(key)] = value;
    i += 1;
  }

  return args;
}

function ensureValidatorExists() {
  if (!fs.existsSync(VALIDATOR_PATH)) {
    throw new Error(`validator_cli.jar not found at ${VALIDATOR_PATH}`);
  }
}

function toCacheFormat(identifier) {
  return identifier.replace(/@/g, '#');
}

function runComparison({ dest, leftIg, rightIg, leftProfile, rightProfile }) {
  if (!dest || !leftIg || !rightIg || !leftProfile || !rightProfile) {
    throw new Error('Missing required comparison parameters.');
  }

  ensureValidatorExists();

  const destPath = path.resolve(WORKSPACE_ROOT, dest);
  fs.mkdirSync(destPath, { recursive: true });
  const statusPath = path.join(destPath, 'comparison-status.json');

  const args = [
    '-jar',
    VALIDATOR_PATH,
    '-compare',
    '-dest',
    destPath,
    '-version',
    '4.0',
    '-ig',
    toCacheFormat(leftIg),
    '-ig',
    toCacheFormat(rightIg),
    '-left',
    leftProfile,
    '-right',
    rightProfile,
  ];

  console.log(`🔬 Comparing ${path.basename(destPath)}\n  • Left IG: ${leftIg}\n  • Right IG: ${rightIg}`);

  const result = spawnSync('java', args, {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      JAVA_TOOL_OPTIONS: '-Djava.awt.headless=true',
    },
    encoding: 'utf8',
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const logPath = path.join(destPath, 'compare.log');
  const status = result.status === 0 ? 'success' : 'failure';

  const extendedLog = [
    `Status: ${status}`,
    `Left IG: ${leftIg}`,
    `Right IG: ${rightIg}`,
    '----- validator output -----',
    output,
  ].join('\n');

  fs.writeFileSync(logPath, `${extendedLog}\n`, 'utf8');
  fs.writeFileSync(
    statusPath,
    `${JSON.stringify(
      {
        status,
        leftIg,
        rightIg,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  process.stdout.write(output);

  if (result.error) {
    console.error(`❌ Comparison for ${dest} failed: ${result.error.message}`);
    return;
  }

  if (result.status === 0) {
    console.log(`✅ ${path.basename(destPath)} comparison succeeded`);
  } else {
    console.error(`❌ ${path.basename(destPath)} comparison failed (exit code ${result.status})`);
    process.exitCode = 1;
  }
}

function main() {
  try {
    const args = parseArgs(process.argv);
    runComparison(args);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

main();
