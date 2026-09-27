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
import { CSS_POLICES } from "@/lib/documents/polices";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import {
  assemblerQuittanceDelivree,
  chargerQuittanceDocument,
  manquantsQuittance,
} from "@/lib/quittance-conforme";
import { DocumentQuittance } from "./document-quittance";

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

// Sur un écran de téléphone, les marges d'une feuille A4 (56 pt) et le titre
// espacé à 23 pt ne tiennent pas : on les resserre À L'ÉCRAN seulement —
// l'impression garde la mise en page du modèle.
const CSS_ECRAN = `<style>@media screen and (max-width: 640px){
  body{padding:20px 16px 0;font-size:10pt}
  h1{font-size:15pt;letter-spacing:.16em}
  .sous-titre{font-size:9pt;letter-spacing:.12em}
  .entete{flex-direction:column;align-items:flex-start;gap:8px}
  .cartouche-ref{text-align:left}
  .cartouches{grid-template-columns:1fr}
  .sig-emetteur{margin-left:0}
}</style>`;

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

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-8" style={styleMarque(marque)}>
      {/* L'en-tête de marque, toujours (25/09, D11). */}
      <div className="max-w-[180px] print:hidden">
        <MarqueOrganisation marque={marque} />
      </div>
      {/* Route racine, hors de tout espace : sans cela, le document est un
          cul-de-sac. Masqué à l'impression. */}
      <div className="print:hidden">
        <BoutonRetour
          libelle={q.vue_gestionnaire ? "Retour" : "Retour à mes paiements"}
          className="btn-secondaire"
        />
      </div>

      {manquants.length === 0 ? (
        <>
          {/* Le titre de la page, hors du cadre : le document garde le sien,
              mais la page doit en porter un (lecteurs d'écran, audit). */}
          <h1 className="text-lg print:hidden">
            {nature} — <span className="capitalize">{mois}</span>
          </h1>
          <DocumentQuittance
            html={document.html
              .replace(CSS_POLICES, "")
              .replace("</head>", `${CSS_ECRAN}</head>`)}
            titre={`${nature} — ${mois}`}
            imprimerAuChargement={imprimer === "1"}
          />
        </>
      ) : (
        <section className="space-y-3 rounded-md border border-border p-4 text-sm">
          <h1 className="text-lg">
            {nature} — <span className="capitalize">{mois}</span>
          </h1>
          <p>
            Paiement enregistré&nbsp;: <span className="montant">{eur(Number(q.montant))}</span>.
          </p>
          {q.vue_gestionnaire ? (
            <>
              <p className="text-muted-foreground">
                Ce document ne peut pas encore être délivré au locataire&nbsp;: une
                quittance doit porter l&apos;identité et l&apos;adresse de son émetteur,
                et chaque information obligatoire du modèle. Il manque&nbsp;:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {manquants.map((m) => {
                  const lien = lienPourManquant(m, q.organization_id, [{ entite: "bail", entiteId: q.bail_id }], "quittance");
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
            </>
          ) : (
            <p className="text-muted-foreground">
              Votre {q.est_quittance ? "quittance" : "reçu"} n&apos;est pas encore
              disponible&nbsp;: votre gestionnaire doit d&apos;abord compléter les
              informations obligatoires du document (son identité, son adresse…).
              Vous pouvez le lui demander depuis votre espace, rubrique «&nbsp;Mon
              gestionnaire&nbsp;».
            </p>
          )}
        </section>
      )}
    </main>
  );
}
