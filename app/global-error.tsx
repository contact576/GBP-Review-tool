"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F7F6F2", color: "#17201D", fontFamily: "Arial, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 520, textAlign: "center", background: "white", border: "1px solid #E7E5DE", borderRadius: 18, padding: 32 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#0C7A63" }}>FOUNDLY</div>
            <h1 style={{ margin: "16px 0 8px", fontSize: 26 }}>We couldn’t load the application</h1>
            <p style={{ margin: 0, color: "#5C6663", lineHeight: 1.6 }}>Please try again. Your saved workspace data has not been removed.</p>
            {error.digest ? <p style={{ color: "#7A8480", fontSize: 12 }}>Reference: {error.digest}</p> : null}
            <button type="button" onClick={reset} style={{ marginTop: 20, border: 0, borderRadius: 12, background: "#0C7A63", color: "white", minHeight: 44, padding: "0 20px", fontWeight: 700 }}>Try again</button>
          </div>
        </main>
      </body>
    </html>
  );
}
