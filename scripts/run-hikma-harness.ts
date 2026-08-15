// scripts/run-hikma-harness.ts
// Direct runner for Maktaba's exact native AgentHarness class with Node.js fetch polyfill
import fs from 'fs';
import path from 'path';
import { AgentHarness, ThoughtStep } from '../src/lib/agent-harness';
import { Content } from '@google/generative-ai';

const MAKTABA_DIR = path.resolve(__dirname, '..');
const originalFetch = globalThis.fetch;

// Polyfill relative fetch for Node.js environment
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof input === 'string' ? input : input.toString();

  // 1. Vectorize API -> Call HuggingFace Spaces Backend directly
  if (urlStr === '/api/vectorize' || urlStr.endsWith('/api/vectorize')) {
    const hfUrl = 'https://mughal-hash-maktaba-backend.hf.space/vectorize';
    return originalFetch(hfUrl, init);
  }

  // 2. Binary embeddings index -> Read from public/embeddings.bin
  if (urlStr === '/embeddings.bin' || urlStr.endsWith('/embeddings.bin')) {
    const filePath = path.join(MAKTABA_DIR, 'public', 'embeddings.bin');
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      return new Response(buffer, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' }
      });
    }
  }

  // 3. Notes API -> Read AST JSON files directly from content/ directory
  if (urlStr.includes('/api/notes')) {
    const urlObj = new URL(urlStr, 'http://localhost:3000');
    
    if (urlObj.searchParams.get('tagIndex') === 'true') {
      const tagPath = path.join(MAKTABA_DIR, 'content', 'tag-index.json');
      if (fs.existsSync(tagPath)) {
        const jsonText = fs.readFileSync(tagPath, 'utf-8');
        return new Response(jsonText, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const slug = urlObj.searchParams.get('slug');
    if (slug) {
      const notePath = path.join(MAKTABA_DIR, 'content', 'notes', `${slug}.json`);
      if (fs.existsSync(notePath)) {
        const jsonText = fs.readFileSync(notePath, 'utf-8');
        return new Response(jsonText, { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
  }

  // Fallback to standard fetch for absolute HTTP URLs
  return originalFetch(input, init);
};

async function main() {
  const query = process.argv[2] || 'Al-Ghazali 39 books';
  const mistralApiKey = process.env.MISTRAL_API_KEY || 'hWmddEBVlxcxq8COrO7ZfqUBaPdTDG6W';
  const geminiApiKey = process.env.GEMINI_API_KEY || null;

  const systemInstruction = `You are Hikma — the AI companion of the Maktaba living library (inspired by Bayt al-Hikma).
Answer questions grounded strictly in the library's notes retrieved using your search and read section tools.
Always cite the notes you used using [[Note Title]] syntax.`;

  console.log(`[Hikma Native Harness] Query: "${query}"`);

  const harness = new AgentHarness(
    geminiApiKey,
    (step: ThoughtStep) => {
      console.log(`[ThoughtStep] [${step.type.toUpperCase()}] ${step.message}`);
    },
    (chunk: string) => {
      process.stdout.write(chunk);
    },
    async (question: string) => {
      console.log(`[Clarification Requested]: ${question}`);
      return 'Proceed with best match';
    }
  );

  let attempts = 0;
  while (attempts < 3) {
    try {
      const history: Content[] = await harness.run(
        query,
        [],
        systemInstruction,
        15, // maxLoops
        'mistral-small-latest',
        mistralApiKey
      );

      const lastMsg = history[history.length - 1];
      console.log('\n\n=== FINAL HIKMA HARNESS RESPONSE ===\n');
      console.log(lastMsg.parts.map(p => p.text).filter(Boolean).join('\n'));
      break;
    } catch (err: unknown) {
      attempts++;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('429') && attempts < 3) {
        console.log(`[Hikma Rate Limit 429] Retrying in 3 seconds... (Attempt ${attempts}/3)`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error('[Hikma Native Harness Error]:', errMsg);
        process.exit(1);
      }
    }
  }
}

main();
