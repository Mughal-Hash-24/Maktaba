// scripts/types.ts
// Shared TypeScript types used across the entire content pipeline

export interface VaultFile {
  absolutePath: string;
  relativePath: string;
  filename: string; // without .md extension
}

export interface NoteMetadata {
  slug: string;
  title: string;
  tags: string[];
  wordCount: number;
  relativePath: string;
  filename: string;
}

export interface NoteFull extends NoteMetadata {
  htmlContent: string;
  rawMarkdown: string;
  backlinks: BacklinkEntry[];
}

export interface BacklinkEntry {
  slug: string;
  title: string;
}

export interface SlugMap {
  byFilename: Record<string, string>; // filename (no ext) -> slug
  bySlug: Record<string, { filename: string; relativePath: string; title: string }>;
}

export interface TagIndex {
  [tag: string]: string[]; // tag -> array of slugs
}

export interface GraphNode {
  id: string;        // slug
  title: string;
  field: string;     // e.g. "cs", "math", "humanities"
  linkCount: number;
}

export interface GraphEdge {
  source: string; // slug
  target: string; // slug
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SectionChunk {
  sectionId: string;      // e.g. "virtual-memory::page-replacement::lru"
  noteSlug: string;
  noteTitle: string;
  breadcrumb: string;     // e.g. "Virtual Memory > Page Replacement > LRU Approximation"
  textContent: string;
  wordCount: number;
}

export interface BuildCacheEntry {
  md5: string;
  slug: string;
}

export interface BuildCache {
  [relativePath: string]: BuildCacheEntry;
}

export interface ResolvedLink {
  sourceSlug: string;
  targetSlug: string;
}
