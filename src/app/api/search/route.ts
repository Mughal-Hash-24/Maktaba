/* src/app/api/search/route.ts */
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

export const dynamic = 'force-dynamic';

interface NoteMetadata {
  slug: string;
  title: string;
  tags: string[];
  wordCount: number;
  snippet: string;
}

let cachedSearchIndex: NoteMetadata[] | null = null;

async function getSearchIndex(): Promise<NoteMetadata[]> {
  if (cachedSearchIndex) {
    return cachedSearchIndex;
  }

  const contentDir = join(process.cwd(), 'content');
  const notesDir = join(contentDir, 'notes');
  const slugMapPath = join(contentDir, 'slug-map.json');

  if (!existsSync(slugMapPath)) {
    return [];
  }

  try {
    const slugMapData = await fs.readFile(slugMapPath, 'utf-8');
    const slugMap = JSON.parse(slugMapData);
    const slugs = Object.keys(slugMap.bySlug);
    
    const index: NoteMetadata[] = [];

    for (const slug of slugs) {
      const notePath = join(notesDir, `${slug}.json`);
      if (existsSync(notePath)) {
        const noteData = await fs.readFile(notePath, 'utf-8');
        const note = JSON.parse(noteData);
        
        // Strip HTML tags for search snippet
        const textContent = note.htmlContent.replace(/<[^>]*>/g, ' ');
        const snippet = textContent.slice(0, 150) + '...';

        index.push({
          slug: note.slug,
          title: note.title,
          tags: note.tags,
          wordCount: note.wordCount,
          snippet,
        });
      }
    }

    cachedSearchIndex = index;
    return index;
  } catch (error) {
    console.error('Error building fallback search index:', error);
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.toLowerCase() || '';

  if (!query) {
    return NextResponse.json([]);
  }

  const index = await getSearchIndex();
  
  // Filter by title or tags or snippet content
  const results = index
    .filter(
      (note) =>
        note.title.toLowerCase().includes(query) ||
        note.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        note.snippet.toLowerCase().includes(query)
    )
    .slice(0, 10); // Limit to top 10 results

  return NextResponse.json(results);
}
