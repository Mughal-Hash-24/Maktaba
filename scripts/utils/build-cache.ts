import { readFile, writeFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { VaultFile, BuildCache } from '../types.js';

const CACHE_PATH = join(process.cwd(), 'content', 'build-cache.json');

/**
 * Load the existing build cache from disk.
 * Returns an empty object if no cache file exists yet.
 */
export async function loadBuildCache(): Promise<BuildCache> {
  if (!existsSync(CACHE_PATH)) return {};
  try {
    const raw = await readFile(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as BuildCache;
  } catch {
    return {};
  }
}

/**
 * Compute the MD5 hash of a file's raw content.
 */
export async function hashFile(absolutePath: string): Promise<string> {
  const content = await readFile(absolutePath);
  return createHash('md5').update(content).digest('hex');
}

/**
 * Compute hashes for all current vault files.
 */
export async function hashAllFiles(
  files: VaultFile[]
): Promise<Map<string, { hash: string; slug: string }>> {
  const result = new Map<string, { hash: string; slug: string }>();
  await Promise.all(
    files.map(async (f) => {
      const hash = await hashFile(f.absolutePath);
      // slug will be filled in later; store placeholder
      result.set(f.relativePath, { hash, slug: '' });
    })
  );
  return result;
}

export interface CacheDiff {
  newFiles: VaultFile[];      // files not in cache (new)
  changedFiles: VaultFile[];  // files in cache but MD5 changed
  deletedPaths: string[];     // paths in cache but missing on disk
  unchangedFiles: VaultFile[]; // files with same MD5 as cache
}

/**
 * Compare current vault files against the cache to determine what needs reprocessing.
 */
export async function diffCache(
  files: VaultFile[],
  prevCache: BuildCache,
  currentHashes: Map<string, { hash: string; slug: string }>
): Promise<CacheDiff> {
  const currentPaths = new Set(files.map((f) => f.relativePath));
  const deletedPaths = Object.keys(prevCache).filter((p) => !currentPaths.has(p));

  const newFiles: VaultFile[] = [];
  const changedFiles: VaultFile[] = [];
  const unchangedFiles: VaultFile[] = [];

  for (const file of files) {
    const current = currentHashes.get(file.relativePath);
    if (!current) continue;

    const cached = prevCache[file.relativePath];
    if (!cached) {
      newFiles.push(file);
    } else if (cached.md5 !== current.hash) {
      changedFiles.push(file);
    } else {
      unchangedFiles.push(file);
    }
  }

  return { newFiles, changedFiles, deletedPaths, unchangedFiles };
}

/**
 * Persist the updated build cache to disk.
 */
export async function saveBuildCache(
  files: VaultFile[],
  hashes: Map<string, { hash: string; slug: string }>,
  slugByRelPath: Map<string, string>
): Promise<void> {
  const cache: BuildCache = {};
  for (const file of files) {
    const hashEntry = hashes.get(file.relativePath);
    if (!hashEntry) continue;
    cache[file.relativePath] = {
      md5: hashEntry.hash,
      slug: slugByRelPath.get(file.relativePath) ?? '',
    };
  }
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

/**
 * Remove a stale note JSON file (for deleted vault files).
 */
export async function removeStaleNoteFile(slug: string): Promise<void> {
  const notePath = join(process.cwd(), 'content', 'notes', `${slug}.json`);
  if (existsSync(notePath)) {
    await unlink(notePath);
    console.log(`  [cache] Removed stale note: ${slug}`);
  }
}
