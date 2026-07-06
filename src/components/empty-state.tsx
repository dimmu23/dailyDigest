export function EmptyState({ databaseUnavailable = false }: { databaseUnavailable?: boolean }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">◎</span>
      <h2>{databaseUnavailable ? "Connect the database to begin" : "No matching PIB notes yet"}</h2>
      <p>
        {databaseUnavailable
          ? "Add DATABASE_URL, run the Prisma migration, then refresh from PIB."
          : "Try broader filters or refresh the official PIB feed."}
      </p>
    </div>
  );
}

