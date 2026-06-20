import { NextResponse } from 'next/server';

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

    if (!backendUrl) {
      console.error('[vectorize-api] VECTORIZE_BACKEND_URL is not configured.');
      return NextResponse.json(
        { error: 'Vectorization backend is not configured. Set VECTORIZE_BACKEND_URL.' },
        { status: 503 }
      );
    }

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

  } catch (err: unknown) {
    console.error('[vectorize-api] Error:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during vectorization';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

