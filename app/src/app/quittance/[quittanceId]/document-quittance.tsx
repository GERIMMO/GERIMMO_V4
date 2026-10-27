"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

// Le document conforme (modèle PDF des quittances) affiché tel quel. Sa
// feuille de style est celle d'un document A4 — `body`, `h1`, `table` — : on
// l'isole dans un cadre pour qu'elle ne déborde pas sur la page, et c'est CE
// cadre qu'on imprime, avec ses règles @page (27/09). Avec ?imprimer=1, la
// feuille d'impression s'ouvre d'elle-même, d'où « Enregistrer en PDF ».
// Depuis le 27/10 (ED-04), « Mes documents » du locataire affiche ce même
// cadre dans sa fenêtre d'aperçu, sans impression automatique.
export function DocumentQuittance({
  html,
  titre,
  imprimerAuChargement,
}: {
  html: string;
  titre: string;
  imprimerAuChargement: boolean;
}) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const dejaImprime = useRef(false);

  const ajuster = useCallback(() => {
    const doc = cadre.current?.contentDocument;
    if (!cadre.current || !doc?.documentElement) return;
    cadre.current.style.height = `${doc.documentElement.scrollHeight + 8}px`;
  }, []);

  const imprimer = useCallback(() => {
    const fenetre = cadre.current?.contentWindow;
    if (fenetre) {
      fenetre.focus();
      fenetre.print();
    } else {
      window.print();
    }
  }, []);

  const auChargement = useCallback(() => {
    ajuster();
    if (imprimerAuChargement && !dejaImprime.current) {
      dejaImprime.current = true;
      imprimer();
    }
  }, [ajuster, imprimer, imprimerAuChargement]);

  // Un cadre déjà chargé avant l'hydratation n'émet plus « load » : on relit.
  useEffect(() => {
    if (cadre.current?.contentDocument?.readyState === "complete") auChargement();
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
  }, [ajuster, auChargement]);

  return (
    <div className="space-y-3">
      <div className="print:hidden">
        <Button type="button" size="sm" variant="outline" onClick={imprimer}>
          Imprimer ou enregistrer en PDF
        </Button>
      </div>
      <iframe
        ref={cadre}
        title={titre}
        srcDoc={html}
        // Aucun script dans le document : le cadre n'en exécute pas. La même
        // origine sert à mesurer sa hauteur ; « modals » à ouvrir l'impression.
        sandbox="allow-same-origin allow-modals"
        onLoad={auChargement}
        className="block min-h-[70vh] w-full rounded-md border border-border bg-white"
      />
    </div>
  );
}
