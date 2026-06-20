// src/lib/agent-tools.ts
import type { FunctionDeclaration } from '@google/generative-ai';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
}

/**
 * Decodes a uint16 representing an IEEE 754 half-precision float into a standard JS number.
 */
function float16ToFloat32(h: number): number {
  const s = (h & 0x8000) >> 15;
  const e = (h & 0x7c00) >> 10;
  const m = h & 0x03ff;

  if (e === 0) {
    if (m === 0) {
      return s ? -0.0 : 0.0;
    }
    return (s ? -1 : 1) * Math.pow(2, -14) * (m / 1024);
  } else if (e === 31) {
    return m ? NaN : (s ? -Infinity : Infinity);
  }

  return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + m / 1024);
}

function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractHeadings(markdown: string): { title: string; sectionId: string }[] {
  const lines = markdown.split('\n');
  const headings: { title: string; sectionId: string }[] = [];
  let currentH2: string | null = null;
  let currentH3: string | null = null;
  let currentH4: string | null = null;

  for (const line of lines) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (match) {
      const depth = match[1].length;
      const headingText = match[2].trim();

      if (depth === 2) {
        currentH2 = headingText;
        currentH3 = null;
        currentH4 = null;
      } else if (depth === 3) {
        currentH3 = headingText;
        currentH4 = null;
      } else if (depth === 4) {
        currentH4 = headingText;
      }

      const idParts = [];
      if (currentH2) idParts.push(slugify(currentH2));
      if (currentH3) idParts.push(slugify(currentH3));
      if (currentH4) idParts.push(slugify(currentH4));
      const sectionId = idParts.join('::');

      headings.push({ title: headingText, sectionId });
    }
  }
  return headings;
}

function extractSectionBody(markdown: string, noteSlug: string, targetSectionId: string): string {
  const lines = markdown.split('\n');
  let currentH2: string | null = null;
  let currentH3: string | null = null;
  let currentH4: string | null = null;

  let capture = false;
  const capturedLines: string[] = [];

  // Match target introduction section
  const isIntroTarget = targetSectionId === 'introduction' || targetSectionId === `${noteSlug}::introduction`;
  if (isIntroTarget) {
    capture = true;
  }

  for (const line of lines) {
    const match = line.match(/^(#{2,4})\s+(.+)$/);
    if (match) {
      const depth = match[1].length;
      const headingText = match[2].trim();

      if (depth === 2) {
        currentH2 = headingText;
        currentH3 = null;
        currentH4 = null;
      } else if (depth === 3) {
        currentH3 = headingText;
        currentH4 = null;
      } else if (depth === 4) {
        currentH4 = headingText;
      }

      const idParts = [];
      if (currentH2) idParts.push(slugify(currentH2));
      if (currentH3) idParts.push(slugify(currentH3));
      if (currentH4) idParts.push(slugify(currentH4));
      const sectionId = `${noteSlug}::${idParts.join('::')}`;

      if (capture) {
        // We hit the next header, stop capturing
        break;
      }

      if (sectionId === targetSectionId || sectionId === `${noteSlug}::${targetSectionId}`) {
        capture = true;
        capturedLines.push(line); // include the header
      }
    } else {
      if (capture) {
        capturedLines.push(line);
      }
    }
  }
  return capturedLines.join('\n').trim();
}

interface SearchIndex {
  sectionCount: number;
  metadata: { sectionId: string; noteSlug: string; breadcrumb: string }[];
  vectors: Float32Array[];
}

let cachedIndex: SearchIndex | null = null;

async function loadSearchIndex(): Promise<SearchIndex> {
  if (cachedIndex) return cachedIndex;

  const res = await fetch('/embeddings.bin');
  if (!res.ok) {
    throw new Error('Failed to load search embeddings binary index');
  }

  const buffer = await res.arrayBuffer();
  const view = new DataView(buffer);

  // Check magic bytes
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (magic !== 'MKTB') {
    throw new Error('Invalid embeddings index format');
  }

  const version = view.getUint16(4, true);
  if (version !== 1) {
    throw new Error('Unsupported version of embeddings index');
  }

  const sectionCount = view.getUint16(6, true);

  // Metadata block: null-terminated strings
  const u8Array = new Uint8Array(buffer);
  let metadataEnd = 8;
  while (metadataEnd < u8Array.length - 1) {
    if (u8Array[metadataEnd] === 0 && u8Array[metadataEnd + 1] === 0) {
      break;
    }
    metadataEnd++;
  }

  const metadataBytes = u8Array.slice(8, metadataEnd);
  const metadataString = new TextDecoder('utf-8').decode(metadataBytes);
  const rawMetaStrings = metadataString.split('\0').filter(Boolean);
  const metadata = rawMetaStrings.map((str) => JSON.parse(str));

  // Vector block starts after double null bytes
  const vectorOffset = metadataEnd + 2;
  const vectorDim = 384;

  // Use arrayBuffer slice to prevent RangeError alignment issues
  const floatView = new Uint16Array(buffer.slice(vectorOffset));

  const vectors: Float32Array[] = [];
  let flatIndex = 0;
  for (let i = 0; i < sectionCount; i++) {
    const vec = new Float32Array(vectorDim);
    for (let j = 0; j < vectorDim; j++) {
      vec[j] = float16ToFloat32(floatView[flatIndex++]);
    }
    vectors.push(vec);
  }

  cachedIndex = { sectionCount, metadata, vectors };
  return cachedIndex;
}

// ─── Gemini Tool Schemas ──────────────────────────────────────────────────────

export const toolDeclarations = [
  {
    name: 'semanticSearch',
    description: 'Perform a semantic vector search across notes to find sections matching the query concepts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search terms or natural language query' },
        threshold: { type: 'NUMBER', description: 'Similarity match threshold (default is 0.35)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'readNoteSummary',
    description: 'Read a note outline showing its title, tags, backlinks, word count, and list of section headers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING', description: 'The unique note slug name' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'readNoteSection',
    description: 'Fetch the text content of a specific heading section inside a note.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING', description: 'The note slug name' },
        sectionId: { type: 'STRING', description: 'The section ID (e.g. virtual-memory::page-replacement)' },
      },
      required: ['slug', 'sectionId'],
    },
  },
  {
    name: 'readNoteFull',
    description: 'Fetch the complete Markdown body text of a note (use only if summary/sections are insufficient).',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING', description: 'The note slug name' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'getGraphNeighbors',
    description: 'Retrieve inbound and outbound links for a note to explore the knowledge graph.',
    parameters: {
      type: 'OBJECT',
      properties: {
        slug: { type: 'STRING', description: 'The note slug name' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'listNotesByTag',
    description: 'Get all notes associated with a specific tag (e.g., field/cs, subject/os).',
    parameters: {
      type: 'OBJECT',
      properties: {
        tag: { type: 'STRING', description: 'The tag name' },
      },
      required: ['tag'],
    },
  },
  {
    name: 'getTagTaxonomy',
    description: 'Retrieve the list of all available tags in the library grouped by category with counts.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'askUser',
    description: 'Ask the user a multiple-choice question for clarification when the query is ambiguous.',
    parameters: {
      type: 'OBJECT',
      properties: {
        question: { type: 'STRING', description: 'Clarification query text' },
        options: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'A list of selectable response options',
        },
      },
      required: ['question'],
    },
  },
] as unknown as FunctionDeclaration[];

// ─── Tool JS Implementations ──────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  onClarification?: (q: string, opts?: string[]) => Promise<string>
): Promise<unknown> {
  switch (name) {
    case 'semanticSearch': {
      const { query, threshold = 0.35 } = args as { query: string; threshold?: number };

      // 1. Get query vector from backend api
      const vecRes = await fetch('/api/vectorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!vecRes.ok) {
        throw new Error('Failed to generate semantic search vector from api');
      }
      const { vector } = await vecRes.json();

      // 2. Fetch and parse index
      const index = await loadSearchIndex();

      // 3. Compute similarities
      const matches: { noteSlug: string; breadcrumb: string; sectionId: string; score: number }[] = [];
      for (let i = 0; i < index.sectionCount; i++) {
        const score = cosineSimilarity(vector, index.vectors[i]);
        if (score >= threshold) {
          const meta = index.metadata[i];
          matches.push({
            noteSlug: meta.noteSlug,
            breadcrumb: meta.breadcrumb,
            sectionId: meta.sectionId,
            score,
          });
        }
      }

      // Group by slug, keeping the highest-scoring section per note
      const grouped = new Map<string, typeof matches[number]>();
      for (const m of matches) {
        const existing = grouped.get(m.noteSlug);
        if (!existing || m.score > existing.score) {
          grouped.set(m.noteSlug, m);
        }
      }

      return { results: Array.from(grouped.values()).sort((a, b) => b.score - a.score).slice(0, 5) };
    }

    case 'readNoteSummary': {
      const { slug } = args as { slug: string };
      const res = await fetch(`/api/notes?slug=${slug}`);
      if (!res.ok) {
        throw new Error(`Note not found: ${slug}`);
      }
      const note = await res.json();
      const headings = extractHeadings(note.rawMarkdown);
      return {
        slug: note.slug,
        title: note.title,
        tags: note.tags,
        wordCount: note.wordCount,
        relativePath: note.relativePath,
        headings,
        backlinks: note.backlinks,
      };
    }

    case 'readNoteSection': {
      const { slug, sectionId } = args as { slug: string; sectionId: string };
      const res = await fetch(`/api/notes?slug=${slug}`);
      if (!res.ok) {
        throw new Error(`Note not found: ${slug}`);
      }
      const note = await res.json();
      const body = extractSectionBody(note.rawMarkdown, slug, sectionId);
      return {
        slug,
        sectionId,
        content: body,
      };
    }

    case 'readNoteFull': {
      const { slug } = args as { slug: string };
      const res = await fetch(`/api/notes?slug=${slug}`);
      if (!res.ok) {
        throw new Error(`Note not found: ${slug}`);
      }
      const note = await res.json();
      return {
        slug: note.slug,
        title: note.title,
        content: note.rawMarkdown,
      };
    }

    case 'getGraphNeighbors': {
      const { slug } = args as { slug: string };
      const res = await fetch(`/api/notes?slug=${slug}`);
      if (!res.ok) {
        throw new Error(`Note not found: ${slug}`);
      }
      const note = await res.json();
      return {
        slug: note.slug,
        backlinks: note.backlinks,
      };
    }

    case 'listNotesByTag': {
      const { tag } = args as { tag: string };
      const res = await fetch('/api/notes?tagIndex=true');
      if (!res.ok) {
        throw new Error('Failed to load tag index');
      }
      const tagIndex = await res.json();
      
      let slugs = tagIndex[tag];
      if (!slugs) {
        slugs = tagIndex[`concept/${tag}`] ||
                tagIndex[`subject/${tag}`] ||
                tagIndex[`field/${tag}`] ||
                [];
      }

      return {
        tag,
        notes: slugs,
      };
    }

    case 'getTagTaxonomy': {
      const res = await fetch('/api/notes?tagIndex=true');
      if (!res.ok) {
        throw new Error('Failed to load tag index');
      }
      const tagIndex = await res.json();
      const fields: Record<string, number> = {};
      const subjects: Record<string, number> = {};
      const concepts: Record<string, number> = {};

      for (const tag of Object.keys(tagIndex)) {
        const count = tagIndex[tag].length;
        const [category, name] = tag.split('/');
        if (!name) continue;

        if (category === 'field') {
          fields[name] = count;
        } else if (category === 'subject') {
          subjects[name] = count;
        } else if (category === 'concept') {
          concepts[name] = count;
        }
      }

      return { fields, subjects, concepts };
    }

    case 'askUser': {
      if (!onClarification) {
        return { response: 'User interaction not supported in current environment.' };
      }
      const { question, options } = args as { question: string; options?: string[] };
      const answer = await onClarification(question, options);
      return { response: answer };
    }

    default:
      throw new Error(`Unsupported tool name: ${name}`);
  }
}
