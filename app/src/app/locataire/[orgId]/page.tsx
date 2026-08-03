import Link from "next/link";
import { formaterDate } from "@/lib/ged";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireAttestation } from "./formulaire-attestation";

export const metadata = { title: "Mon espace — Gerimmo" };

type Piece = {
  document_id: string;
  type: string;
  titre: string | null;
  expire_le: string | null;
};

function statutAssurance(expire: string | null): { texte: string; classe: string } {
  if (!expire) return { texte: "sans date d'expiration", classe: "text-muted-foreground" };
  const jours = Math.ceil(
    (new Date(expire).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (jours < 0) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (jours <= 30)
    return { texte: `expire dans ${jours} j (${expire})`, classe: "text-warning-soft-foreground" };
  return { texte: `valide jusqu'au ${expire}`, classe: "text-success-soft-foreground" };
}

export default async function PageLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const { data: pieces } = await supabase.rpc("mon_dossier_locataire", { p_org: orgId });
  const assurance = ((pieces ?? []) as Piece[]).find((p) => p.type === "attestation_assurance");

  const { data: baux } = await supabase.rpc("mon_bail_locataire", { p_org: orgId });
  const bail = ((baux ?? []) as {
    type: string;
    etat: string;
    loyer_hc: number | null;
    charges: number | null;
    lot_nom: string;
    date_debut: string | null;
  }[])[0];
  const TYPES_BAIL: Record<string, string> = { nu: "nu", meuble: "meublé", colocation: "colocation" };

  const { data: depotRows } = await supabase.rpc("mon_depot_locataire", { p_org: orgId });
  const depot = ((depotRows ?? []) as {
    depot_du: number;
    encaisse: number;
    derniere_date: string | null;
  }[])[0];

  const { data: echeancier } = await supabase.rpc("mon_echeancier_locataire", { p_org: orgId });
  const lignesLoyer = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const LOYER_STATUT: Record<string, string> = {
    paye: "Payé",
    partiel: "Partiel",
    impaye: "Impayé",
    attendu: "À échoir",
  };
  const eur = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €`;
  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <main className="mx-auto w-full max-w-2xl space-y-[1.125rem] p-7">
      <div>
        <h1 className="text-2xl font-semibold">
          Bonjour{personne?.prenom ? ` ${personne.prenom}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          Votre espace locataire — déposez et suivez votre attestation d&apos;assurance.
        </p>
      </div>

      {bail && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mon bail</CardTitle>
            <CardDescription>
              {bail.lot_nom} · bail {TYPES_BAIL[bail.type] ?? bail.type}
              {bail.etat === "preavis" ? " · en préavis" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p>
              Loyer : {bail.loyer_hc ? `${bail.loyer_hc} € hors charges` : "—"}
              {bail.charges ? ` + ${bail.charges} € de charges` : ""}
            </p>
            {bail.date_debut && <p className="text-muted-foreground">Depuis le {formaterDate(bail.date_debut)}</p>}
            {depot && Number(depot.depot_du) > 0 && (
              <p className="mt-1 text-muted-foreground">
                Dépôt de garantie : {eur(Number(depot.encaisse))} encaissé
                {Number(depot.encaisse) < Number(depot.depot_du)
                  ? ` sur ${eur(Number(depot.depot_du))}`
                  : ""}
                {depot.derniere_date ? ` (le ${formaterDate(depot.derniere_date)})` : ""}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {lignesLoyer.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mes loyers</CardTitle>
            <CardDescription>Échéancier et quittances de votre location.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {lignesLoyer.map((l) => (
                <li key={l.periode} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-32 shrink-0 capitalize">{moisLong(l.periode)}</span>
                  <span className="w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    {l.statut === "partiel" ? `réglé ${eur(l.montant_couvert)}` : ""}
                  </span>
                  <span className="shrink-0 badge-statut text-muted-foreground">
                    {LOYER_STATUT[l.statut] ?? l.statut}
                  </span>
                  {l.quittance_id && (
                    <Link
                      href={`/quittance/${l.quittance_id}`}
                      target="_blank"
                      className="shrink-0 text-xs text-success-soft-foreground underline-offset-2 hover:underline"
                    >
                      Voir la quittance
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attestation d&apos;assurance habitation</CardTitle>
          <CardDescription>
            Obligation annuelle. Déposez la nouvelle attestation avant l&apos;échéance —
            votre agence est notifiée à chaque dépôt.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {assurance ? (
            <div
              className={`rounded-lg border p-3 text-sm ${
                statutAssurance(assurance.expire_le).classe.includes("destructive")
                  ? "border-destructive-soft bg-destructive-soft/40"
                  : "border-border"
              }`}
            >
              <p className="font-medium">{assurance.titre || "Attestation déposée"}</p>
              <p className={statutAssurance(assurance.expire_le).classe}>
                {statutAssurance(assurance.expire_le).texte}
              </p>
            </div>
          ) : (
            // Obligation annuelle non tenue : le dire franchement, pas en gris
            <div className="rounded-lg border border-destructive-soft bg-destructive-soft/40 p-3">
              <p className="text-sm font-medium text-destructive-soft-foreground">
                Aucune attestation déposée
              </p>
              <p className="mt-0.5 text-sm text-destructive-soft-foreground">
                L&apos;assurance habitation est obligatoire pendant toute la durée du
                bail. Déposez votre attestation ci-dessous.
              </p>
            </div>
          )}
          <FormulaireAttestation orgId={orgId} renouvellement={Boolean(assurance)} />
        </CardContent>
      </Card>
    </main>
  );
}
