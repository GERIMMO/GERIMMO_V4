"use client";

import { useEffect } from "react";
import { signalerErreurEcran } from "@/app/actions/erreurs";

// Quand c'est le gabarit racine lui-même qui tombe, plus rien de l'application
// ne s'affiche — ni feuille de style, ni police. Cette page se suffit donc à
// elle-même : du texte, un bouton, et la même trace que error.tsx.
export default function ErreurGlobale({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void signalerErreurEcran({
      digest: error.digest,
      chemin: typeof window === "undefined" ? "/" : window.location.pathname,
    });
  }, [error.digest]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          padding: "48px 24px",
          fontFamily: "system-ui, sans-serif",
          color: "#151b2b",
          background: "#f6f7fb",
        }}
      >
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Gerimmo n&apos;a pas pu s&apos;ouvrir</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            L&apos;incident est noté. Réessayez dans un instant ; si cela persiste,
            écrivez-nous en indiquant la référence ci-dessous.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2457f5",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: "#5b6478" }}>réf. {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
