/* src/lib/toc.ts */

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // remove non-word/non-space/non-hyphen characters
    .replace(/[\s_]+/g, '-')   // replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, '');   // trim leading/trailing hyphens
}

/**
 * Parses the HTML content of a note to:
 * 1. Add unique ID attributes to <h2> and <h3> tags for scroll anchoring.
 * 2. Extract a structured list of headings for the Table of Contents.
 */
export function processHtmlAndExtractToc(htmlContent: string): {
  processedHtml: string;
  toc: TocItem[];
} {
  const toc: TocItem[] = [];
  const idCounts = new Map<string, number>();

  // Regex to match <h2> and <h3> headings
  // Group 1: tag name (h2 or h3)
  // Group 2: attributes (if any, like styles or classes)
  // Group 3: inner content
  const headingRegex = /<(h[23])([^>]*)>([\s\S]*?)<\/h[23]>/gi;

  let match;

  // We parse the original string but perform replacements.
  // Because we modify the string length, we can do a search-and-replace loop
  // or build it incrementally. Building it incrementally is safer.
  const segments: string[] = [];
  let lastIndex = 0;

  headingRegex.lastIndex = 0;
  while ((match = headingRegex.exec(htmlContent)) !== null) {
    const tag = match[1]; // 'h2' or 'h3'
    const attrs = match[2]; // e.g. class="..."
    const innerContent = match[3];

    // Strip HTML from inner content to calculate the clean text slug
    const cleanText = innerContent.replace(/<[^>]*>/g, '').trim();
    
    if (!cleanText) continue;

    let id = slugify(cleanText);
    
    // Handle duplicate IDs
    const count = idCounts.get(id) || 0;
    idCounts.set(id, count + 1);
    if (count > 0) {
      id = `${id}-${count}`;
    }

    toc.push({
      id,
      text: cleanText,
      depth: tag === 'h2' ? 2 : 3,
    });

    // Construct the replacement heading with the id attribute
    const newHeading = `<${tag} id="${id}"${attrs}>${innerContent}</${tag}>`;
    
    // Add the text before the match and the new heading
    segments.push(htmlContent.substring(lastIndex, match.index));
    segments.push(newHeading);
    
    lastIndex = headingRegex.lastIndex;
  }
  
  segments.push(htmlContent.substring(lastIndex));
  const processedHtml = segments.join('');

  return {
    processedHtml: segments.length > 0 ? processedHtml : htmlContent,
    toc,
  };
}
