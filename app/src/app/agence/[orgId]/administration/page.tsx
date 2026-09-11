import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  EncadreLectureImpossible,
  EnteteReglages,
  statutOrganisation,
} from "../profil/famille-reglages";

export const metadata = { title: "Administration — Gerimmo" };

// Administration (maquette v6, admin d'agence) : les membres de l'agence et
// leurs portefeuilles (mandats confiés), l'abonnement — honnête : la
// facturation Stripe arrive au S11, l'invitation d'agents et la délégation de
// portefeuille au chantier rôles (S9b). Le journal d'audit complet reste au
// super admin (RLS) — chaque geste sensible y est déjà tracé.
//
// Audit 09/09 : les portefeuilles se comptent avec la MÊME règle que
// lib/portefeuille.ts (mandats brouillon/à signer/actif/préavis, lignes en
// cours) — l'admin lit le même chiffre que l'agent ; l'abonnement ne compte
// que les lots sous mandat ACTIF, comme sa légende l'affirme.
//
// Relevé 11/09 : l'écran sous-comptait les lots « à confier ». Il ne signalait
// que les mandats SANS titulaire ; ceux confiés à un agent dont l'adhésion
// n'est plus active (agent parti) disparaissaient des deux côtés — aucun
// portefeuille affiché ne les portait, et la phrase « pensez à les confier »
// ne les comptait pas. Un lot est désormais à confier dès qu'aucun membre
// AFFICHÉ ne le tient.
const ETATS_PORTEFEUILLE = ["brouillon", "a_signer", "actif", "preavis"];

export default async function PageAdministration(
  props: PageProps<"/agence/[orgId]/administration">
) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire, organisation } = await verifierAccesEspace(orgId);
  if (estProprietaire || role !== "admin_agence") notFound();

  const [
    { data: membres, error: erreurMembres },
    { data: mandats, error: erreurMandats },
    { data: lignes, error: erreurLignes },
  ] = await Promise.all([
    supabase.rpc("org_membres_gerants", { org: orgId }),
    supabase
      .from("mandats")
      .select("id, agent_account_id, etat")
      .eq("organization_id", orgId)
      .in("etat", ETATS_PORTEFEUILLE),
    supabase
      .from("mandat_lignes")
      .select("mandat_id, lot_id")
      .eq("organization_id", orgId)
      .is("date_fin", null),
  ]);
  // Un échec de lecture ne doit pas se déguiser en agence vide (audit 09/09).
  // Chaque carte le dit pour ce qui la concerne : l'équipe reste lisible même
  // quand les mandats ne le sont pas, et l'inverse.
  const equipeLue = !erreurMembres;
  const portefeuillesLus = !erreurMandats && !erreurLignes;

  const parMandat = new Map<string, { agent: string | null; actif: boolean }>();
  for (const m of (mandats ?? []) as { id: string; agent_account_id: string | null; etat: string }[]) {
    parMandat.set(m.id, { agent: m.agent_account_id, actif: m.etat === "actif" });
  }
  const lotsParAgent = new Map<string, Set<string>>();
  const lotsSousMandat = new Set<string>();
  const lotsSousMandatActif = new Set<string>();
  for (const l of (lignes ?? []) as { mandat_id: string; lot_id: string }[]) {
    const m = parMandat.get(l.mandat_id);
    if (!m) continue;
    lotsSousMandat.add(l.lot_id);
    if (m.actif) lotsSousMandatActif.add(l.lot_id);
    if (m.agent) {
      if (!lotsParAgent.has(m.agent)) lotsParAgent.set(m.agent, new Set());
      lotsParAgent.get(m.agent)!.add(l.lot_id);
    }
  }
  const nbLotsFactures = lotsSousMandatActif.size;
  const equipe = ((membres ?? []) as { account_id: string; email: string; role: string }[])
    .filter((m) => m.role === "agent" || m.role === "admin_agence")
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
  // Tenu = dans le portefeuille d'un membre effectivement affiché ci-dessous
  const lotsTenus = new Set<string>();
  for (const m of equipe) {
    for (const id of lotsParAgent.get(m.account_id) ?? []) lotsTenus.add(id);
  }
  const nbAConfier = [...lotsSousMandat].filter((id) => !lotsTenus.has(id)).length;
  const statut = statutOrganisation(organisation.status);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Administration" mention={organisation.name}>
        Réservé à l&apos;admin d&apos;agence : qui travaille dans
        l&apos;agence et sur quels lots, ce que compte l&apos;abonnement, et
        ce qui est tracé.
      </EnteteReglages>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Équipe &amp; portefeuilles</h3>
          {equipeLue && (
            <span className="mono-discret">
              {equipe.length} membre{equipe.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
        {!equipeLue ? (
          <EncadreLectureImpossible>
            La liste des membres n&apos;a pas pu être lue — ce n&apos;est pas
            une agence sans personne : rechargez la page dans un instant.
          </EncadreLectureImpossible>
        ) : equipe.length === 0 ? (
          <p className="vide">
            Aucun membre actif dans cette agence. L&apos;invitation
            d&apos;agents arrive avec le chantier rôles.
          </p>
        ) : (
          <ul>
            {equipe.map((m) => {
              const nbLots = lotsParAgent.get(m.account_id)?.size ?? 0;
              return (
                <li key={m.account_id} className="ligne-info">
                  {/* .ligne-info grise son premier enfant : ici c'est le nom
                      du membre, pas un libellé — il reprend la couleur du
                      corps, le rôle reste en appui. */}
                  <span className="min-w-0 flex-1 break-words !text-foreground">
                    {m.email}
                    <small className="block text-muted-foreground">
                      {m.role === "admin_agence"
                        ? "Admin d'agence — voit tout"
                        : "Agent"}
                    </small>
                  </span>
                  {portefeuillesLus && (m.role === "agent" || nbLots > 0) && (
                    <span className="puce puce-encre shrink-0">
                      {nbLots} lot{nbLots > 1 ? "s" : ""} en portefeuille
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {equipeLue && !portefeuillesLus && (
          <div className="mt-3">
            <EncadreLectureImpossible>
              Les mandats n&apos;ont pas pu être lus : les portefeuilles ne
              sont pas affichés. Personne n&apos;a perdu le sien —
              c&apos;est la lecture qui a échoué.
            </EncadreLectureImpossible>
          </div>
        )}
        {/* Un lot sous mandat que personne ne tient est une action à mener,
            pas une note de bas de page : il sort du gris 12 px. Il exige les
            DEUX lectures : sans la liste des membres, tout lot paraîtrait
            orphelin — l'alerte serait celle d'un écran en panne. */}
        {equipeLue && portefeuillesLus && nbAConfier > 0 && (
          <div className="mt-3 border-l-[3px] border-l-warning bg-warning-soft p-3">
            <p className="text-sm text-warning-soft-foreground">
              {nbAConfier} lot{nbAConfier > 1 ? "s" : ""} sous mandat
              {nbAConfier > 1 ? " ne figurent" : " ne figure"} dans le
              portefeuille d&apos;aucun membre ci-dessus — sans titulaire, ou
              titulaire parti de l&apos;agence. Le titulaire se choisit sur la
              fiche du mandant.
            </p>
          </div>
        )}
        <p className="mesure-lecture mt-3 text-xs text-muted-foreground">
          Le portefeuille d&apos;un agent = les mandats dont il est titulaire.
          L&apos;invitation d&apos;agents et la délégation d&apos;un
          portefeuille en absence arrivent avec le chantier rôles.
        </p>
      </div>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Abonnement de l&apos;agence</h3>
          <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
        </div>
        {portefeuillesLus ? (
          <>
            <div className="ligne-info">
              <span>Lots sous mandat actif</span>
              <span className="montant">{nbLotsFactures}</span>
            </div>
            <div className="ligne-info">
              <span>Tarification</span>
              <span>par palier — sur devis</span>
            </div>
          </>
        ) : (
          <EncadreLectureImpossible>
            Les mandats n&apos;ont pas pu être lus : le nombre de lots facturés
            reste inconnu — mieux vaut le taire que l&apos;annoncer à zéro.
          </EncadreLectureImpossible>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Le comptage suit les lots sous mandat actif. Le paiement en ligne
          (Stripe) arrive prochainement — rien ne se ferme d&apos;ici là.
        </p>
      </div>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Journal d&apos;audit</h3>
        </div>
        <p className="mesure-lecture text-sm text-muted-foreground">
          Chaque geste sensible (versement, clôture comptable, changement de
          titulaire, validation de pièce…) est horodaté et tracé — qui, quoi, sur
          quel objet. La consultation du journal complet est aujourd&apos;hui
          réservée au super admin ; son ouverture à l&apos;admin d&apos;agence
          arrive avec le chantier rôles.
        </p>
      </div>
    </main>
  );
}
