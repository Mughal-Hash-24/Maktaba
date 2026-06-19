import type { SlugMap, BacklinkEntry } from '../types.js';

export interface ResolveResult {
  processedMarkdown: string;
  resolvedLinks: string[]; // array of target slugs this note links to
}

/**
 * Replace all Obsidian wikilink syntax in a markdown string.
 *
 * Patterns handled:
 *   ![[Embed]]              → stripped entirely (no transclusion on web)
 *   [[Note]]                → [Note](/notes/slug) or plain text "Note"
 *   [[Note|Alias]]          → [Alias](/notes/slug) or plain text "Alias"
 *   [[Note#Section]]        → resolved to note level (section anchor stripped)
 *   [[Note#Section|Alias]]  → [Alias](/notes/slug) or plain text "Alias"
 */
export function resolveWikilinks(markdown: string, slugMap: SlugMap): ResolveResult {
  const resolvedLinks: string[] = [];

  // Step 1: Strip embedded transclusions  ![[anything]]
  let processed = markdown.replace(/!\[\[[^\]]+\]\]/g, '');

  // Step 2: Process regular wikilinks  [[...]]
  processed = processed.replace(/\[\[([^\]]+)\]\]/g, (_match, inner: string) => {
    // Split on pipe to get target and optional display alias
    const pipeIdx = inner.indexOf('|');
    let target: string;
    let displayText: string;

    if (pipeIdx !== -1) {
      target = inner.slice(0, pipeIdx).trim();
      displayText = inner.slice(pipeIdx + 1).trim();
    } else {
      target = inner.trim();
      displayText = '';
    }

    // Strip section anchor from target  [[Note#Section]] → "Note"
    const hashIdx = target.indexOf('#');
    if (hashIdx !== -1) {
      target = target.slice(0, hashIdx).trim();
    }

    // Look up by filename (key in byFilename is the filename without .md)
    const slug = slugMap.byFilename[target];

    if (slug) {
      resolvedLinks.push(slug);
      const linkText = displayText || target.replace(/[_-]/g, ' ');
      return `[${linkText}](/notes/${slug})`;
    } else {
      // Unresolvable — return plain text
      return displayText || target.replace(/[_-]/g, ' ');
    }
  });

  return { processedMarkdown: processed, resolvedLinks };
}

/**
 * Compute bidirectional backlinks from a link graph.
 *
 * @param linkGraph  Map of sourceSlug → [targetSlug, ...]
 * @param slugToTitle Map of slug → title string
 * @returns Map of targetSlug → array of { slug, title } backlink entries
 */
export function computeBacklinks(
  linkGraph: Map<string, string[]>,
  slugToTitle: Map<string, string>
): Map<string, BacklinkEntry[]> {
  const backlinks = new Map<string, BacklinkEntry[]>();

  for (const [sourceSlug, targets] of linkGraph.entries()) {
    for (const targetSlug of targets) {
      if (!backlinks.has(targetSlug)) {
        backlinks.set(targetSlug, []);
      }
      backlinks.get(targetSlug)!.push({
        slug: sourceSlug,
        title: slugToTitle.get(sourceSlug) ?? sourceSlug,
      });
    }
  }

  return backlinks;
}
