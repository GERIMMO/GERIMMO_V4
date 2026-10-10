"use client";

import { CHARTE_GERIMMO } from "@/lib/charte-gerimmo";
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
          color: CHARTE_GERIMMO.corps,
          background: CHARTE_GERIMMO.creme,
        }}
      >
        <main style={{ maxWidth: 560, margin: "0 auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- secours sans le layout ni le service d’optimisation */}
          <img src={CHARTE_GERIMMO.logo} alt="Gerimmo — L’immobilier en confiance" width={120} height={95} style={{ display: "block", marginBottom: 24 }} />
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 400, fontSize: 30, margin: "0 0 12px" }}>Gerimmo n&apos;a pas pu s&apos;ouvrir</h1>
          <p style={{ margin: "0 0 20px", lineHeight: 1.5 }}>
            L&apos;incident est noté. Réessayez dans un instant ; si cela persiste,
            écrivez-nous en indiquant la référence ci-dessous.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: CHARTE_GERIMMO.marque,
              color: "#fff",
              border: 0,
              borderRadius: 7,
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
          {error.digest && (
            <p style={{ marginTop: 16, fontSize: 12, color: CHARTE_GERIMMO.texteSecondaire }}>réf. {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
