import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type { VaultFile, TagIndex } from '../types.js';

// Map known path segments to inferred field tags for files without frontmatter
const DIR_TO_FIELD: Record<string, string> = {
  '10_University': 'field/cs',
  'Semester_01': 'field/cs',
  'Semester_03': 'field/cs',
  'Semester_04': 'field/cs',
  '20_CS_Core': 'field/cs',
  '40_Projects': 'field/cs',
  '50_Resources': '',
  Fiqh: 'field/humanities',
  '10_Concepts': 'field/humanities',
  '20_Entities': 'field/humanities',
  '30_Frameworks': 'field/cs',
};

/**
 * Derive a clean title from a filename.
 * "1.1.1 - Defining Intelligence" → "Defining Intelligence"
 * "Virtual_Memory"                → "Virtual Memory"
 * "1.1 Registers"                 → "Registers"
 */
export function deriveTitle(filename: string): string {
  // University pattern: X.Y.Z - Title
  const uniMatch = filename.match(/^[\d.]+ - (.+)$/);
  if (uniMatch) return uniMatch[1].trim();
  // Numeric prefix without dash: "1.1 Registers"
  const numPrefixMatch = filename.match(/^[\d.]+ (.+)$/);
  if (numPrefixMatch) return numPrefixMatch[1].trim();
  // Default: replace separators with spaces
  return filename.replace(/[_-]/g, ' ').trim();
}

/**
 * Infer the field tag for a file that has no frontmatter, based on its relative path.
 */
function inferFieldFromPath(relativePath: string): string {
  const parts = relativePath.split('/');
  for (const part of parts) {
    if (DIR_TO_FIELD[part] !== undefined) {
      return DIR_TO_FIELD[part];
    }
  }
  return '';
}

export interface ExtractedNote {
  file: VaultFile;
  title: string;
  tags: string[];
  wordCount: number;
  rawContent: string;   // Full raw file content including frontmatter (for MD5 hashing)
  bodyContent: string;  // Markdown body ONLY — frontmatter stripped (for processing)
}

export async function extractFrontmatter(files: VaultFile[]): Promise<ExtractedNote[]> {
  const results: ExtractedNote[] = [];

  for (const file of files) {
    const raw = await readFile(file.absolutePath, 'utf-8');
    const { data, content } = matter(raw);

    // Resolve title
    let title: string;
    if (typeof data.title === 'string' && data.title.trim()) {
      title = data.title.trim();
    } else {
      title = deriveTitle(file.filename);
    }

    // Resolve tags — normalize to an array of strings
    let tags: string[] = [];
    if (Array.isArray(data.tags)) {
      tags = data.tags
        .map((t: unknown) => String(t).trim())
        .filter((t: string) => t.length > 0);
    } else if (typeof data.tags === 'string' && data.tags.trim()) {
      tags = [data.tags.trim()];
    }

    // Infer field tag for notes that don't have one
    if (!tags.some((t) => t.startsWith('field/'))) {
      const inferred = inferFieldFromPath(file.relativePath);
      if (inferred) tags = [inferred, ...tags];
    }

    // Word count (from body content, not frontmatter)
    const words = content.match(/\b\w+\b/g);
    const wordCount = words ? words.length : 0;

    results.push({ file, title, tags, wordCount, rawContent: raw, bodyContent: content });
  }

  return results;
}


export function buildTagIndex(notes: Array<{ slug: string; tags: string[] }>): TagIndex {
  const index: TagIndex = {};
  for (const note of notes) {
    for (const tag of note.tags) {
      if (!index[tag]) index[tag] = [];
      index[tag].push(note.slug);
    }
  }
  return index;
}
