// scripts/run-hikma-harness.ts
import { AgentHarness, ThoughtStep } from '../src/lib/agent-harness';
import { Content } from '@google/generative-ai';

async function main() {
  const query = process.argv[2] || 'SQL Left Outer Joins';
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
