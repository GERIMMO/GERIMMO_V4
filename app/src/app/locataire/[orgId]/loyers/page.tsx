import Link from "next/link";
import { eur } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER, TYPES_BAIL } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Loyer & quittances — Gerimmo" };

// Écran « Loyer & quittances » (maquette v3 pLocLoyer) : la prochaine échéance
// détaillée, le régime de charges, et l'historique des quittances — utiles
// pour la CAF ou un futur dossier de location.
export default async function PageLoyersLocataire(
  props: PageProps<"/locataire/[orgId]/loyers">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [{ data: echeancier }, { data: bauxRows }] = await Promise.all([
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
  ]);
  const lignesLoyer = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    montant_couvert: number;
    statut: string;
    quittance_id: string | null;
  }[];
  const bail = ((bauxRows ?? []) as {
    bail_id: string;
    type: string;
    loyer_hc: number | null;
    charges: number | null;
    charges_mode: string | null;
    jour_echeance: number | null;
  }[])[0];

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  // La prochaine échéance : la première ligne encore due (à échoir, partielle
  // ou impayée) — l'échéancier arrive trié du plus ancien au plus récent.
  const prochaine = lignesLoyer.find((l) => l.statut !== "paye");
  const forfait = bail?.charges_mode === "forfait";
  const quittances = lignesLoyer.filter((l) => l.quittance_id);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7">
      <div className="entete-page">
        <h1>Loyer &amp; quittances</h1>
        {bail?.jour_echeance != null && (
          <span className="mono-discret">
            Terme d&apos;avance · le {bail.jour_echeance === 1 ? "1ᵉʳ" : bail.jour_echeance} du mois
          </span>
        )}
      </div>

      <div className="deux-col">
        <div className="space-y-3.5">
          <Card>
            <CardContent className="pt-5">
              <div className="entete-carte">
                <h3 className="text-base font-medium">Prochaine échéance</h3>
                {prochaine && (
                  <span className="puce puce-encre capitalize">{moisLong(prochaine.periode)}</span>
                )}
              </div>
              {prochaine && bail ? (
                <>
                  <div className="ligne-info">
                    <span>Loyer</span>
                    <span>{eur(Number(bail.loyer_hc ?? 0))}</span>
                  </div>
                  <div className="ligne-info">
                    <span>{forfait ? "Forfait de charges" : "Provision de charges"}</span>
                    <span>{eur(Number(bail.charges ?? 0))}</span>
                  </div>
                  <div className="ligne-info font-medium">
                    <span className="!text-foreground">À régler</span>
                    <span>
                      {eur(
                        prochaine.statut === "partiel"
                          ? prochaine.montant_du - prochaine.montant_couvert
                          : prochaine.montant_du
                      )}
                      {prochaine.statut === "partiel" && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          (déjà réglé : {eur(prochaine.montant_couvert)})
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="mt-3.5 text-xs text-muted-foreground">
                    Règlement par virement à votre gestionnaire. Dès l&apos;encaissement,
                    votre quittance est émise et disponible ici — rien à demander. Le
                    premier loyer d&apos;un bail est quittancé au prorata de la date
                    d&apos;entrée.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Rien à régler pour l&apos;instant — votre échéancier apparaîtra ici dès
                  l&apos;activation de votre bail.
                </p>
              )}
            </CardContent>
          </Card>

          {bail && (
            <Card>
              <CardContent className="pt-5">
                <h3 className="mb-2 text-base font-medium">Charges</h3>
                <div className="ligne-info">
                  <span>Régime</span>
                  <span className="text-right">
                    {forfait
                      ? `Forfait (${(TYPES_BAIL[bail.type] ?? bail.type).toLowerCase()})`
                      : "Provision · régularisation annuelle"}
                  </span>
                </div>
                <p className="mt-3.5 text-xs text-muted-foreground">
                  {forfait
                    ? "Le forfait couvre les charges sans régularisation : aucun décompte annuel à attendre."
                    : "Une fois par an, votre gestionnaire compare les provisions versées aux charges réelles : le décompte de régularisation arrive dans Mes documents."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardContent className="pt-5">
            <div className="entete-carte">
              <h3 className="text-base font-medium">Mes quittances</h3>
              <span className="mono-discret">
                {quittances.length} émise{quittances.length > 1 ? "s" : ""}
              </span>
            </div>
            {lignesLoyer.length === 0 ? (
              <p className="vide">
                Aucune échéance pour l&apos;instant — votre échéancier apparaîtra ici dès
                l&apos;activation de votre bail.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {lignesLoyer.map((l) => (
                  <li key={l.periode} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="w-32 shrink-0 capitalize">{moisLong(l.periode)}</span>
                    <span className="w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      {l.statut === "partiel" ? `réglé ${eur(l.montant_couvert)}` : ""}
                    </span>
                    <span
                      className={`shrink-0 ${COULEURS_STATUT_APPEL_LOYER[l.statut] ?? "puce puce-grise"}`}
                    >
                      {STATUTS_APPEL_LOYER[l.statut] ?? l.statut}
                    </span>
                    {l.quittance_id && (
                      <Link
                        href={`/quittance/${l.quittance_id}`}
                        target="_blank"
                        className="shrink-0 text-xs text-[var(--bleu)] underline-offset-2 hover:underline"
                      >
                        Voir la quittance
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3.5 text-xs text-muted-foreground">
              Vos quittances restent disponibles ici pendant toute la durée du bail —
              utiles pour la CAF ou un futur dossier de location.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
