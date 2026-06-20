import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { toolDeclarations } from '../../../lib/agent-tools';

export async function POST(request: Request) {
  try {
    const { contents, systemInstruction, modelName } = await request.json();
    if (!contents || !Array.isArray(contents)) {
      return NextResponse.json(
        { error: 'Missing or invalid contents history in request body' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: GEMINI_API_KEY is not set.' },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName || 'gemma-4-31b-it',
      systemInstruction,
      tools: [{ functionDeclarations: toolDeclarations }],
    });

    const result = await model.generateContent({
      contents,
    });

    // Extract candidates or standard model response payload
    const responsePayload = result.response;
    return NextResponse.json(responsePayload);
  } catch (err: unknown) {
    console.error('[chat-api] Error proxying query to Gemini:', err);
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during API execution';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
