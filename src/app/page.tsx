/* src/app/page.tsx */
import Link from 'next/link';
import { getAllNotesMetadata, readJsonFile, GraphData } from '../lib/notes';
import LandingStats from '../components/LandingStats';
import styles from '../styles/landing.module.css';

export const metadata = {
  title: 'Maktaba — A Living Library of Curated Knowledge',
  description: 'In the spirit of Bayt al-Hikma, a personal knowledge base and AI companion.',
};

const WING_CARDS = [
  {
    key: 'science-tech',
    title: 'Science & Tech Wing',
    color: 'var(--color-cs)',
    desc: 'Housings for computer architecture, operating systems, automata, databases, and software design.',
  },
  {
    key: 'formal-sciences',
    title: 'Formal Sciences Wing',
    color: 'var(--color-math)',
    desc: 'Discrete structures, linear algebra, statistics, mathematical logic, and formal proof systems.',
  },
  {
    key: 'humanities-arts',
    title: 'Humanities & Arts Wing',
    color: 'var(--color-humanities)',
    desc: 'Philosophy, literature study, islamic jurisprudence (Fiqh), history of sciences, and theory of music.',
  },
  {
    key: 'social-sciences',
    title: 'Social Sciences Wing',
    color: 'var(--color-social)',
    desc: 'Economics, cognitive science, psychological models, geopolitical history, and law.',
  },
];

// Helper to determine which wing a subject tag belongs to
const getSubjectWing = (subjectTag: string): string => {
  const name = (subjectTag.split('/')[1] || '').toLowerCase();
  
  const formal = ['math', 'discrete', 'linear-algebra', 'statistics', 'logic'];
  const social = ['economics', 'psychology', 'cognitive-science', 'pak-studies', 'history', 'russia', 'law'];
  const humanities = ['philosophy', 'fiqh', 'literature', 'music'];
  
  if (formal.some(s => name.includes(s))) return 'formal-sciences';
  if (social.some(s => name.includes(s))) return 'social-sciences';
  if (humanities.some(s => name.includes(s))) return 'humanities-arts';
  
  return 'science-tech';
};

export default async function Home() {
  const notes = await getAllNotesMetadata();
  const graphData = await readJsonFile<GraphData>('graph.json');

  // Compute stats
  const totalNotes = notes.length;
  const totalWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
  const totalConnections = graphData ? graphData.edges.length : 0;

  // Extract all unique subject tags to count subjects
  const subjectTags = new Set<string>();
  notes.forEach((note) => {
    note.tags.forEach((tag) => {
      if (tag.startsWith('subject/')) {
        subjectTags.add(tag);
      }
    });
  });
  const totalDomains = subjectTags.size || 35; // Total unique subject categories

  // Wing counts calculation
  const wingCounts: Record<string, number> = {
    'science-tech': 0,
    'formal-sciences': 0,
    'humanities-arts': 0,
    'social-sciences': 0,
  };

  notes.forEach((note) => {
    // Collect wings this note belongs to (based on its subject tags)
    const wings = new Set<string>();
    const subjectTags = note.tags.filter((t) => t.startsWith('subject/'));
    
    if (subjectTags.length === 0) {
      wings.add('science-tech'); // Default fallback
    } else {
      subjectTags.forEach((tag) => {
        wings.add(getSubjectWing(tag));
      });
    }

    wings.forEach((wing) => {
      if (wing in wingCounts) {
        wingCounts[wing]++;
      }
    });
  });

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <section className={`${styles.hero} ${styles.fadeIn}`}>
        <div className={styles.subtitle}>Curated Knowledge Vault</div>
        <h1 className={styles.title}>Maktaba</h1>
        <p className={styles.description}>
          In the spirit of Bayt al-Hikma (The House of Wisdom). A living, hyper-linked library of 
          personal notes, research outlines, and academic synthesis across computer science, mathematics, and philosophy.
        </p>
        <div className={styles.ctas}>
          <Link href="/library" className={styles.btnPrimary}>
            Browse the Library
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </Link>
          <Link href="/graph" className={styles.btnSecondary}>
            Explore the Graph Map
          </Link>
        </div>
      </section>

      {/* Stats Strip */}
      <LandingStats
        totalNotes={totalNotes}
        totalWords={totalWords}
        totalDomains={totalDomains}
        totalConnections={totalConnections}
      />

      {/* Domain/Wings Showcase Grid */}
      <section className={`${styles.fadeIn} ${styles.delay2}`}>
        <h2 className={styles.sectionTitle}>Wings of the Library</h2>
        <p className={styles.sectionSubtitle}>
          Select a wing below to browse themed bookshelves and conceptual shelves.
        </p>
        
        <div className={styles.showcaseGrid}>
          {WING_CARDS.map((card) => {
            const count = wingCounts[card.key] || 0;
            return (
              <div
                key={card.key}
                className={`${styles.showcaseCard} glass`}
                style={{ borderTop: `3px solid ${card.color}` }}
              >
                <div>
                  <div className={styles.showcaseCardHeader}>
                    <h3 className={styles.showcaseTitle}>{card.title}</h3>
                    <span className={styles.showcaseCount}>{count} books</span>
                  </div>
                  <p className={styles.showcaseDesc}>{card.desc}</p>
                </div>
                <Link
                  href={`/library?wing=${card.key}`}
                  className={styles.showcaseLink}
                  style={{ color: card.color }}
                >
                  Enter Wing →
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Hikma Teaser Section */}
      <section className={`${styles.fadeIn} ${styles.delay3} ${styles.hikmaTeaser}`}>
        <div className={styles.teaserInfo}>
          <h2 className={styles.sectionTitle}>Meet Hikma</h2>
          <p className={styles.sectionSubtitle} style={{ marginBottom: 'var(--space-sm)' }}>
            Your Intelligent Research Companion
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Hikma integrates directly with your knowledge graph. When you ask questions, it searches 
            the library using vector embeddings, retrieves the relevant context, and synthesizes 
            a grounded response cited with exact sources.
          </p>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '8px' }}>
            🔒 <strong>Bring-Your-Own-Key (BYOK):</strong> All AI calls are made directly from your browser 
            to Google Gemini. Your API key stays private, stored only in your local storage.
          </p>
        </div>

        <div className={`${styles.mockChatWindow} glass`}>
          <div className={`${styles.chatBubble} ${styles.userBubble}`}>
            What is the difference between page faults and page replacement?
          </div>
          <div className={`${styles.chatBubble} ${styles.aiBubble}`}>
            <strong>Hikma:</strong> A <em>page fault</em> occurs when a program attempts to access 
            a memory page that is not currently loaded in physical RAM. 
            <br /><br />
            Conversely, <em>page replacement</em> is the algorithm executed by the OS to decide 
            which page to swap out of physical memory to make room for the newly requested page.
            <br />
            <span style={{ display: 'inline-block', marginTop: '8px', fontSize: '0.75rem', color: 'var(--color-cs)' }}>
              Sources: [Virtual Memory], [Page Replacement Algorithms]
            </span>
          </div>
        </div>
      </section>

      {/* Philosophy Section */}
      <section className={`${styles.fadeIn} ${styles.delay3} ${styles.philosophy}`}>
        <blockquote className={styles.philosophyQuote}>
          Acquiring knowledge is the duty of every scholar. In our library, we do not merely store 
          texts — we build paths between them, tracing the constellation of human intellect.
        </blockquote>
        <div className={styles.philosophyAuthor}>House of Wisdom Tradition</div>
      </section>
    </div>
  );
}
export const dynamic = 'force-static';
