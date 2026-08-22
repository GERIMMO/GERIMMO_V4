import Link from "next/link";
import { eur, formaterDate } from "@/lib/ged";
import { TYPES_BAIL } from "@/lib/baux";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormulaireAttestation } from "./formulaire-attestation";
import type { IncidentLocataire } from "./incidents-locataire";

export const metadata = { title: "Mon logement — Gerimmo" };

type Piece = {
  document_id: string;
  type: string;
  titre: string | null;
  expire_le: string | null;
  depose_le: string;
  verifie_le: string | null;
};

function statutAssurance(expire: string | null): { texte: string; classe: string } {
  if (!expire) return { texte: "sans date d'expiration", classe: "text-muted-foreground" };
  const jours = Math.ceil(
    (new Date(expire).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000
  );
  if (jours < 0) return { texte: `expirée depuis ${-jours} j`, classe: "text-destructive" };
  if (jours <= 30)
    return {
      texte: `expire dans ${jours} j (${formaterDate(expire)})`,
      classe: "text-warning-soft-foreground",
    };
  return { texte: `valide jusqu'au ${formaterDate(expire)}`, classe: "text-success-soft-foreground" };
}

// Écran « Mon logement » — maquette pLocBail : eyebrow avec l'adresse du lot,
// grille deux colonnes (mon bail en lignes libellé↔valeur | problème +
// assurance), cartes à liseré gauche porteur de sens.
export default async function PageLocataire(props: PageProps<"/locataire/[orgId]">) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  // Quatre RPC indépendants : en parallèle plutôt qu'en cascade
  const [{ data: pieces }, { data: baux }, { data: depotRows }, { data: incidentsBruts }] =
    await Promise.all([
      supabase.rpc("mon_dossier_locataire", { p_org: orgId }),
      supabase.rpc("mon_bail_locataire", { p_org: orgId }),
      supabase.rpc("mon_depot_locataire", { p_org: orgId }),
      supabase.rpc("mes_incidents_locataire", { p_org: orgId }),
    ]);
  // La DERNIÈRE attestation (recette 21/08 : le tri ascendant faisait
  // réapparaître la plus ancienne après un renouvellement)
  const assurance = ((pieces ?? []) as Piece[])
    .filter((p) => p.type === "attestation_assurance")
    .sort((a, b) => b.depose_le.localeCompare(a.depose_le))[0];

  const bail = ((baux ?? []) as {
    type: string;
    etat: string;
    loyer_hc: number | null;
    charges: number | null;
    lot_nom: string;
    date_debut: string | null;
  }[])[0];

  const depot = ((depotRows ?? []) as {
    depot_du: number;
    encaisse: number;
    derniere_date: string | null;
  }[])[0];

  const statut = assurance ? statutAssurance(assurance.expire_le) : null;

  // Statut des signalements visible dès l'accueil (RM-19.2.3) : le compte des
  // dossiers en cours — la liste complète vit dans l'onglet « Mes demandes ».
  const incidentsEnCours = ((incidentsBruts ?? []) as IncidentLocataire[]).filter(
    (i) => i.etat !== "clos"
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-[1.125rem] p-4 sm:p-7">
      <div className="entete-page">
        <div>
          {bail && <p className="eyebrow">{bail.lot_nom}</p>}
          <h1 className="mt-0.5">Mon logement</h1>
        </div>
        {personne?.prenom && (
          <p className="text-sm text-muted-foreground">Bonjour {personne.prenom}</p>
        )}
      </div>

      <div className="deux-col">
        {/* Mon bail — lignes libellé ↔ valeur, comme la maquette */}
        <Card>
          <CardContent className="pt-5">
            <div className="entete-carte">
              <h3 className="text-base font-medium">Mon bail</h3>
              {bail?.etat === "preavis" && <span className="puce puce-prep">En préavis</span>}
            </div>
            {bail ? (
              <>
                <div className="ligne-info">
                  <span>Type</span>
                  <span>Bail {(TYPES_BAIL[bail.type] ?? bail.type).toLowerCase()}</span>
                </div>
                {bail.date_debut && (
                  <div className="ligne-info">
                    <span>Depuis le</span>
                    <span>{formaterDate(bail.date_debut)}</span>
                  </div>
                )}
                <div className="ligne-info">
                  <span>Loyer + charges</span>
                  <span>
                    {bail.loyer_hc != null
                      ? eur(Number(bail.loyer_hc) + Number(bail.charges ?? 0))
                      : "—"}
                  </span>
                </div>
                {depot && Number(depot.depot_du) > 0 && (
                  <div className="ligne-info">
                    <span>Dépôt de garantie</span>
                    <span>
                      {eur(Number(depot.encaisse))} encaissé
                      {Number(depot.encaisse) < Number(depot.depot_du)
                        ? ` sur ${eur(Number(depot.depot_du))}`
                        : ""}
                    </span>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/locataire/${orgId}/loyers`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Mes quittances
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucun bail actif — votre bail apparaîtra ici dès sa signature.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3.5">
          {/* « Un problème dans le logement ? » — liseré laiton (maquette) */}
          <Card className="border-l-[3px] border-l-[var(--or)]">
            <CardContent className="pt-5">
              <h3 className="text-base font-medium">Un problème dans le logement ?</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Décrivez-le, votre gérant est prévenu immédiatement — et vous
                saurez qui prend la réparation en charge.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link href={`/locataire/${orgId}/incident`} className="btn-or">
                  Signaler un problème
                </Link>
                <Link
                  href={`/locataire/${orgId}/demandes`}
                  className="text-sm text-[var(--bleu)] underline-offset-2 hover:underline"
                >
                  Mes demandes
                  {incidentsEnCours.length > 0 ? ` (${incidentsEnCours.length} en cours)` : ""}
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Assurance habitation — obligation annuelle */}
          <Card>
            <CardContent className="pt-5">
              <div className="entete-carte">
                <h3 className="text-base font-medium">Assurance habitation</h3>
                {assurance &&
                  (assurance.verifie_le ? (
                    // Libellé générique (recette 22/08) : le validateur peut être
                    // une agence ou un propriétaire bailleur — « Validée » suffit.
                    <span className="puce puce-loue">Validée</span>
                  ) : (
                    <span className="puce puce-prep">En cours de vérification</span>
                  ))}
              </div>
              {assurance ? (
                <div className="ligne-info">
                  <span>{assurance.titre || "Attestation déposée"}</span>
                  <span className={statut?.classe}>{statut?.texte}</span>
                </div>
              ) : (
                // Obligation annuelle non tenue : le dire franchement, pas en gris
                <div className="mb-3 rounded-lg border border-destructive-soft bg-destructive-soft/40 p-3">
                  <p className="text-sm font-medium text-destructive-soft-foreground">
                    Aucune attestation déposée
                  </p>
                  <p className="mt-0.5 text-sm text-destructive-soft-foreground">
                    L&apos;assurance habitation est obligatoire pendant toute la durée du
                    bail. Déposez votre attestation ci-dessous.
                  </p>
                </div>
              )}
              <div className="mt-4">
                <FormulaireAttestation orgId={orgId} renouvellement={Boolean(assurance)} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
