/* src/app/library/page.tsx */
import { Suspense } from 'react';
import { getAllNotesMetadata } from '../../lib/notes';
import LibraryBrowser from '../../components/LibraryBrowser';

export const metadata = {
  title: 'Library Catalog — Maktaba',
  description: 'Browse all public-eligible notes, topics, and subjects from the knowledge vault.',
};

export default async function LibraryPage() {
  const initialNotes = await getAllNotesMetadata();

  return (
    <Suspense fallback={<div>Loading the shelves...</div>}>
      <LibraryBrowser initialNotes={initialNotes} />
    </Suspense>
  );
}
export const dynamic = 'force-static';
