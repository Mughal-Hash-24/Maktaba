/* src/app/notes/[slug]/page.tsx */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getNoteBySlug, getAllNotesMetadata } from '../../../lib/notes';
import { processHtmlAndExtractToc } from '../../../lib/toc';
import TableOfContents from '../../../components/TableOfContents';
import styles from '../../../styles/note-reader.module.css';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Generate static params for all notes
export async function generateStaticParams() {
  const notes = await getAllNotesMetadata();
  return notes.map((note) => ({
    slug: note.slug,
  }));
}

// Generate metadata for each note (SEO)
export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const note = await getNoteBySlug(slug);
  if (!note) {
    return {
      title: 'Note Not Found — Maktaba',
    };
  }

  // Strip HTML and get 160 characters description
  const textContent = note.htmlContent.replace(/<[^>]*>/g, ' ');
  const description = textContent.slice(0, 160).trim() + '...';

  return {
    title: `${note.title} — Maktaba`,
    description,
    openGraph: {
      title: note.title,
      description,
      type: 'article',
    },
  };
}

// Format relativePath into user-friendly breadcrumbs
function getBreadcrumbs(relativePath: string, currentTitle: string) {
  const parts = relativePath.split('/');
  // Remove the filename (last segment)
  parts.pop();

  const breadcrumbs = [{ label: 'Library', path: '/library' }];

  let currentPath = '/library'; // Default fallback link
  
  parts.forEach((part) => {
    // Clean segment name: e.g. "20_CS_Core" -> "CS Core", "10_University" -> "University"
    let label = part
      .replace(/^\d+_+/, '') // remove prefix digits and underscores
      .replace(/_/g, ' ');   // replace underscores with spaces
    
    // Capitalize words
    label = label.replace(/\b\w/g, (c) => c.toUpperCase());
    
    // Attempt map to known routes
    if (part.toLowerCase().includes('university')) {
      currentPath = '/library?domain=university';
    } else if (part.toLowerCase().includes('cs_core')) {
      currentPath = '/library?domain=cs';
    } else if (part.toLowerCase().includes('knowledge_base')) {
      currentPath = '/library?domain=humanities';
    } else if (part.toLowerCase().includes('projects')) {
      currentPath = '/library?domain=cs';
    }

    breadcrumbs.push({ label, path: currentPath });
  });

  breadcrumbs.push({ label: currentTitle, path: '' });
  return breadcrumbs;
}

export default async function NotePage({ params }: PageProps) {
  const { slug } = await params;
  const note = await getNoteBySlug(slug);

  if (!note) {
    notFound();
  }

  const { processedHtml, toc } = processHtmlAndExtractToc(note.htmlContent);
  const breadcrumbs = getBreadcrumbs(note.relativePath, note.title);

  return (
    <div className={styles.noteContainer}>
      <div className={styles.articleWrapper}>
        {/* Breadcrumbs */}
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <span key={idx} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {idx > 0 && <span className={styles.breadcrumbSeparator}>&nbsp;/&nbsp;</span>}
                {isLast || !crumb.path ? (
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{crumb.label}</span>
                ) : (
                  <Link href={crumb.path}>{crumb.label}</Link>
                )}
              </span>
            );
          })}
        </nav>

        {/* Title */}
        <h1 className={styles.title}>{note.title}</h1>

        {/* Metadata section */}
        <div className={styles.metadata}>
          <span className={styles.wordCount}>{note.wordCount.toLocaleString()} words</span>
          <span>•</span>
          <div className={styles.tagList}>
            {note.tags.map((tag) => {
              const cleanTag = tag.split('/')[1] || tag;
              // If it's a domain tag, link to that domain specifically
              const isDomain = tag.startsWith('field/');
              const path = isDomain
                ? `/library?domain=${cleanTag}`
                : `/library?tag=${encodeURIComponent(tag)}`;

              return (
                <Link key={tag} href={path} className={styles.tagPill}>
                  {cleanTag}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Note Content */}
        <article
          className={styles.article}
          dangerouslySetInnerHTML={{ __html: processedHtml }}
        />

        {/* Backlinks */}
        <section className={styles.backlinksSection}>
          <h3 className={styles.backlinksTitle}>Linked to this note (Backlinks)</h3>
          {note.backlinks.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
              No other notes link back to this page.
            </p>
          ) : (
            <div className={styles.backlinksGrid}>
              {note.backlinks.map((link) => (
                <Link key={link.slug} href={`/notes/${link.slug}`} className={styles.backlinkCard}>
                  <div className={styles.backlinkTitle}>{link.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-cs)' }}>View connection →</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sticky Table of Contents (Desktop only) */}
      {toc.length > 0 && (
        <aside style={{ display: 'block' }}>
          <TableOfContents items={toc} />
        </aside>
      )}
    </div>
  );
}
export const dynamic = 'force-static';
