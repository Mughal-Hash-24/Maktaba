/* src/lib/notes.ts */
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

export interface NoteMetadata {
  slug: string;
  title: string;
  tags: string[];
  wordCount: number;
  relativePath: string;
  filename: string;
  linkCount: number; // resolved incoming + outgoing links
}

export interface NoteFull {
  slug: string;
  title: string;
  tags: string[];
  htmlContent: string;
  rawMarkdown: string;
  wordCount: number;
  backlinks: { slug: string; title: string }[];
  relativePath: string;
  filename: string;
}

export interface GraphData {
  nodes: { id: string; title: string; field: string; linkCount: number }[];
  edges: { source: string; target: string }[];
}

const CONTENT_DIR = join(process.cwd(), 'content');

export async function readJsonFile<T>(filename: string): Promise<T | null> {
  const path = join(CONTENT_DIR, filename);
  if (!existsSync(path)) return null;
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Error reading JSON file ${filename}:`, error);
    return null;
  }
}

export async function getNoteBySlug(slug: string): Promise<NoteFull | null> {
  const path = join(CONTENT_DIR, 'notes', `${slug}.json`);
  if (!existsSync(path)) return null;
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data) as NoteFull;
  } catch (error) {
    console.error(`Error reading note slug ${slug}:`, error);
    return null;
  }
}

export async function getAllNotesMetadata(): Promise<NoteMetadata[]> {
  const slugMap = await readJsonFile<{ bySlug: Record<string, unknown> }>('slug-map.json');
  if (!slugMap) return [];

  const notesDir = join(CONTENT_DIR, 'notes');
  const slugs = Object.keys(slugMap.bySlug);
  const notesMetadata: NoteMetadata[] = [];

  for (const slug of slugs) {
    const notePath = join(notesDir, `${slug}.json`);
    if (existsSync(notePath)) {
      try {
        const data = await fs.readFile(notePath, 'utf-8');
        const note = JSON.parse(data);
        notesMetadata.push({
          slug: note.slug,
          title: note.title,
          tags: note.tags || [],
          wordCount: note.wordCount || 0,
          relativePath: note.relativePath || '',
          filename: note.filename || '',
          linkCount: (note.backlinks?.length || 0) + (note.outgoingLinks?.length || 0), // approximated link count
        });
      } catch (err) {
        console.error(`Error parsing metadata for slug ${slug}:`, err);
      }
    }
  }

  return notesMetadata;
}
