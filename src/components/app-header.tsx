import Link from "next/link";

export function AppHeader() {
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span>
            <strong>PIB UPSC Brief</strong>
            <small>Official updates, exam-ready</small>
          </span>
        </Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Dashboard</Link>
          <Link href="/digest">Daily digest</Link>
        </nav>
      </div>
    </header>
  );
}

