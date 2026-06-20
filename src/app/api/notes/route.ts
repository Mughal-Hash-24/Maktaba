import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { join } from 'path';
import { existsSync } from 'fs';

const CONTENT_DIR = join(process.cwd(), 'content');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const getTagIndex = searchParams.get('tagIndex') === 'true';
    const getSlugMap = searchParams.get('slugMap') === 'true';

    // 1. Fetch individual note by slug
    if (slug) {
      // Validate slug format to prevent directory traversal
      if (!/^[a-zA-Z0-9-_]+$/.test(slug)) {
        return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });
      }

      const notePath = join(CONTENT_DIR, 'notes', `${slug}.json`);
      if (!existsSync(notePath)) {
        return NextResponse.json({ error: 'Note not found' }, { status: 404 });
      }

      const fileData = await fs.readFile(notePath, 'utf-8');
      const note = JSON.parse(fileData);
      return NextResponse.json(note);
    }

    // 2. Fetch full tag index
    if (getTagIndex) {
      const tagIndexPath = join(CONTENT_DIR, 'tag-index.json');
      if (!existsSync(tagIndexPath)) {
        return NextResponse.json({ error: 'Tag index not found' }, { status: 404 });
      }

      const fileData = await fs.readFile(tagIndexPath, 'utf-8');
      const tagIndex = JSON.parse(fileData);
      return NextResponse.json(tagIndex);
    }

    // 3. Fetch bidirectional slug map
    if (getSlugMap) {
      const slugMapPath = join(CONTENT_DIR, 'slug-map.json');
      if (!existsSync(slugMapPath)) {
        return NextResponse.json({ error: 'Slug map not found' }, { status: 404 });
      }

      const fileData = await fs.readFile(slugMapPath, 'utf-8');
      const slugMap = JSON.parse(fileData);
      return NextResponse.json(slugMap);
    }

    return NextResponse.json(
      { error: 'Invalid query parameters. Provide slug, tagIndex, or slugMap.' },
      { status: 400 }
    );
  } catch (err: unknown) {
    console.error('[notes-api] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Failed to retrieve requested content';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
