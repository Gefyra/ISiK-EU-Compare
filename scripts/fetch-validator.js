#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(WORKSPACE_ROOT, 'tmp');
const VALIDATOR_PATH = path.join(TMP_DIR, 'validator_cli.jar');
const DEFAULT_URL = 'https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar';

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);

    https
      .get(url, (response) => {
        const { statusCode, headers } = response;

        if (statusCode && statusCode >= 300 && statusCode < 400 && headers.location) {
          file.close();
          fs.unlink(destination, () => {
            resolve(download(headers.location, destination));
          });
          return;
        }

        if (statusCode !== 200) {
          file.close();
          fs.unlink(destination, () => {
            reject(new Error(`Failed to download validator_cli.jar. HTTP status ${statusCode}`));
          });
          return;
        }

        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (error) => {
        file.close();
        fs.unlink(destination, () => {
          reject(error);
        });
      });
  });
}

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  if (fs.existsSync(VALIDATOR_PATH)) {
    console.log('✅ validator_cli.jar already present. Skipping download.');
    return;
  }

  const url = process.env.VALIDATOR_CLI_URL || DEFAULT_URL;
  console.log(`⬇️  Downloading validator_cli.jar from ${url}`);

  try {
    await download(url, VALIDATOR_PATH);
    console.log(`✅ Downloaded validator_cli.jar to ${path.relative(WORKSPACE_ROOT, VALIDATOR_PATH)}`);
  } catch (error) {
    console.error(`❌ Failed to download validator_cli.jar: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
