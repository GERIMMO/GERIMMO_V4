import Link from "next/link";
import { eur } from "@/lib/ged";
import { COULEURS_STATUT_APPEL_LOYER, STATUTS_APPEL_LOYER } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import type { BailLocataire } from "../types";

export const metadata = { title: "Mes paiements — Gerimmo" };

// « Mes paiements » (maquette v10) : la prochaine échéance, les douze
// derniers mois en pastilles, les quittances, et les charges expliquées.
export default async function PagePaiementsLocataire(
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
  const bail = ((bauxRows ?? []) as BailLocataire[])[0];

  const moisLong = (d: string) =>
    new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  const prochaine = lignesLoyer.find((l) => l.statut !== "paye");
  const forfait = bail?.charges_mode === "forfait";
  const quittances = lignesLoyer.filter((l) => l.quittance_id);
  // Les 12 derniers mois en pastilles : payé plein, à venir cerclé laiton,
  // impayé rouge — le « parcours » du locataire en un regard.
  const douzeDerniers = lignesLoyer.slice(-12);
  const payes = douzeDerniers.filter((l) => l.statut === "paye").length;

  return (
    <div className="space-y-4">
      <div className="entete-page">
        <h1>Mes paiements</h1>
        {bail?.jour_echeance != null && (
          <span className="mono-discret">
            Terme d&apos;avance · le {bail.jour_echeance === 1 ? "1ᵉʳ" : bail.jour_echeance} du mois
          </span>
        )}
      </div>

      <div className="loc-grille" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        <div className="space-y-4">
          <div className="loc-carte">
            <div className="entete-carte !mb-1">
              <h3 className="text-base font-medium">Prochain loyer</h3>
              {prochaine && (
                <span className="loc-tag bleu capitalize">{moisLong(prochaine.periode)}</span>
              )}
            </div>
            {prochaine && bail ? (
              <>
                <p className="font-heading text-3xl text-[var(--encre)]">
                  {eur(
                    prochaine.statut === "partiel"
                      ? Number(prochaine.montant_du) - Number(prochaine.montant_couvert)
                      : Number(prochaine.montant_du)
                  )}
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {eur(Number(bail.loyer_hc ?? 0))} de loyer + {eur(Number(bail.charges ?? 0))} de{" "}
                  {forfait ? "forfait" : "provision"} de charges — à régler par
                  virement à votre gestionnaire.
                  {prochaine.statut === "partiel"
                    ? ` Déjà réglé : ${eur(Number(prochaine.montant_couvert))}.`
                    : ""}
                </p>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Dès l&apos;encaissement, votre quittance est établie et disponible
                  ici — rien à demander. Le premier loyer d&apos;un bail est
                  quittancé au prorata de la date d&apos;entrée.
                </p>
                {douzeDerniers.length > 1 && (
                  <>
                    <div className="loc-pts" aria-hidden>
                      {douzeDerniers.map((l) => (
                        <i
                          key={l.periode}
                          className={
                            l.statut === "paye" ? "v" : l.statut === "attendu" ? "a" : "r"
                          }
                          title={`${moisLong(l.periode)} — ${STATUTS_APPEL_LOYER[l.statut] ?? l.statut}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Vos {douzeDerniers.length} derniers mois — {payes} réglé
                      {payes > 1 ? "s" : ""}
                      {payes === douzeDerniers.length - (prochaine ? 1 : 0)
                        ? ". Un parcours sans faute."
                        : "."}
                    </p>
                  </>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Rien à régler pour l&apos;instant — votre échéancier apparaîtra ici
                dès l&apos;activation de votre bail.
              </p>
            )}
          </div>

          {bail && (
            <div className="loc-carte">
              <div className="entete-carte !mb-1">
                <h3 className="text-base font-medium">Vos charges</h3>
              </div>
              <p className="text-[13px] text-muted-foreground">
                {forfait
                  ? `Forfait de ${eur(Number(bail.charges ?? 0))} par mois : il couvre les charges sans régularisation — aucun décompte annuel à attendre.`
                  : `Provision de ${eur(Number(bail.charges ?? 0))} par mois : une fois par an, votre gestionnaire la compare aux charges réelles. Le décompte de régularisation arrive dans Mes documents — vous ne payez que ce qui a été réellement dépensé.`}
              </p>
            </div>
          )}
        </div>

        <div className="loc-carte">
          <div className="entete-carte">
            <h3 className="text-base font-medium">Mes quittances</h3>
            <span className="mono-discret">
              {quittances.length} émise{quittances.length > 1 ? "s" : ""}
            </span>
          </div>
          {lignesLoyer.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Vos quittances apparaîtront ici après votre premier loyer réglé.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {[...lignesLoyer].reverse().map((l) => (
                <li key={l.periode} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="w-32 shrink-0 capitalize">{moisLong(l.periode)}</span>
                  <span className="w-24 shrink-0 text-right">{eur(l.montant_du)}</span>
                  <span className="min-w-0 flex-1" />
                  <span
                    className={`shrink-0 ${COULEURS_STATUT_APPEL_LOYER[l.statut] ?? "puce puce-grise"}`}
                  >
                    {STATUTS_APPEL_LOYER[l.statut] ?? l.statut}
                  </span>
                  {l.quittance_id && (
                    <Link
                      href={`/quittance/${l.quittance_id}`}
                      target="_blank"
                      className={`shrink-0 ${buttonVariants({ variant: "ghost", size: "sm" })}`}
                    >
                      Ouvrir
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Vos quittances restent disponibles ici pendant toute la durée du
            bail — utiles pour la CAF ou un futur dossier de location.
          </p>
          <Link
            href={`/attestation-loyer/${orgId}`}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-3`}
          >
            Attestation de bon paiement
          </Link>
        </div>
      </div>
    </div>
  );
}
