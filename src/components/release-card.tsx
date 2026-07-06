import Link from "next/link";
import type { ReleaseWithRelations } from "@/lib/releases";
import { BookmarkButton } from "@/components/bookmark-button";
import { formatDate } from "@/lib/format";
import { NOT_AVAILABLE } from "@/lib/constants";

export function ReleaseCard({ release, rank }: { release: ReleaseWithRelations; rank?: number }) {
  const score = release.upscRelevanceScore ?? 1;
  return (
    <article className="release-card">
      <div className="card-topline">
        <div className="eyebrow">
          {rank ? <span className="rank">#{rank}</span> : null}
          <span>{release.ministry?.name || NOT_AVAILABLE}</span>
          <span>•</span>
          <time>{formatDate(release.publishedDate)}</time>
        </div>
        <BookmarkButton releaseId={release.id} />
      </div>
      <div className="card-heading">
        <Link href={`/releases/${release.id}`}><h2>{release.title}</h2></Link>
        <div className={`score score-${Math.min(10, Math.max(1, score))}`} aria-label={`UPSC relevance ${score} out of 10`}>
          <strong>{score}</strong><span>/10</span>
        </div>
      </div>
      <p className="summary">{release.summary || NOT_AVAILABLE}</p>
      <div className="chip-row">
        {release.prelimsRelevance ? <span className="chip exam">Prelims</span> : null}
        {release.mainsRelevance ? <span className="chip exam">Mains</span> : null}
        {release.gsPaperMapping.map((paper) => <span className="chip" key={paper}>{paper}</span>)}
        {release.tags.map(({ tag }) => <span className="chip topic" key={tag.id}>{tag.name}</span>)}
      </div>
      <div className="card-links">
        <Link className="text-link" href={`/releases/${release.id}`}>Read UPSC note →</Link>
        <a href={release.sourceUrl} target="_blank" rel="noreferrer">Official PIB source ↗</a>
        {release.primaryPdfUrl ? (
          <a href={release.primaryPdfUrl} target="_blank" rel="noreferrer">Official PDF ↗</a>
        ) : null}
      </div>
    </article>
  );
}

