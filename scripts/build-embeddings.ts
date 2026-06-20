// scripts/build-embeddings.ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from '@huggingface/transformers';
import { parseSections } from './parsers/section-parser.js';
import { packEmbeddings } from './utils/binary-packer.js';
import type { SectionChunk, NoteFull } from './types.js';

const NOTES_DIR = join(process.cwd(), 'content', 'notes');
const CACHE_PATH = join(process.cwd(), 'content', 'embeddings-cache.json');
const OUTPUT_BIN_PATH = join(process.cwd(), 'public', 'embeddings.bin');
const SECTIONS_JSON_PATH = join(process.cwd(), 'content', 'sections.json');

const EMBEDDING_DIMENSION = 384; // local all-MiniLM-L6-v2 output dimension
const BATCH_SIZE = 100;

function getMD5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log('[embeddings] Starting local embedding generation pipeline...');

  // 1. Initialize local pipeline
  console.log('[embeddings] Loading local feature extraction model (all-MiniLM-L6-v2)...');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

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

  // 5. Run local model execution for queued sections in batches
  if (queue.length > 0) {
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
