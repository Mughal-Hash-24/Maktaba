import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, basename, extname } from 'node:path';
import matter from 'gray-matter';
import type { VaultFile } from '../types.js';

// Directories to NEVER recurse into (at any depth)
const EXCLUDED_DIRS = new Set([
  '00_Inbox',
  '60_Planner',
  '90_System',
  '.git',
  '.obsidian',
  '.agents',
  'youtube-to-docs-artifacts',
  'University_Admin',
]);

// Root-level files to exclude by exact filename
const EXCLUDED_ROOT_FILES = new Set([
  'GEMINI.md',
  'AGENTS.md',
  'T.O.C (Root).md',
  'crash_log.txt',
  'crash_traceback.txt',
]);

export async function scanVault(vaultPath: string): Promise<VaultFile[]> {
  const results: VaultFile[] = [];
  await walkDir(vaultPath, vaultPath, results, true);
  return results;
}

async function walkDir(
  dir: string,
  vaultRoot: string,
  results: VaultFile[],
  isRoot: boolean
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stats;
    try {
      stats = await stat(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry)) continue;
      await walkDir(fullPath, vaultRoot, results, false);
    } else if (stats.isFile()) {
      // Only process .md files
      if (extname(entry) !== '.md') continue;
      // Skip root-level meta files
      if (isRoot && EXCLUDED_ROOT_FILES.has(entry)) continue;
      // Skip T.O.C files at any level
      if (basename(entry).startsWith('T.O.C')) continue;

      // Check frontmatter for private/draft flags
      try {
        const raw = await readFile(fullPath, 'utf-8');
        if (raw.startsWith('---')) {
          const { data } = matter(raw);
          if (data.private === true || data.draft === true) continue;
        }
      } catch {
        continue;
      }

      const relativePath = relative(vaultRoot, fullPath);
      const filename = basename(entry, '.md');
      results.push({ absolutePath: fullPath, relativePath, filename });
    }
  }
}
