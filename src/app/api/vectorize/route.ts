import { NextResponse } from 'next/server';

// Lazy load the pipeline in development to avoid bundle issues on serverless when proxy is used
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localExtractor: any = null;

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid query string in request body' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.VECTORIZE_BACKEND_URL;

    if (backendUrl) {
      // Proxy to deployed backend
      console.log(`[vectorize-api] Proxying vectorization request to: ${backendUrl}`);
      const res = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (!res.ok) {
        throw new Error(`Backend vectorizer returned status ${res.status}`);
      }
      const data = await res.json();
      if (!data.vector || !Array.isArray(data.vector)) {
        throw new Error('Backend response missing "vector" array');
      }
      return NextResponse.json({ vector: data.vector });
    }

    // Local fallback using @huggingface/transformers
    console.log('[vectorize-api] No VECTORIZE_BACKEND_URL configured. Falling back to local model...');
    const { pipeline } = await import('@huggingface/transformers');
    if (!localExtractor) {
      localExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    }
    const output = await localExtractor(query, { pooling: 'mean', normalize: true });
    const vector = Array.from(output.data as Float32Array);
    return NextResponse.json({ vector });

  } catch (err: unknown) {
    console.error('[vectorize-api] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during vectorization';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
