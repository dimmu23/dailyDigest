import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "PIB UPSC Brief",
  description: "Official PIB updates converted into source-grounded UPSC notes."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppHeader />
        {children}
        <footer className="site-footer">
          <div className="shell">
            Notes are generated only from linked official PIB content. Always verify the source.
          </div>
        </footer>
      </body>
    </html>
  );
}

