import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { eur, formaterDate } from "@/lib/ged";

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

// Le titre de l'onglet suit la nature du document : un reçu partiel n'est pas
// une quittance (audit 09/09).
export async function generateMetadata(props: {
  params: Promise<{ quittanceId: string }>;
}): Promise<Metadata> {
  const { quittanceId } = await props.params;
  const q = await chargerQuittance(quittanceId);
  return { title: q && !q.est_quittance ? "Reçu — Gerimmo" : "Quittance — Gerimmo" };
}

export default async function PageQuittance(props: { params: Promise<{ quittanceId: string }> }) {
  const { quittanceId } = await props.params;
  const q = await chargerQuittance(quittanceId);
  if (!q) notFound();

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
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <h1>{titre}</h1>
          <p className="text-sm text-muted-foreground capitalize">{mois}</p>
        </div>
        <p className="text-sm text-muted-foreground">Émis le {formaterDate(q.date_emission)}</p>
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

      <p className="text-xs text-muted-foreground print:hidden">
        Document généré par Gerimmo — utilisez la fonction d&apos;impression de votre
        navigateur pour l&apos;imprimer ou l&apos;enregistrer en PDF.
      </p>
    </main>
  );
}
