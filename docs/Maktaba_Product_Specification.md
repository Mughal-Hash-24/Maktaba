# Maktaba
### *In the spirit of Bayt al-Hikma*

> A living library of curated knowledge — browse, read, explore, and think alongside Hikma, your AI companion.

---

## What Maktaba Is

Maktaba is a public-facing living library built on a single scholar's personal knowledge vault — over 665,000 words across hundreds of interconnected notes spanning Computer Science, Mathematics, Philosophy, History, Islamic Jurisprudence, and more. It is not Wikipedia. It is not a blog. It is one person's lifelong reading, synthesized, organized, and made explorable — growing continuously.

Visitors can read notes, explore the web of connections between ideas, and converse with Hikma — an AI companion that thinks and answers using the library's own contents.

---

## Core Features

---

### 1. The Library — Browse & Read

The heart of the product. Every note in the vault is readable, navigable, and discoverable.

- **Note Reader** — clean, distraction-free reading experience for every note. Formatted for long-form reading with proper headings, code blocks, and mathematical expressions where relevant.
- **Wikilink Navigation** — every `[[linked note]]` inside a note is a live clickable link. Reading one note leads naturally to the next. The library is a web, not a list.
- **Domain Browsing** — notes are organized by field: Computer Science, Mathematics, Philosophy, History, Islamic Jurisprudence, Sciences, and more. Visitors can browse by domain or subject.
- **Tag Filtering** — every note carries three classification tags (field, subject, concept). Visitors can filter and explore by any combination.
- **Search** — a fast search bar across all note titles and content. Find any idea in the library instantly.

---

### 2. The Graph — The Map of Knowledge

A visual, interactive map of the entire library rendered as a connected graph. Every note is a node. Every link between notes is an edge.

- **Night Sky aesthetic** — nodes are colour-coded by domain. CS notes in neon blue, mathematics in vivid orange, humanities in emerald green, AI in cyber pink, and so on. The graph looks like a constellation map of ideas.
- **Click to open** — clicking any node opens that note directly.
- **Filter by domain** — isolate a field to see only its notes and connections, or reveal the full cross-domain web.
- **Zoom and explore** — pan, zoom, and navigate the graph freely. Discover unexpected connections between distant ideas.
- **Density as signal** — highly connected notes (the most important concepts in the vault) appear as brighter, more prominent nodes. The structure of knowledge becomes visible.

---

### 3. Hikma — The AI Companion

Hikma is the library's AI companion. Named in tribute to Bayt al-Hikma — the House of Wisdom — Hikma answers questions, synthesizes ideas, and thinks across the full breadth of the library's contents.

Hikma does not answer from generic internet knowledge. Every response is grounded in the actual notes of this library. If the library doesn't cover something, Hikma says so.

#### How Hikma Works
- The visitor asks a question or gives a prompt in natural language.
- Hikma searches the library semantically — not by keyword, but by meaning — and retrieves the most relevant notes and passages.
- Hikma synthesizes an answer that draws on those notes, connecting ideas across domains where relevant.
- Hikma cites which notes it drew from. Visitors can click any cited note to read it in full.

#### `@note` Referencing
- Visitors can explicitly reference notes in their query using the `@` symbol followed by the note name — for example: `@Left Outer Joins` or `@Fiqh of Contracts`.
- Multiple notes can be referenced in one query: `@B-Trees @Complexity Theory what connects these?`
- This gives visitors direct control over which parts of the library Hikma draws from. Power users can compose their own research sessions.

#### Bring Your Own API Key
- Hikma runs on the visitor's own free Google AI API key.
- The key is stored only in the visitor's browser and used to call Google's servers directly. Maktaba's servers never see the key, never store it, never touch it.
- This is verifiable — the app's source code is open.
- A permanent, quiet notice in the interface states this clearly. No modals, no repeated reassurance — just the truth, always visible.
- The key disappears automatically when the browser tab is closed, unless the visitor chooses to persist it.

---

### 4. Hikma Personalization

Visitors can shape Hikma's personality and behavior to match how they think and work.

- **Custom name** — rename Hikma to anything. Call it whatever feels right.
- **Custom system prompt** — write a short instruction that shapes every response. Tell Hikma to be more formal, more Socratic, more concise, to always cite sources, to respond in a particular style.
- **Personality presets** — a small set of pre-built modes to choose from if writing a custom prompt feels like too much: Scholar mode, Tutor mode, Debate mode, and so on.
- Settings are stored locally in the browser. Nothing is sent to the server.

---

### 5. Request a Note

A simple tab where visitors can submit topics they want covered in the library.

- Free-text submission — describe what you'd like to see a note on.
- Optional context field — explain why it interests you or how it connects to something you've already read.
- Submissions go directly to the curator (the library's author) as a signal for what to write next.
- No account required. No voting system. No public feed. Just a direct line from reader to author.
- This shapes the library's growth over time based on what actually intrigues the people who visit.

---

### 6. Semantic Search

Beyond the standard search bar, Maktaba offers a deeper search mode that understands meaning rather than just matching words.

- Type a concept, question, or phrase — not necessarily the exact title of a note.
- Returns notes ranked by semantic relevance, not keyword frequency.
- Useful for finding notes you didn't know existed, or discovering how the library covers an idea you have in mind.
- Powers Hikma's retrieval internally, but also available as a standalone search tool for visitors who want to explore without the AI layer.

---

## Planned Features

---

### Audio Overviews & Podcast Mode *(Future)*

Selected notes or groups of notes from the library can be transformed into audio discussions — a two-voice conversational format that talks through the ideas as if in dialogue.

- A visitor selects one or more notes.
- An audio overview is generated: a spoken, conversational synthesis of those notes.
- Downloadable as a podcast episode or playable directly in the browser.
- Particularly suited to the Fiqh notes — a synthesized discussion between the four madhab positions on a question, narrated in audio form, would be a genuinely novel format for Islamic scholarship content.
- Long-term: a curated Maktaba podcast feed, released periodically, drawing from the most-read or most-requested parts of the library.

---

## What Maktaba Is Not

- It is not a search engine for the whole internet.
- It is not a chatbot that knows everything.
- It is not a collaborative wiki — only the curator adds notes.
- It is not a course platform or structured curriculum.

It is a scholar's personal treasury, made public, made explorable, made conversational. It grows as the curator reads and thinks. It gets more useful the more interconnected the notes become.

---

## The Philosophy

Knowledge is not a list of facts. It is a web of ideas that illuminate each other across domains. A theorem in mathematics casts light on a problem in computer science. A question in Islamic jurisprudence turns out to hinge on the same logic as a philosophical debate from ancient Greece. History explains why an algorithm was designed the way it was.

Maktaba is built on the belief that a curated, deeply interconnected personal library — made public and made conversational — is more valuable than any generic AI trained on everything and grounded in nothing.

*In the spirit of Bayt al-Hikma.*
