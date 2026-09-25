import { MarqueOrganisation } from "@/components/marque-organisation";
import { nomMarque, styleMarque, type MarqueOrganisation as Marque } from "@/lib/marque-organisation";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { BoutonRetour } from "@/components/bouton-retour";
import { eur, formaterDate } from "@/lib/ged";
import { ImpressionAutomatique } from "./impression-automatique";

type DetailQuittance = {
  emetteur: string;
  proprietaire: string | null;
  locataire: string;
  adresse: string;
  lot_nom: string;
  periode: string;
  loyer_hc: number;
  charges: number;
  montant_du: number;
  prorata: boolean;
  montant: number;
  est_quittance: boolean;
  date_emission: string;
};

// Un seul appel base pour la page et son titre (React déduplique via cache).
const chargerQuittance = cache(async (quittanceId: string): Promise<DetailQuittance | null> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("quittance_detail", { p_quittance: quittanceId });
  return ((data ?? []) as DetailQuittance[])[0] ?? null;
});

// La marque de l'organisation qui émet le document, lue une fois pour la page
// et son titre. Sans marque lisible, le nom de l'émetteur du document sert de
// marque : le locataire ne lit jamais « Gerimmo » (25/09, D04).
const chargerMarqueQuittance = cache(async (quittanceId: string): Promise<Marque | null> => {
  const db = await createClient();
  const { data: origine } = await db.from("quittances").select("organization_id").eq("id", quittanceId).maybeSingle();
  return origine?.organization_id ? chargerMarque(db, origine.organization_id) : null;
});

// Le titre de l'onglet suit la nature du document : un reçu partiel n'est pas
// une quittance (audit 09/09) — et il porte le nom de l'émetteur, pas Gerimmo.
export async function generateMetadata(props: {
  params: Promise<{ quittanceId: string }>;
}): Promise<Metadata> {
  const { quittanceId } = await props.params;
  const [q, marque] = await Promise.all([chargerQuittance(quittanceId), chargerMarqueQuittance(quittanceId)]);
  const nature = q && !q.est_quittance ? "Reçu" : "Quittance";
  const emetteur = marque ? nomMarque(marque) : q?.emetteur;
  return { title: emetteur ? `${nature} — ${emetteur}` : nature };
}

export default async function PageQuittance(props: {
  params: Promise<{ quittanceId: string }>;
  searchParams: Promise<{ imprimer?: string | string[] }>;
}) {
  const { quittanceId } = await props.params;
  const q = await chargerQuittance(quittanceId);
  if (!q) notFound();
  // « Télécharger » (Mes documents, espace locataire) arrive avec ?imprimer=1 :
  // la feuille d'impression s'ouvre d'elle-même, d'où « Enregistrer en PDF ».
  // Le reste de la page est identique — l'URL nue reste la lecture à l'écran (24/09).
  const { imprimer } = await props.searchParams;
  const imprimerAuChargement = imprimer === "1";
  const marque = (await chargerMarqueQuittance(quittanceId)) ?? { name: q.emetteur };

  const mois = new Date(q.periode).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const titre = q.est_quittance ? "Quittance de loyer" : "Reçu de paiement partiel";
  // Le solde se calcule sur le TERME RÉELLEMENT DÛ, jamais sur loyer + charges :
  // les deux diffèrent dès qu'un mois est proratisé (entrée ou sortie en cours
  // de mois) ou porte une régularisation. La version PDF le faisait déjà juste ;
  // cette page annonçait un solde trop élevé dans ces cas — un reçu qui
  // surestime la dette est un reçu faux (RM-3.4.2). Corrigé le 2026-09-11.
  const solde = Math.round((Number(q.montant_du) - Number(q.montant)) * 100) / 100;

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8" style={styleMarque(marque)}>
      {imprimerAuChargement && <ImpressionAutomatique />}
      {/* L'en-tête de marque, toujours (25/09, D11) : sans logo lisible, le
          nom de l'émetteur — jamais une page nue. */}
      <div className="max-w-[180px]"><MarqueOrganisation marque={marque} /></div>
      {/* Route racine, hors de tout espace : sans cela, le document est un
          cul-de-sac. Masqué à l'impression — une quittation papier n'a pas de
          bouton « Retour ». Un vrai bouton (D11) : le seul chemin de sortie
          était un lien de 12 px. */}
      <div className="print:hidden">
        <BoutonRetour libelle="Retour à mes paiements" className="btn-secondaire" />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h1>{titre}</h1>
          <p className="text-sm text-muted-foreground capitalize">{mois}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Émis le {formaterDate(q.date_emission)}</p>
          {/* Le geste de GARDER le document était laissé au lecteur (« utilisez
              la fonction d'impression de votre navigateur »), alors que le
              composant existait déjà ailleurs dans le produit. Sur téléphone,
              cette phrase ne veut à peu près rien dire : la feuille
              d'impression d'iOS et d'Android est justement celle qui offre
              « Enregistrer en PDF ». Un bouton, donc, et non une consigne. */}
          <BoutonImprimer libelle="Imprimer ou enregistrer" />
        </div>
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="font-medium">Bailleur</p>
          <p className="text-muted-foreground">{q.proprietaire ?? "—"}</p>
          <p className="text-muted-foreground">représenté par {q.emetteur}</p>
        </div>
        <div>
          <p className="font-medium">Locataire</p>
          <p className="text-muted-foreground">{q.locataire}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="font-medium">Logement</p>
          <p className="text-muted-foreground">
            {q.lot_nom} — {q.adresse}
          </p>
        </div>
      </div>

      <table className="w-full text-sm">
        <tbody>
          <tr className="border-b border-border">
            <td className="py-2">Loyer hors charges</td>
            <td className="py-2 text-right montant">{eur(q.loyer_hc)}</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2">Provision pour charges</td>
            <td className="py-2 text-right montant">{eur(q.charges)}</td>
          </tr>
          {/* Le terme dû : montré dès qu'il n'est pas la simple somme
              ci-dessus, sinon le lecteur ne peut pas vérifier le solde. */}
          {Math.abs(Number(q.montant_du) - (Number(q.loyer_hc) + Number(q.charges))) >= 0.01 && (
            <tr className="border-t border-border">
              <td className="py-2">
                Total du terme
                {q.prorata && (
                  <span className="text-muted-foreground"> (au prorata)</span>
                )}
              </td>
              <td className="py-2 text-right montant">{eur(q.montant_du)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td className="py-2">Total {q.est_quittance ? "acquitté" : "reçu"}</td>
            <td className="py-2 text-right montant">{eur(q.montant)}</td>
          </tr>
          {!q.est_quittance && (
            <tr className="border-t border-border">
              <td className="py-2">Solde restant dû</td>
              <td className="py-2 text-right montant">{eur(solde)}</td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="text-sm text-muted-foreground">
        {q.est_quittance
          ? `Le bailleur reconnaît avoir reçu du locataire la somme ci-dessus au titre du loyer et des charges de ${mois}, et lui en donne quittance.`
          : `Ce reçu constate un paiement partiel de ${mois}. Il ne vaut pas quittance : un solde de ${eur(solde)} reste dû.`}
      </p>

      {/* Plus de « Document généré par Gerimmo » (25/09, D04) sur un document
          à la marque de l'agence : le locataire ne lit jamais ce nom. */}
      <p className="text-xs text-muted-foreground print:hidden">
        « Imprimer ou enregistrer » ouvre la feuille d&apos;impression de votre appareil,
        d&apos;où vous pouvez l&apos;enregistrer en PDF.
      </p>
    </main>
  );
}
