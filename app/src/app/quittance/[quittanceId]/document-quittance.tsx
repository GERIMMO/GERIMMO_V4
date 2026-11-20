"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Le document conforme (modèle PDF des quittances) affiché tel quel. Sa
// feuille de style est celle d'un document A4 — `body`, `h1`, `table` — : on
// l'isole dans un cadre pour qu'elle ne déborde pas sur la page, et c'est CE
// cadre qu'on imprime, avec ses règles @page (27/09). Avec ?imprimer=1, la
// feuille d'impression s'ouvre d'elle-même, d'où « Enregistrer en PDF ».
// Depuis le 27/10 (ED-04), « Mes documents » du locataire affiche ce même
// cadre dans sa fenêtre d'aperçu, sans impression automatique.
type PropsQuittance = {
  html: string;
  titre: string;
  imprimerAuChargement: boolean;
  /** Sur la page du document, imprimer est L'action de l'écran : bouton
   * principal. Dans la fenêtre d'aperçu de « Mes documents », il reste
   * secondaire, à côté des gestes de la fenêtre. */
  actionPrincipale?: boolean;
};

export function DocumentQuittance(props: PropsQuittance) {
  // Une autre pièce de l’aperçu locataire doit avoir son propre cadre, son
  // état de chargement et son éventuelle impression au premier affichage.
  return <CadreQuittance key={props.html} {...props} />;
}

function CadreQuittance({ html, titre, imprimerAuChargement, actionPrincipale = false }: PropsQuittance) {
  const cadre = useRef<HTMLIFrameElement>(null);
  const dejaImprime = useRef(false);
  const [documentPret, setDocumentPret] = useState(false);

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
    const doc = cadre.current?.contentDocument;
    if (doc?.readyState !== "complete" || !doc.body?.firstElementChild) return;
    ajuster();
    setDocumentPret(true);
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
        <Button
          type="button" size="sm" variant={actionPrincipale ? "default" : "outline"} onClick={imprimer}
          disabled={!documentPret}
          title={!documentPret ? "Le document se prépare pour l’impression." : undefined}
        >
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
        // Le cadre d'écran suit le système (rayon, filet, ombre de repos) ; si la
        // PAGE est imprimée plutôt que le cadre, il garde son contour d'origine.
        className="block min-h-[70vh] w-full rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--carte)] shadow-[var(--ombre-1)] print:rounded-md print:border-border print:bg-white print:shadow-none"
      />
    </div>
  );
}
