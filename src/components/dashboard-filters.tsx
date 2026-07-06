import type { Ministry, Tag } from "@prisma/client";
import Link from "next/link";

type Props = {
  ministries: Ministry[];
  tags: Tag[];
  values: Record<string, string | undefined>;
};

export function DashboardFilters({ ministries, tags, values }: Props) {
  return (
    <form className="filters" method="get">
      <label className="search-field">
        <span>Search</span>
        <input name="q" defaultValue={values.q} placeholder="Scheme, report, ministry…" />
      </label>
      <label>
        <span>From</span>
        <input type="date" name="from" defaultValue={values.from} />
      </label>
      <label>
        <span>To</span>
        <input type="date" name="to" defaultValue={values.to} />
      </label>
      <label>
        <span>Ministry</span>
        <select name="ministry" defaultValue={values.ministry || ""}>
          <option value="">All ministries</option>
          {ministries.map((ministry) => (
            <option key={ministry.id} value={ministry.slug}>{ministry.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Topic</span>
        <select name="tag" defaultValue={values.tag || ""}>
          <option value="">All topics</option>
          {tags.map((tag) => <option key={tag.id} value={tag.slug}>{tag.name}</option>)}
        </select>
      </label>
      <label>
        <span>GS paper</span>
        <select name="gs" defaultValue={values.gs || ""}>
          <option value="">All papers</option>
          <option value="GS1">GS Paper 1</option>
          <option value="GS2">GS Paper 2</option>
          <option value="GS3">GS Paper 3</option>
          <option value="GS4">GS Paper 4</option>
          <option value="ESSAY">Essay</option>
        </select>
      </label>
      <label>
        <span>Minimum score</span>
        <select name="minScore" defaultValue={values.minScore || ""}>
          <option value="">Any score</option>
          {[9, 8, 7, 6, 5].map((score) => (
            <option key={score} value={score}>{score}+</option>
          ))}
        </select>
      </label>
      <div className="filter-actions">
        <button className="button dark" type="submit">Apply filters</button>
        <Link className="text-link" href="/">Clear</Link>
      </div>
    </form>
  );
}
