import { DashboardFilters } from "@/components/dashboard-filters";
import { EmptyState } from "@/components/empty-state";
import { RefreshButton } from "@/components/refresh-button";
import { ReleaseCard } from "@/components/release-card";
import { formatDate } from "@/lib/format";
import { dashboardOptions, listReleases, releaseQuerySchema } from "@/lib/releases";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const values = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  ) as Record<string, string | undefined>;
  const query = releaseQuerySchema.safeParse(values);
  const normalized = query.success ? query.data : releaseQuerySchema.parse({});

  let unavailable = false;
  let result: Awaited<ReturnType<typeof listReleases>> = {
    items: [], total: 0, page: 1, limit: 20, pages: 0
  };
  let options: Awaited<ReturnType<typeof dashboardOptions>> = {
    ministries: [], tags: [], latestSync: null
  };
  try {
    [result, options] = await Promise.all([listReleases(normalized), dashboardOptions()]);
  } catch (error) {
    unavailable = true;
    console.error("Dashboard data unavailable", error);
  }

  return (
    <main>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <p className="kicker">Signal from the official source</p>
            <h1>PIB, distilled for the UPSC syllabus.</h1>
            <p className="hero-copy">
              Search the latest government releases, see what matters, and keep every note tied
              to its official source.
            </p>
          </div>
          <div className="sync-panel">
            <span>Last successful sync</span>
            <strong>{formatDate(options.latestSync?.completedAt, true)}</strong>
            <small>Automatic sync runs every 30 minutes.</small>
            <RefreshButton />
          </div>
        </div>
      </section>

      <div className="shell dashboard">
        <DashboardFilters ministries={options.ministries} tags={options.tags} values={values} />
        <div className="results-heading">
          <div>
            <p className="kicker">Current affairs feed</p>
            <h2>{result.total} exam-relevant {result.total === 1 ? "release" : "releases"}</h2>
          </div>
          <span>Page {result.page} of {Math.max(1, result.pages)}</span>
        </div>
        {result.items.length ? (
          <div className="release-grid">
            {result.items.map((release) => <ReleaseCard key={release.id} release={release} />)}
          </div>
        ) : <EmptyState databaseUnavailable={unavailable} />}
        {result.pages > 1 ? (
          <nav className="pagination" aria-label="Pagination">
            {result.page > 1 ? <a href={`?${new URLSearchParams({ ...values as Record<string, string>, page: String(result.page - 1) })}`}>← Newer</a> : <span />}
            {result.page < result.pages ? <a href={`?${new URLSearchParams({ ...values as Record<string, string>, page: String(result.page + 1) })}`}>Older →</a> : null}
          </nav>
        ) : null}
      </div>
    </main>
  );
}

