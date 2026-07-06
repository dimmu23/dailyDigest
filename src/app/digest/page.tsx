import { EmptyState } from "@/components/empty-state";
import { ReleaseCard } from "@/components/release-card";
import { dailyDigest } from "@/lib/releases";
import { todayInIndia } from "@/lib/format";

type SearchParams = Promise<{ date?: string | string[] }>;

export default async function DigestPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const requested = Array.isArray(raw.date) ? raw.date[0] : raw.date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested || "") ? requested! : todayInIndia();
  let items: Awaited<ReturnType<typeof dailyDigest>> = [];
  let unavailable = false;
  try {
    items = await dailyDigest(date);
  } catch (error) {
    unavailable = true;
    console.error("Digest data unavailable", error);
  }

  return (
    <main className="shell page">
      <div className="page-heading">
        <div>
          <p className="kicker">The day, ranked</p>
          <h1>Daily PIB digest</h1>
          <p>Highest-value official updates first, with the source always one click away.</p>
        </div>
        <form className="date-picker">
          <label><span>Digest date</span><input type="date" name="date" defaultValue={date} /></label>
          <button className="button dark">View</button>
        </form>
      </div>
      {items.length ? (
        <div className="digest-list">
          {items.map((release, index) => (
            <ReleaseCard key={release.id} release={release} rank={index + 1} />
          ))}
        </div>
      ) : <EmptyState databaseUnavailable={unavailable} />}
    </main>
  );
}

