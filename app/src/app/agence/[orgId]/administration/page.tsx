import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";

export const metadata = { title: "Administration — Gerimmo" };

// Administration (maquette v6, admin d'agence) : les membres de l'agence et
// leurs portefeuilles (mandats confiés), l'abonnement — honnête : la
// facturation Stripe arrive au S11, l'invitation d'agents et la délégation de
// portefeuille au chantier rôles (S9b). Le journal d'audit complet reste au
// super admin (RLS) — chaque geste sensible y est déjà tracé.
export default async function PageAdministration(
  props: PageProps<"/agence/[orgId]/administration">
) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire, organisation } = await verifierAccesEspace(orgId);
  if (estProprietaire || role !== "admin_agence") notFound();

  const [{ data: membres }, { data: mandats }, { data: lignes }, { count: nbLots }] =
    await Promise.all([
      supabase.rpc("org_membres_gerants", { org: orgId }),
      supabase
        .from("mandats")
        .select("id, agent_account_id")
        .eq("organization_id", orgId)
        .eq("etat", "actif"),
      supabase
        .from("mandat_lignes")
        .select("mandat_id")
        .eq("organization_id", orgId)
        .is("date_fin", null),
      supabase
        .from("lots")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .neq("etat", "archive"),
    ]);

  const lotsParMandat = new Map<string, number>();
  for (const l of (lignes ?? []) as { mandat_id: string }[]) {
    lotsParMandat.set(l.mandat_id, (lotsParMandat.get(l.mandat_id) ?? 0) + 1);
  }
  const lotsParAgent = new Map<string, number>();
  let lotsSansTitulaire = 0;
  for (const m of (mandats ?? []) as { id: string; agent_account_id: string | null }[]) {
    const n = lotsParMandat.get(m.id) ?? 0;
    if (m.agent_account_id) {
      lotsParAgent.set(m.agent_account_id, (lotsParAgent.get(m.agent_account_id) ?? 0) + n);
    } else {
      lotsSansTitulaire += n;
    }
  }
  const equipe = ((membres ?? []) as { account_id: string; email: string; role: string }[])
    .filter((m) => m.role === "agent" || m.role === "admin_agence")
    .sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));

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
          {equipe.map((m) => (
            <li key={m.account_id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                {m.email}
                <small className="block text-muted-foreground">
                  {m.role === "admin_agence" ? "Admin d'agence — voit tout" : "Agent"}
                </small>
              </span>
              {m.role === "agent" && (
                <span className="puce puce-encre shrink-0">
                  {lotsParAgent.get(m.account_id) ?? 0} lot
                  {(lotsParAgent.get(m.account_id) ?? 0) > 1 ? "s" : ""} en portefeuille
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Le portefeuille d&apos;un agent = les mandats dont il est titulaire (le
          titulaire se choisit sur la fiche du mandant).
          {lotsSansTitulaire > 0 &&
            ` ${lotsSansTitulaire} lot${lotsSansTitulaire > 1 ? "s" : ""} sous mandat sans titulaire — visibles par toute l'agence.`}{" "}
          L&apos;invitation d&apos;agents et la délégation d&apos;un portefeuille en
          absence arrivent avec le chantier rôles.
        </p>
      </div>

      <div className="loc-carte">
        <div className="entete-carte !mb-1">
          <h3 className="text-base font-medium">Abonnement de l&apos;agence</h3>
          <span className={`loc-tag ${organisation.status === "essai" ? "ambre" : "vert"}`}>
            {organisation.status === "essai" ? "essai gratuit" : organisation.status}
          </span>
        </div>
        <div className="ligne-info">
          <span>{nbLots ?? 0} lot{(nbLots ?? 0) > 1 ? "s" : ""} en gestion</span>
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
