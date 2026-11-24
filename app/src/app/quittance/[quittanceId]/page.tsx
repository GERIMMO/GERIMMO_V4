import { MarqueOrganisation } from "@/components/marque-organisation";
import { nomMarque, styleMarque, type MarqueOrganisation as Marque } from "@/lib/marque-organisation";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoutonRetour } from "@/components/bouton-retour";
import { eur } from "@/lib/ged";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import {
  assemblerQuittanceDelivree,
  chargerQuittanceDocument,
  manquantsQuittance,
} from "@/lib/quittance-conforme";
import { DocumentQuittance } from "./document-quittance";
import { htmlQuittancePourEcran } from "./ecran";
import { racineEspace } from "@/lib/racine-espace";
import { interlocuteurLocataire } from "@/lib/interlocuteur-locataire";

// Un seul appel base pour la page et son titre (React déduplique via cache).
// `quittance_document` porte les mêmes contrôles d'accès que l'ancienne
// `quittance_detail` : gérant de l'organisation, ou locataire du bail.
const chargerQuittance = cache(async (quittanceId: string) => {
  const supabase = await createClient();
  return chargerQuittanceDocument(supabase, quittanceId);
});

// La marque de l'organisation qui émet le document. Sans marque lisible, le
// nom de l'émetteur sert de marque : le locataire ne lit jamais « Gerimmo »
// (25/09, D04).
const chargerMarqueQuittance = cache(async (orgId: string): Promise<Marque | null> => {
  const db = await createClient();
  return chargerMarque(db, orgId);
});

// Le titre de l'onglet suit la nature du document : un reçu partiel n'est pas
// une quittance (audit 09/09) — et il porte le nom de l'émetteur, pas Gerimmo.
export async function generateMetadata(props: {
  params: Promise<{ quittanceId: string }>;
}): Promise<Metadata> {
  const { quittanceId } = await props.params;
  const q = await chargerQuittance(quittanceId);
  if (!q) return { title: "Document introuvable" };
  const marque = await chargerMarqueQuittance(q.organization_id);
  const nature = q.est_quittance ? "Quittance" : "Reçu";
  const emetteur = marque ? nomMarque(marque) : q.organisation.nom;
  return { title: `${nature} — ${emetteur}` };
}

export default async function PageQuittance(props: {
  params: Promise<{ quittanceId: string }>;
  searchParams: Promise<{ imprimer?: string | string[] }>;
}) {
  const { quittanceId } = await props.params;
  const q = await chargerQuittance(quittanceId);
  if (!q) notFound();
  const { imprimer } = await props.searchParams;
  const marque = (await chargerMarqueQuittance(q.organization_id)) ?? { name: q.organisation.nom };

  // Le document conforme — celui du PDF (art. 21, émetteur, période, Fait à,
  // signature, règlement) — et la même barrière : un champ obligatoire vide,
  // et le document n'est pas délivré (audit du 27/09).
  const document = assemblerQuittanceDelivree(q);
  const manquants = manquantsQuittance(document);
  const nature = q.est_quittance ? "Quittance de loyer" : "Reçu de paiement partiel";
  const mois = new Date(`${q.periode.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  // Phase 3, lot 61 (E018) : une classe « capitalize » mettait une majuscule au mois au milieu du titre (« Reçu de
  // paiement partiel — Novembre 2026 »), contre l'usage français et contre le nom du même document dans Mes documents.
  const titre = `${nature} — ${mois}`;
  const delivre = manquants.length === 0;
  // Lot 47 : à qui le locataire demande de compléter le document — « gestionnaire » seulement dans un espace d'agence,
  // « bailleur » ailleurs (la règle des documents, `interlocuteurLocataire`). La phrase disait « Votre gestionnaire »
  // dans tous les espaces, le bouton seul suivait le type.
  const interlocuteur = interlocuteurLocataire(q.organisation.type);

  // HABILLAGE D'ÉCRAN (Design System « Maison », 20/11), le même que celui de
  // l'attestation de bon paiement : bandeau à la marque de l'émetteur, retour
  // nommé au-dessus du titre, titre à la taille commune, action principale,
  // puis le document. Rien de tout cela ne s'imprime : le document garde son
  // cadre et sa feuille (modèle du PDF).
  return (
    <>
      {/* L'en-tête de marque, toujours (25/09, D11) — dans le bandeau blanc
          des pages servies hors d'un espace (compte, aide). */}
      <header className="bandeau-appli print:hidden">
        <div className="mx-auto flex w-full max-w-3xl items-center px-4 py-3 sm:px-8">
          <div className="max-w-[180px] min-w-0 overflow-hidden">
            <MarqueOrganisation marque={marque} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-8" style={styleMarque(marque)}>
        <div className={delivre ? "print:hidden" : undefined}>
          {/* Route racine, hors de tout espace : sans retour, le document est
              un cul-de-sac. Le locataire revient à « Mes paiements », d'où
              s'ouvre chaque quittance : le lien dit où il mène, et y mène même
              sans historique (lien reçu par e-mail). Le gestionnaire, lui,
              arrive de plusieurs écrans : il repart d'où il vient.
              Quand la page est ouverte depuis un espace, le bandeau commun
              « Revenir à mon espace… » (ContinuiteEspace) ramène déjà à la
              page d'origine : ce retour-ci s'efface pour ne pas le doubler. */}
          <div className="print:hidden [html[data-depuis-espace]_&]:hidden">
            {q.vue_gestionnaire ? (
              <BoutonRetour libelle="Retour" className="lien-discret inline-flex min-h-11 items-center text-sm" />
            ) : (
              <Link
                href={`/locataire/${q.organization_id}/loyers`}
                className="lien-discret inline-flex min-h-11 items-center text-sm"
              >
                ← Mes paiements
              </Link>
            )}
          </div>
          {/* Le titre de la page, hors du cadre : le document garde le sien,
              mais la page doit en porter un (lecteurs d'écran, audit). Le `!`
              est requis, la taille des h1 étant posée hors couche. */}
          <h1 className="!text-[length:var(--titre-1)]">{titre}</h1>
        </div>

        {delivre ? (
          <DocumentQuittance
            html={htmlQuittancePourEcran(document.html)}
            titre={`${nature} — ${mois}`}
            imprimerAuChargement={imprimer === "1"}
            actionPrincipale
          />
        ) : q.vue_gestionnaire ? (
          <section className="space-y-3 rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--carte)] p-5 text-sm shadow-[var(--ombre-1)]">
            <p>
              Paiement enregistré&nbsp;: <span className="montant">{eur(Number(q.montant))}</span>.
            </p>
            <p className="text-muted-foreground">
              Ce document ne peut pas encore être délivré au locataire&nbsp;: une
              quittance doit porter l&apos;identité et l&apos;adresse de son émetteur,
              et chaque information obligatoire du modèle. Il manque&nbsp;:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {manquants.map((m) => {
                const lien = lienPourManquant(m, q.organization_id, [{ entite: "bail", entiteId: q.bail_id }], "quittance", racineEspace(q.organisation.type === "proprietaire_direct"), document.emetteur);
                return (
                  <li key={m}>
                    {m}
                    {lien && (
                      <>
                        {" "}
                        —{" "}
                        <Link href={lien.href} className="lien-discret">
                          à renseigner dans {lien.ecran}
                        </Link>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="text-muted-foreground">
              Tant qu&apos;il manque une de ces informations, le document n&apos;est pas
              envoyé par e-mail.
            </p>
          </section>
        ) : (
          // État vide du système : ce qu'il n'y a pas encore, pourquoi, et le
          // geste — la rubrique était citée sans lien.
          <div className="vide-guide">
            <p className="titre max-sm:pr-14">
              Votre {q.est_quittance ? "quittance" : "reçu"} n&apos;est pas encore disponible
            </p>
            <p className="explication">
              Paiement enregistré&nbsp;: <span className="montant">{eur(Number(q.montant))}</span>.
              Votre {interlocuteur} doit d&apos;abord compléter les informations
              obligatoires du document (son identité, son adresse…). Vous pouvez
              le lui demander depuis votre espace.
            </p>
            <div className="geste">
              <Link href={`/locataire/${q.organization_id}/contact`} className="btn-or">
                Écrire à mon {interlocuteur}
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
