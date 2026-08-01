import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";

export const metadata = { title: "Quittance — Gerimmo" };

const eur = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;

export default async function PageQuittance(props: { params: Promise<{ quittanceId: string }> }) {
  const { quittanceId } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("quittance_detail", { p_quittance: quittanceId });
  const q = ((data ?? []) as {
    emetteur: string;
    proprietaire: string | null;
    locataire: string;
    adresse: string;
    lot_nom: string;
    periode: string;
    loyer_hc: number;
    charges: number;
    montant: number;
    est_quittance: boolean;
    date_emission: string;
  }[])[0];
  if (!q) notFound();

  const mois = new Date(q.periode).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const titre = q.est_quittance ? "Quittance de loyer" : "Reçu de paiement partiel";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{titre}</h1>
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
            <td className="py-2 text-right">{eur(q.loyer_hc)}</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2">Provision pour charges</td>
            <td className="py-2 text-right">{eur(q.charges)}</td>
          </tr>
          <tr className="font-semibold">
            <td className="py-2">Total {q.est_quittance ? "acquitté" : "reçu"}</td>
            <td className="py-2 text-right">{eur(q.montant)}</td>
          </tr>
        </tbody>
      </table>

      <p className="text-sm text-muted-foreground">
        {q.est_quittance
          ? `Le bailleur reconnaît avoir reçu du locataire la somme ci-dessus au titre du loyer et des charges de ${mois}, et lui en donne quittance.`
          : `Ce reçu constate un paiement partiel de ${mois}. Il ne vaut pas quittance : le solde reste dû.`}
      </p>

      <p className="text-xs text-muted-foreground">
        Document généré par Gerimmo — utilisez la fonction d&apos;impression de votre
        navigateur pour l&apos;imprimer ou l&apos;enregistrer en PDF.
      </p>
    </main>
  );
}
