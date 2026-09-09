import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";

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
const ETATS_PORTEFEUILLE = ["brouillon", "a_signer", "actif", "preavis"];

const STATUTS_ORG: Record<string, { libelle: string; ton: string }> = {
  essai: { libelle: "essai gratuit", ton: "ambre" },
  active: { libelle: "active", ton: "vert" },
  suspendue: { libelle: "suspendue", ton: "rouge" },
  archivee: { libelle: "archivée", ton: "rouge" },
};

export default async function PageAdministration(
  props: PageProps<"/agence/[orgId]/administration">
) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire, organisation } = await verifierAccesEspace(orgId);
  if (estProprietaire || role !== "admin_agence") notFound();

  const [
    { data: membres, error: e1 },
    { data: mandats, error: e2 },
    { data: lignes, error: e3 },
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
  // Un échec de lecture ne doit pas se déguiser en agence vide (audit 09/09)
  if (e1 || e2 || e3) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
        <h1>Administration</h1>
        <div className="vide mt-4">
          Impossible de charger la page pour l&apos;instant — rechargez dans un
          instant.
        </div>
      </main>
    );
  }

  const parMandat = new Map<string, { agent: string | null; actif: boolean }>();
  for (const m of (mandats ?? []) as { id: string; agent_account_id: string | null; etat: string }[]) {
    parMandat.set(m.id, { agent: m.agent_account_id, actif: m.etat === "actif" });
  }
  const lotsParAgent = new Map<string, Set<string>>();
  const lotsSansTitulaire = new Set<string>();
  const lotsSousMandatActif = new Set<string>();
  for (const l of (lignes ?? []) as { mandat_id: string; lot_id: string }[]) {
    const m = parMandat.get(l.mandat_id);
    if (!m) continue;
    if (m.actif) lotsSousMandatActif.add(l.lot_id);
    if (m.agent) {
      if (!lotsParAgent.has(m.agent)) lotsParAgent.set(m.agent, new Set());
      lotsParAgent.get(m.agent)!.add(l.lot_id);
    } else {
      lotsSansTitulaire.add(l.lot_id);
    }
  }
  const nbLotsFactures = lotsSousMandatActif.size;
  const equipe = ((membres ?? []) as { account_id: string; email: string; role: string }[])
    .filter((m) => m.role === "agent" || m.role === "admin_agence")
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
  const statut = STATUTS_ORG[organisation.status] ?? {
    libelle: organisation.status,
    ton: "ambre",
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-7">
      <h1>Administration</h1>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3 className="font-heading text-lg">Équipe &amp; portefeuilles</h3>
          <span className="mono-discret">
            {equipe.length} membre{equipe.length > 1 ? "s" : ""}
          </span>
        </div>
        <ul className="divide-y divide-border">
          {equipe.map((m) => {
            const nbLots = lotsParAgent.get(m.account_id)?.size ?? 0;
            return (
              <li key={m.account_id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  {m.email}
                  <small className="block text-muted-foreground">
                    {m.role === "admin_agence" ? "Admin d'agence — voit tout" : "Agent"}
                  </small>
                </span>
                {m.role === "agent" && (
                  <span className="puce puce-encre shrink-0">
                    {nbLots} lot{nbLots > 1 ? "s" : ""} en portefeuille
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Le portefeuille d&apos;un agent = les mandats dont il est titulaire (le
          titulaire se choisit sur la fiche du mandant).
          {lotsSansTitulaire.size > 0 &&
            ` ${lotsSansTitulaire.size} lot${lotsSansTitulaire.size > 1 ? "s" : ""} sous mandat sans titulaire — hors de tout portefeuille d'agent : pensez à les confier.`}{" "}
          L&apos;invitation d&apos;agents et la délégation d&apos;un portefeuille en
          absence arrivent avec le chantier rôles.
        </p>
      </div>

      <div className="loc-carte">
        <div className="entete-carte !mb-1">
          <h3 className="text-base font-medium">Abonnement de l&apos;agence</h3>
          <span className={`loc-tag ${statut.ton}`}>{statut.libelle}</span>
        </div>
        <div className="ligne-info">
          <span>
            {nbLotsFactures} lot{nbLotsFactures > 1 ? "s" : ""} sous mandat actif
          </span>
          <span>tarification par palier — sur devis</span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Le comptage suit les lots sous mandat actif. Le paiement en ligne
          (Stripe) arrive prochainement — rien ne se ferme d&apos;ici là.
        </p>
      </div>

      <div className="loc-carte">
        <h3 className="text-base font-medium">Journal d&apos;audit</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
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
