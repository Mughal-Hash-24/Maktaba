import type { ExtractedNote } from '../parsers/frontmatter-extractor.js';
import type { SlugMap } from '../types.js';

/**
 * Convert a title string into a URL-safe slug.
 * "Virtual Memory"          → "virtual-memory"
 * "B-Trees & Complexity"    → "b-trees-complexity"
 * "Left Outer Joins"        → "left-outer-joins"
 */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[_\s]+/g, '-')          // spaces/underscores → hyphens
    .replace(/[^a-z0-9-]/g, '')       // strip non-alphanumeric except hyphens
    .replace(/-+/g, '-')              // collapse consecutive hyphens
    .replace(/^-|-$/g, '');           // strip leading/trailing hyphens
}

/**
 * Extract a short folder identifier for collision resolution.
 * Picks the most specific non-numeric, non-semester folder name.
 */
function folderPrefix(relativePath: string): string {
  const parts = relativePath.split('/');
  // Walk backwards from the file's parent folder
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i];
    if (
      !part.match(/^[0-9]/) &&         // skip purely numeric or prefixed-numeric folders
      !part.match(/^Semester/i) &&
      part.length > 2
    ) {
      return titleToSlug(part).slice(0, 20);
    }
  }
  return titleToSlug(parts[0] || 'note').slice(0, 10);
}

export function buildSlugMap(notes: ExtractedNote[]): SlugMap {
  const slugMap: SlugMap = { byFilename: {}, bySlug: {} };

  // First pass: compute base slugs and count occurrences to detect collisions
  const baseSlugCounts: Record<string, number> = {};
  const notesWithBase = notes.map((note) => {
    const base = titleToSlug(note.title);
    baseSlugCounts[base] = (baseSlugCounts[base] || 0) + 1;
    return { note, base };
  });

  // Second pass: assign final unique slugs
  const usedSlugs = new Map<string, number>(); // tracks how many times a slug has been used

  for (const { note, base } of notesWithBase) {
    let candidate: string;

    if (baseSlugCounts[base] > 1) {
      // Collision: prefix with the most specific folder name
      const prefix = folderPrefix(note.file.relativePath);
      candidate = `${prefix}-${base}`;
    } else {
      candidate = base;
    }

    // If still colliding (e.g., same folder prefix too), add a numeric suffix
    const usedCount = usedSlugs.get(candidate) ?? 0;
    const finalSlug = usedCount > 0 ? `${candidate}-${usedCount}` : candidate;
    usedSlugs.set(candidate, usedCount + 1);

    slugMap.byFilename[note.file.filename] = finalSlug;
    slugMap.bySlug[finalSlug] = {
      filename: note.file.filename,
      relativePath: note.file.relativePath,
      title: note.title,
    };
  }

  return slugMap;
}
