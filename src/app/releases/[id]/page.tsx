import Link from "next/link";
import { AskArticleBox } from "@/components/ask-article-box";
import { notFound } from "next/navigation";
import { BookmarkButton } from "@/components/bookmark-button";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { NOT_AVAILABLE } from "@/lib/constants";
import { releaseInclude } from "@/lib/releases";

export default async function ReleasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const release = await db.release.findUnique({ where: { id }, include: releaseInclude });
  if (!release) notFound();

  return (
    <main className="shell article-page">
      <Link className="back-link" href="/">← Back to dashboard</Link>
      <article className="note">
        <div className="note-meta">
          <span>{release.ministry?.name || NOT_AVAILABLE}</span>
          <span>•</span>
          <time>{formatDate(release.publishedDate)}</time>
          <BookmarkButton releaseId={release.id} />
        </div>
        <h1>{release.title}</h1>
        <div className="score-banner">
          <strong>{release.upscRelevanceScore ?? 1}/10</strong>
          <span>UPSC relevance</span>
        </div>
        <div className="chip-row">
          {release.prelimsRelevance ? <span className="chip exam">Prelims</span> : null}
          {release.mainsRelevance ? <span className="chip exam">Mains</span> : null}
          {release.gsPaperMapping.map((paper) => <span className="chip" key={paper}>{paper}</span>)}
          {release.tags.map(({ tag }) => <span className="chip topic" key={tag.id}>{tag.name}</span>)}
        </div>

        <section>
          <p className="section-label">Source-grounded summary</p>
          <p className="lead">{release.summary || NOT_AVAILABLE}</p>
        </section>
        <section>
          <p className="section-label">Why this is important for UPSC</p>
          <ul className="importance-list">
            {(release.whyImportant.length ? release.whyImportant : [NOT_AVAILABLE]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="mapping-grid">
          <div><span>Prelims</span><strong>{release.prelimsRelevance ? "Relevant" : "No clear mapping"}</strong></div>
          <div><span>Mains</span><strong>{release.mainsRelevance ? "Relevant" : "No clear mapping"}</strong></div>
          <div><span>Essay</span><strong>{release.essayRelevance ? "Relevant" : "No clear mapping"}</strong></div>
          <div><span>Optional</span><strong>{release.optionalRelevance || NOT_AVAILABLE}</strong></div>
        </section>
        <AskArticleBox releaseId={release.id} />
        <aside className="source-box">
          <div>
            <span>Primary evidence</span>
            <strong>Press Information Bureau, Government of India</strong>
          </div>
          <div className="source-actions">
            <a className="button dark" href={release.sourceUrl} target="_blank" rel="noreferrer">Open official source ↗</a>
            {release.primaryPdfUrl ? (
              <a className="button subtle" href={release.primaryPdfUrl} target="_blank" rel="noreferrer">Open official PDF ↗</a>
            ) : <span className="unavailable">PDF: {NOT_AVAILABLE}</span>}
          </div>
        </aside>
      </article>
    </main>
  );
}
