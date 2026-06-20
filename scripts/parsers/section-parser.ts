// scripts/parsers/section-parser.ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { SectionChunk } from '../types.js';

const astProcessor = unified().use(remarkParse);

function slugify(text: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
}

function nodeToMarkdown(node: any): string {
  if (!node) return '';

  switch (node.type) {
    case 'text':
      return node.value || '';
    case 'code':
      return `\n\`\`\`${node.lang || ''}\n${node.value || ''}\n\`\`\`\n`;
    case 'inlineCode':
      return `\`${node.value || ''}\``;
    case 'math':
      return `\n$$${node.value || ''}$$\n`;
    case 'inlineMath':
      return `$${node.value || ''}$`;
    case 'break':
      return '\n';
    case 'heading':
      const headingPrefix = '#'.repeat(node.depth || 1);
      return `\n${headingPrefix} ${nodesToMarkdown(node.children)}\n`;
    case 'paragraph':
      return `\n${nodesToMarkdown(node.children)}\n`;
    case 'list':
      const listContent = node.children
        .map((child: any, idx: number) => {
          const marker = node.ordered ? `${idx + 1}.` : '-';
          return `${marker} ${nodeToMarkdown(child).trim()}`;
        })
        .join('\n');
      return `\n${listContent}\n`;
    case 'listItem':
      return nodesToMarkdown(node.children);
    case 'blockquote':
      return `\n> ${nodesToMarkdown(node.children).replace(/\n/g, '\n> ')}\n`;
    case 'link':
      return `[${nodesToMarkdown(node.children)}](${node.url || ''})`;
    case 'emphasis':
      return `*${nodesToMarkdown(node.children)}*`;
    case 'strong':
      return `**${nodesToMarkdown(node.children)}**`;
    case 'table':
      return `\n${nodesToMarkdown(node.children)}\n`;
    case 'tableRow':
      return `| ${node.children.map(nodeToMarkdown).join(' | ')} |\n`;
    case 'tableCell':
      return nodesToMarkdown(node.children);
    default:
      if (node.children) {
        return nodesToMarkdown(node.children);
      }
      return node.value || '';
  }
}

function nodesToMarkdown(nodes: any[]): string {
  if (!nodes) return '';
  return nodes.map(nodeToMarkdown).join('');
}

interface RawSection {
  sectionId: string;
  noteSlug: string;
  noteTitle: string;
  breadcrumb: string;
  nodes: any[];
}

export function parseSections(
  noteSlug: string,
  noteTitle: string,
  rawMarkdown: string
): SectionChunk[] {
  const ast = astProcessor.parse(rawMarkdown);
  const children = ast.children;

  const rawSections: RawSection[] = [];
  
  let currentH2: string | null = null;
  let currentH3: string | null = null;
  let currentH4: string | null = null;

  // Initialize introduction section
  let currentSection: RawSection = {
    sectionId: `${noteSlug}::introduction`,
    noteSlug,
    noteTitle,
    breadcrumb: `${noteTitle} > [Introduction]`,
    nodes: [],
  };

  for (const node of children) {
    if (node.type === 'heading' && node.depth >= 2 && node.depth <= 4) {
      // Save the previous section if it had content
      if (currentSection.nodes.length > 0) {
        rawSections.push(currentSection);
      }

      const headingText = nodesToMarkdown(node.children).trim();

      // Update structural hierarchy
      if (node.depth === 2) {
        currentH2 = headingText;
        currentH3 = null;
        currentH4 = null;
      } else if (node.depth === 3) {
        currentH3 = headingText;
        currentH4 = null;
      } else if (node.depth === 4) {
        currentH4 = headingText;
      }

      // Construct breadcrumb path
      const pathParts = [noteTitle];
      if (currentH2) pathParts.push(currentH2);
      if (currentH3) pathParts.push(currentH3);
      if (currentH4) pathParts.push(currentH4);
      const breadcrumb = pathParts.join(' > ');

      // Build sectionId
      const idParts = [noteSlug];
      if (currentH2) idParts.push(slugify(currentH2));
      if (currentH3) idParts.push(slugify(currentH3));
      if (currentH4) idParts.push(slugify(currentH4));
      const sectionId = idParts.join('::');

      currentSection = {
        sectionId,
        noteSlug,
        noteTitle,
        breadcrumb,
        nodes: [node], // include the header node itself
      };
    } else {
      currentSection.nodes.push(node);
    }
  }

  // Push final section if any nodes exist
  if (currentSection.nodes.length > 0) {
    rawSections.push(currentSection);
  }

  // Serialize raw nodes to Markdown text and compute word count
  let chunks: SectionChunk[] = rawSections.map((sec) => {
    const textContent = nodesToMarkdown(sec.nodes).trim();
    const wordCount = textContent.split(/\s+/).filter(Boolean).length;
    return {
      sectionId: sec.sectionId,
      noteSlug: sec.noteSlug,
      noteTitle: sec.noteTitle,
      breadcrumb: sec.breadcrumb,
      textContent,
      wordCount,
    };
  });

  // Merge sections shorter than 50 words
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk.wordCount < 50) {
      if (i === 0) {
        // If it's the first section, merge the NEXT section into it (if exists)
        if (chunks.length > 1) {
          chunks[i + 1].textContent = `${chunk.textContent}\n\n${chunks[i + 1].textContent}`;
          chunks[i + 1].wordCount = chunks[i + 1].textContent.split(/\s+/).filter(Boolean).length;
          chunks.splice(i, 1);
          i--; // reprocess index
        }
      } else {
        // Merge into the PREVIOUS section
        chunks[i - 1].textContent = `${chunks[i - 1].textContent}\n\n${chunk.textContent}`;
        chunks[i - 1].wordCount = chunks[i - 1].textContent.split(/\s+/).filter(Boolean).length;
        chunks.splice(i, 1);
        i--; // reprocess index
      }
    }
  }

  return chunks;
}
