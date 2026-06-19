import { mkdir, copyFile, unlink, readdir, stat, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

import { scanVault } from './parsers/vault-scanner.js';

// Default paths
const DEFAULT_VAULT_PATH = join(homedir(), 'Kybernetes');
const DEFAULT_EXPORT_PATH = join(homedir(), 'Kybernetes-content');

// Read paths from command arguments or fallback to defaults
const args = process.argv.slice(2);
const VAULT_PATH = process.env.VAULT_PATH
  ? process.env.VAULT_PATH.replace('~', homedir())
  : (args[0] || DEFAULT_VAULT_PATH).replace('~', homedir());

const EXPORT_PATH = process.env.EXPORT_PATH
  ? process.env.EXPORT_PATH.replace('~', homedir())
  : (args[1] || DEFAULT_EXPORT_PATH).replace('~', homedir());

function log(msg: string): void {
  console.log(`[export] ${msg}`);
}

async function cleanEmptyDirs(dir: string): Promise<boolean> {
  const entries = await readdir(dir);
  let isEmpty = true;

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      const childEmpty = await cleanEmptyDirs(fullPath);
      if (childEmpty) {
        await rm(fullPath, { recursive: true, force: true });
      } else {
        isEmpty = false;
      }
    } else {
      isEmpty = false;
    }
  }
  return isEmpty;
}

async function getFilesRecursively(dir: string, base: string, list: string[] = []): Promise<string[]> {
  if (!existsSync(dir)) return list;
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      await getFilesRecursively(fullPath, base, list);
    } else if (s.isFile()) {
      list.push(relative(base, fullPath));
    }
  }
  return list;
}

async function main(): Promise<void> {
  log(`Starting export process...`);
  log(`Source Vault: ${VAULT_PATH}`);
  log(`Destination:  ${EXPORT_PATH}`);

  if (!existsSync(VAULT_PATH)) {
    console.error(`[export] ERROR: Source vault path does not exist: ${VAULT_PATH}`);
    process.exit(1);
  }

  // 1. Scan the vault for public-eligible files
  const eligibleFiles = await scanVault(VAULT_PATH);
  const eligibleRelPaths = new Set(eligibleFiles.map(f => f.relativePath));
  log(`Found ${eligibleFiles.length} public-eligible files in source vault.`);

  // 2. Scan destination directory for existing files to delete if they are no longer eligible
  if (existsSync(EXPORT_PATH)) {
    const existingRelFiles = await getFilesRecursively(EXPORT_PATH, EXPORT_PATH);
    let deletedCount = 0;
    for (const relFile of existingRelFiles) {
      // If it is a markdown file but not in eligible list, delete it
      if (relFile.endsWith('.md') && !eligibleRelPaths.has(relFile)) {
        const destPath = join(EXPORT_PATH, relFile);
        await unlink(destPath);
        deletedCount++;
      }
    }
    if (deletedCount > 0) {
      log(`Deleted ${deletedCount} obsolete/private notes from destination.`);
    }
  } else {
    await mkdir(EXPORT_PATH, { recursive: true });
    log(`Created destination folder: ${EXPORT_PATH}`);
  }

  // 3. Copy/Update eligible files
  let copiedCount = 0;
  for (const file of eligibleFiles) {
    const destPath = join(EXPORT_PATH, file.relativePath);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(file.absolutePath, destPath);
    copiedCount++;
  }
  log(`Successfully copied ${copiedCount} notes to destination.`);

  // 4. Clean up empty directories in the destination
  log(`Cleaning empty folders in destination...`);
  await cleanEmptyDirs(EXPORT_PATH);

  log(`✓ Export complete!`);
}

main().catch(err => {
  console.error('[export] FATAL ERROR:', err);
  process.exit(1);
});
