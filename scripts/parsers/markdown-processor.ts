import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

// Build the unified processor once and reuse across all notes (expensive to build)
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeKatex)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify, { allowDangerousHtml: true });

/**
 * Convert a processed Markdown string into an HTML string.
 * Handles:
 *  - GitHub Flavored Markdown (tables, task lists, strikethrough)
 *  - LaTeX math: $inline$ and $$block$$
 *  - Fenced code blocks with syntax highlighting
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await processor.process(markdown);
  return String(result);
}
