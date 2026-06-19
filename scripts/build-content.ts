/**
 * scripts/build-content.ts
 *
 * Main entrypoint for the Maktaba content pipeline.
 * Run with: npm run build:content
 *
 * Pipeline phases:
 *  1.2  Vault Scanner          - scan Kybernetes, apply exclusion rules
 *  1.3  Frontmatter Extractor  - parse YAML frontmatter, derive titles and tags
 *  1.4  Slug Generator         - produce unique URL slugs, build slug-map.json
 *  1.5  Wikilink Resolver      - replace [[wikilinks]], compute backlinks
 *  1.6  Markdown Processor     - convert Markdown → HTML (LaTeX, code highlighting)
 *  1.7  Graph Builder          - produce graph.json (nodes + edges)
 *  1.8  Build Cache            - MD5-based incremental cache for fast re-runs
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

import { scanVault } from './parsers/vault-scanner.js';
import { extractFrontmatter, buildTagIndex } from './parsers/frontmatter-extractor.js';
import { buildSlugMap } from './utils/slug-generator.js';
import { resolveWikilinks, computeBacklinks } from './parsers/wikilink-resolver.js';
import { markdownToHtml } from './parsers/markdown-processor.js';
import { buildGraphData } from './build-graph.js';
import {
  loadBuildCache,
  hashAllFiles,
  diffCache,
  saveBuildCache,
  removeStaleNoteFile,
} from './utils/build-cache.js';
import type { NoteFull, SlugMap } from './types.js';

// ─── Configuration ──────────────────────────────────────────────────────────

const VAULT_PATH = process.env.VAULT_PATH
  ? process.env.VAULT_PATH.replace('~', homedir())
  : join(homedir(), 'Kybernetes');

const CONTENT_DIR = join(process.cwd(), 'content');
const NOTES_DIR = join(CONTENT_DIR, 'notes');

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureDirs(): Promise<void> {
  await mkdir(NOTES_DIR, { recursive: true });
}

function log(msg: string): void {
  console.log(`[build] ${msg}`);
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();
  log(`Starting content pipeline — vault: ${VAULT_PATH}`);

  await ensureDirs();

  // ── Phase 1.2: Scan vault ──────────────────────────────────────────────────
  log('Phase 1.2 — Scanning vault...');
  const allFiles = await scanVault(VAULT_PATH);
  log(`  Found ${allFiles.length} public-eligible files.`);

  // ── Phase 1.8: Load cache & compute diffs ─────────────────────────────────
  log('Phase 1.8 — Loading build cache...');
  const prevCache = await loadBuildCache();
  const currentHashes = await hashAllFiles(allFiles);
  const diff = await diffCache(allFiles, prevCache, currentHashes);

  log(`  New: ${diff.newFiles.length} | Changed: ${diff.changedFiles.length} | Deleted: ${diff.deletedPaths.length} | Unchanged: ${diff.unchangedFiles.length}`);

  // Remove stale note JSON files for deleted vault files
  for (const deletedPath of diff.deletedPaths) {
    const cachedSlug = prevCache[deletedPath]?.slug;
    if (cachedSlug) await removeStaleNoteFile(cachedSlug);
  }

  // Files that need full reprocessing
  const filesToProcess = [...diff.newFiles, ...diff.changedFiles];
  const unchangedFiles = diff.unchangedFiles;

  // ── Phase 1.3: Extract frontmatter from ALL files ─────────────────────────
  // We need all titles to build a consistent slug map, even for unchanged files
  log('Phase 1.3 — Extracting frontmatter from all files...');
  const allExtracted = await extractFrontmatter(allFiles);
  log(`  Extracted metadata for ${allExtracted.length} files.`);

  // ── Phase 1.4: Build slug map ─────────────────────────────────────────────
  log('Phase 1.4 — Generating slug map...');
  const slugMap = buildSlugMap(allExtracted);
  await writeFile(
    join(CONTENT_DIR, 'slug-map.json'),
    JSON.stringify(slugMap, null, 2),
    'utf-8'
  );
  log(`  slug-map.json written (${Object.keys(slugMap.bySlug).length} entries).`);

  // Build a map from relativePath → slug for cache saving
  const slugByRelPath = new Map<string, string>();
  for (const ext of allExtracted) {
    const slug = slugMap.byFilename[ext.file.filename];
    if (slug) slugByRelPath.set(ext.file.relativePath, slug);
  }

  // ── Phase 1.5: Resolve wikilinks for files to process ─────────────────────
  // We also need wikilinks from ALL files to compute the full backlink graph
  log('Phase 1.5 — Resolving wikilinks across all files...');

  // Map from slug → array of target slugs this note links to
  const linkGraph = new Map<string, string[]>();
  // Map from slug → title (for backlink display)
  const slugToTitle = new Map<string, string>(
    allExtracted.map((e) => [slugMap.byFilename[e.file.filename] ?? '', e.title])
  );

  // Process wikilinks for ALL files so the link graph is always complete
  const resolvedMarkdownMap = new Map<string, string>(); // slug → processed markdown

  for (const extracted of allExtracted) {
    const slug = slugMap.byFilename[extracted.file.filename];
    if (!slug) continue;
    const { processedMarkdown, resolvedLinks } = resolveWikilinks(
      extracted.bodyContent,   // ← body only, frontmatter already stripped by gray-matter
      slugMap
    );
    linkGraph.set(slug, resolvedLinks);
    resolvedMarkdownMap.set(slug, processedMarkdown);
  }
  log(`  Link graph built: ${linkGraph.size} notes.`);

  // Compute backlinks from the full link graph
  const backlinkMap = computeBacklinks(linkGraph, slugToTitle);

  // ── Phase 1.6: Markdown → HTML for files that need reprocessing ───────────
  log(`Phase 1.6 — Converting Markdown to HTML for ${filesToProcess.length} changed files...`);

  // Find extracted data for files to process
  const toProcessExtracted = allExtracted.filter((e) =>
    filesToProcess.some((f) => f.relativePath === e.file.relativePath)
  );

  const processedNotes: NoteFull[] = [];

  for (const extracted of toProcessExtracted) {
    const slug = slugMap.byFilename[extracted.file.filename];
    if (!slug) continue;

    const processedMd = resolvedMarkdownMap.get(slug) ?? extracted.bodyContent;
    const htmlContent = await markdownToHtml(processedMd);
    const backlinks = backlinkMap.get(slug) ?? [];

    const noteFull: NoteFull = {
      slug,
      title: extracted.title,
      tags: extracted.tags,
      htmlContent,
      rawMarkdown: processedMd,
      wordCount: extracted.wordCount,
      backlinks,
      relativePath: extracted.file.relativePath,
      filename: extracted.file.filename,
    };

    // Write note JSON
    await writeFile(
      join(NOTES_DIR, `${slug}.json`),
      JSON.stringify(noteFull, null, 2),
      'utf-8'
    );
    processedNotes.push(noteFull);
  }

  // ── Update backlinks for ALL unchanged notes too ──────────────────────────
  // Because backlinks change whenever ANY note changes its outgoing links.
  log('  Updating backlinks in unchanged note files...');
  const unchangedExtracted = allExtracted.filter((e) =>
    unchangedFiles.some((f) => f.relativePath === e.file.relativePath)
  );

  for (const extracted of unchangedExtracted) {
    const slug = slugMap.byFilename[extracted.file.filename];
    if (!slug) continue;

    const notePath = join(NOTES_DIR, `${slug}.json`);
    if (!existsSync(notePath)) continue; // shouldn't happen but guard anyway

    try {
      const existing = JSON.parse(await readFile(notePath, 'utf-8')) as NoteFull;
      const freshBacklinks = backlinkMap.get(slug) ?? [];

      // Only rewrite if backlinks actually changed
      const oldBl = JSON.stringify(existing.backlinks.sort((a, b) => a.slug.localeCompare(b.slug)));
      const newBl = JSON.stringify(freshBacklinks.sort((a, b) => a.slug.localeCompare(b.slug)));

      if (oldBl !== newBl) {
        existing.backlinks = freshBacklinks;
        await writeFile(notePath, JSON.stringify(existing, null, 2), 'utf-8');
      }
    } catch {
      // If we can't read the existing file, skip silently (will be regenerated next full build)
    }
  }

  log(`  Wrote/updated ${toProcessExtracted.length} note JSON files.`);

  // ── Phase 1.7: Build graph.json ───────────────────────────────────────────
  log('Phase 1.7 — Building graph data...');

  // Load all note metadata (both newly processed and unchanged) to build full graph
  const allNotes: NoteFull[] = [];
  for (const extracted of allExtracted) {
    const slug = slugMap.byFilename[extracted.file.filename];
    if (!slug) continue;
    const notePath = join(NOTES_DIR, `${slug}.json`);
    if (!existsSync(notePath)) continue;
    try {
      const note = JSON.parse(await readFile(notePath, 'utf-8')) as NoteFull;
      allNotes.push(note);
    } catch {
      // skip corrupted files
    }
  }

  const graphData = buildGraphData(allNotes);
  await writeFile(
    join(CONTENT_DIR, 'graph.json'),
    JSON.stringify(graphData, null, 2),
    'utf-8'
  );
  log(`  graph.json written (${graphData.nodes.length} nodes, ${graphData.edges.length} edges).`);

  // ── Build tag-index.json ──────────────────────────────────────────────────
  log('Building tag-index.json...');
  const tagIndexInput = allNotes.map((n) => ({ slug: n.slug, tags: n.tags }));
  const tagIndex = buildTagIndex(tagIndexInput);
  await writeFile(
    join(CONTENT_DIR, 'tag-index.json'),
    JSON.stringify(tagIndex, null, 2),
    'utf-8'
  );
  log(`  tag-index.json written (${Object.keys(tagIndex).length} tags).`);

  // ── Phase 1.8: Save updated build cache ───────────────────────────────────
  log('Phase 1.8 — Saving build cache...');
  await saveBuildCache(allFiles, currentHashes, slugByRelPath);
  log('  build-cache.json saved.');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  log(`✓ Content pipeline complete in ${elapsed}s.`);
  log(`  Notes: ${allNotes.length} | Nodes: ${graphData.nodes.length} | Edges: ${graphData.edges.length}`);
}

main().catch((err) => {
  console.error('[build] FATAL ERROR:', err);
  process.exit(1);
});
