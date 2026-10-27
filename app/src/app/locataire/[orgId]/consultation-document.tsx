"use client";
import { useEffect, useState, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";
import { DocumentQuittance } from "@/app/quittance/[quittanceId]/document-quittance";

// LE SEUL GESTE DE CONSULTATION DE L'ESPACE LOCATAIRE (décision du 27/10,
// audit #264 ED-04) : une pièce s'ouvrait en fenêtre depuis « Aperçu », une
// quittance dans un nouvel onglet depuis son titre, le bail en fenêtre depuis
// Documents mais dans un nouvel onglet depuis l'accueil et « Mon logement ».
// Désormais le titre (ou le bouton) ouvre l'aperçu en fenêtre, le même que chez
// le propriétaire, et le téléchargement se fait dedans. Les routes « fichier »
// et leurs contrôles d'accès sont inchangés : le lecteur les appelle.
type Cible =
  /** Une pièce du dossier ou le bail signé : la route fichier de l'espace. */
  | { fichier: string; mime: string | null }
  /** Une quittance n'a pas de fichier : son document conforme se compose à la lecture. */
  | { quittance: string };

export function ConsultationDocument({ titre, cible, className, children }: {
  titre: string;
  cible: Cible;
  className?: string;
  children?: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  return <>
    <button type="button" aria-haspopup="dialog" onClick={() => setOuvert(true)} className={className}>{children ?? titre}</button>
    {ouvert && <Modale titre={titre} tresLarge fermer={() => setOuvert(false)}>
      {"fichier" in cible
        ? <LecteurDocument fichier={cible.fichier} titre={titre} mime={cible.mime} presentation="fiche" />
        : <ApercuQuittance quittanceId={cible.quittance} titre={titre} />}
    </Modale>}
  </>;
}

type EtatQuittance = { type: "chargement" } | { type: "erreur"; message: string } | { type: "pret"; html: string };

/** Le document de la quittance, lu sous la session du locataire, affiché comme
 * sur sa page : dans un cadre isolé, avec « Imprimer ou enregistrer en PDF ». */
function ApercuQuittance({ quittanceId, titre }: { quittanceId: string; titre: string }) {
  const [etat, setEtat] = useState<EtatQuittance>({ type: "chargement" });
  const [essai, setEssai] = useState(0);
  useEffect(() => {
    const controle = new AbortController();
    async function charger() {
      try {
        const reponse = await fetch(`/quittance/${encodeURIComponent(quittanceId)}/document`, {
          signal: controle.signal, credentials: "same-origin", cache: "no-store",
        });
        const corps: { html?: unknown; erreur?: unknown } = await reponse.json().catch(() => ({}));
        if (!reponse.ok) throw new Error(typeof corps.erreur === "string" ? corps.erreur : "Le document est indisponible. Réessayez.");
        if (typeof corps.html !== "string") throw new Error("Le document est indisponible. Réessayez.");
        setEtat({ type: "pret", html: corps.html });
      } catch (erreur) {
        if (!controle.signal.aborted) setEtat({ type: "erreur", message: erreur instanceof Error ? erreur.message : "Le document est indisponible. Réessayez." });
      }
    }
    void charger();
    return () => controle.abort();
  }, [quittanceId, essai]);

  if (etat.type === "chargement") return <p className="text-sm text-muted-foreground" role="status">Chargement du document…</p>;
  if (etat.type === "erreur") return <div className="space-y-3">
    <p className="text-sm" role="alert">{etat.message}</p>
    <Button type="button" size="sm" variant="outline" onClick={() => { setEtat({ type: "chargement" }); setEssai(e => e + 1); }}><RotateCw size={16} aria-hidden="true" />Réessayer</Button>
  </div>;
  return <DocumentQuittance html={etat.html} titre={titre} imprimerAuChargement={false} />;
}
