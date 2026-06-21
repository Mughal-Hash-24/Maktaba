// scripts/build-embeddings.ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';

import { parseSections } from './parsers/section-parser.js';
import { packEmbeddings } from './utils/binary-packer.js';
import type { SectionChunk, NoteFull } from './types.js';

const NOTES_DIR = join(process.cwd(), 'content', 'notes');
const CACHE_PATH = join(process.cwd(), 'content', 'embeddings-cache.json');
const OUTPUT_BIN_PATH = join(process.cwd(), 'public', 'embeddings.bin');
const SECTIONS_JSON_PATH = join(process.cwd(), 'content', 'sections.json');

const EMBEDDING_DIMENSION = 384; // local all-MiniLM-L6-v2 output dimension
const BATCH_SIZE = 100;
const REMOTE_BATCH_SIZE = 50; // conservative for the free HF Space
const REMOTE_DELAY_MS = 200;  // polite pause between remote calls

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedRemote(texts: string[], backendUrl: string): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += REMOTE_BATCH_SIZE) {
    const batch = texts.slice(i, i + REMOTE_BATCH_SIZE);
    console.log(
      `  [remote] Batch ${Math.floor(i / REMOTE_BATCH_SIZE) + 1} of ${Math.ceil(texts.length / REMOTE_BATCH_SIZE)} (${batch.length} items)...`
    );
    // The HF Space /vectorize endpoint handles one query at a time;
    // call in parallel within each batch to keep things fast.
    const batchVectors = await Promise.all(
      batch.map(async (text) => {
        const res = await fetch(backendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: text }),
        });
        if (!res.ok) {
          throw new Error(`Remote vectorizer returned ${res.status} for text: "${text.slice(0, 60)}..."`);
        }
        const data = (await res.json()) as { vector: number[] };
        if (!data.vector || data.vector.length !== EMBEDDING_DIMENSION) {
          throw new Error(
            `Remote vectorizer returned wrong dimension: expected ${EMBEDDING_DIMENSION}, got ${data.vector?.length}`
          );
        }
        return data.vector;
      })
    );
    results.push(...batchVectors);
    if (i + REMOTE_BATCH_SIZE < texts.length) {
      await sleep(REMOTE_DELAY_MS);
    }
  }
  return results;
}


function getMD5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function main(): Promise<void> {
  const startTime = Date.now();
  let remoteBackendUrl = process.env.VECTORIZE_BACKEND_URL;
  if (remoteBackendUrl && remoteBackendUrl.endsWith('/health')) {
    remoteBackendUrl = remoteBackendUrl.slice(0, -7) + '/vectorize';
  }

  if (remoteBackendUrl) {
    console.log(`[embeddings] Remote backend detected: ${remoteBackendUrl}`);
    console.log('[embeddings] CI mode: vectorization will call HF Space API.');
  } else {
    console.log('[embeddings] No VECTORIZE_BACKEND_URL set. Using local model (dev mode).');
  }

  console.log('[embeddings] Starting embedding generation pipeline...');

  // 1. Initialize local pipeline (only if not using remote backend)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extractor: any = null;
  if (!remoteBackendUrl) {
    console.log('[embeddings] Loading local feature extraction model (all-MiniLM-L6-v2)...');
    const { pipeline } = await import('@huggingface/transformers');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  // 2. Load cache
  let cache: Record<string, number[]> = {};
  try {
    const rawCache = await readFile(CACHE_PATH, 'utf-8');
    cache = JSON.parse(rawCache) as Record<string, number[]>;
    console.log(`[embeddings] Loaded cache containing ${Object.keys(cache).length} entries.`);
  } catch {
    console.log('[embeddings] No existing cache found. Initializing empty cache.');
  }

  // 3. Read processed notes and parse sections
  const noteFiles = (await readdir(NOTES_DIR)).filter((f) => f.endsWith('.json'));
  console.log(`[embeddings] Processing ${noteFiles.length} notes from content directory...`);

  const allSections: SectionChunk[] = [];

  for (const filename of noteFiles) {
    const filePath = join(NOTES_DIR, filename);
    const rawContent = await readFile(filePath, 'utf-8');
    const note = JSON.parse(rawContent) as NoteFull;

    const sections = parseSections(note.slug, note.title, note.rawMarkdown);
    allSections.push(...sections);
  }

  console.log(`[embeddings] Parsed ${allSections.length} sections across all notes.`);

  // 4. Match sections with cache and queue missing ones
  const finalVectors: number[][] = new Array(allSections.length);
  const queue: { index: number; text: string; hash: string }[] = [];

  for (let i = 0; i < allSections.length; i++) {
    const sec = allSections[i];
    const textToEmbed = `${sec.breadcrumb}: ${sec.textContent}`;
    const hash = getMD5(textToEmbed);

    // Reuse vector if cached and matches target dimension
    if (cache[hash] && Array.isArray(cache[hash]) && cache[hash].length === EMBEDDING_DIMENSION) {
      finalVectors[i] = cache[hash];
    } else {
      queue.push({ index: i, text: textToEmbed, hash });
    }
  }

  console.log(`[embeddings] Cache status: ${allSections.length - queue.length} hits, ${queue.length} misses.`);

  // 5. Embed missing sections — remote (CI) or local (dev)
  if (queue.length > 0) {
    if (remoteBackendUrl) {
      // --- CI path: call HF Space API ---
      console.log(`[embeddings] Embedding ${queue.length} sections via remote backend...`);
      const texts = queue.map((item) => item.text);
      const vectors = await embedRemote(texts, remoteBackendUrl);
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        finalVectors[item.index] = vectors[i];
        cache[item.hash] = vectors[i];
      }
    } else {
      // --- Local dev path: run model on this machine ---
      console.log(`[embeddings] Embedding ${queue.length} sections locally in batches of ${BATCH_SIZE}...`);

      for (let i = 0; i < queue.length; i += BATCH_SIZE) {
        const batchItems = queue.slice(i, i + BATCH_SIZE);
        const batchTexts = batchItems.map((item) => item.text);

        console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(queue.length / BATCH_SIZE)} (${batchItems.length} items)...`);

        const output = await extractor(batchTexts, { pooling: 'mean', normalize: true });
        const data = Array.from(output.data as Float32Array);

        // Update vectors and save back to cache map
        for (let k = 0; k < batchItems.length; k++) {
          const item = batchItems[k];
          const vector = data.slice(k * EMBEDDING_DIMENSION, (k + 1) * EMBEDDING_DIMENSION);
          finalVectors[item.index] = vector;
          cache[item.hash] = vector;
        }
      }
    }

    // Save updated cache
    await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
    console.log(`[embeddings] Cache updated and saved to ${CACHE_PATH}`);
  }

  // 6. Write out sections.json
  await writeFile(SECTIONS_JSON_PATH, JSON.stringify(allSections, null, 2), 'utf-8');
  console.log(`[embeddings] Sections JSON record written to ${SECTIONS_JSON_PATH}`);

  // 7. Pack and write public/embeddings.bin
  console.log('[embeddings] Packing vectors and metadata into float16 embeddings.bin...');
  await packEmbeddings(allSections, finalVectors, OUTPUT_BIN_PATH);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[embeddings] Pipeline finished in ${elapsed}s. Deliverable saved to ${OUTPUT_BIN_PATH}`);
}

main().catch((err) => {
  console.error('[embeddings] Pipeline crashed:', err);
  process.exit(1);
});
