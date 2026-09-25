import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { libelleRole, libelleStatutAdhesion } from "@/lib/libelles";
import { familleOrganisation } from "@/lib/clients-supervision";
import { detailsExpurges, libelleActionAudit, libelleEvenement } from "@/lib/libelles-journaux";
import { formaterDateHeureParis } from "@/lib/heure-paris";

export const metadata = { title: "Fiche d’un compte — Supervision Gerimmo" };

/**
 * LA FICHE DE DÉBOGAGE D'UN COMPTE (25/09).
 *
 * Le porteur : « je veux être le super admin, que toutes les actions soient
 * enregistrées, je veux juste pouvoir déboguer au besoin. » Cette page réunit
 * ce que la base sait d'un compte — connexion, second facteur, rôles, fiches
 * locataire, fiche artisan — et tout ce qu'il a fait ou subi : journal d'audit,
 * journal technique. Depuis chaque rôle, la supervision ENTRE dans l'espace
 * avec sa propre identité (traversée journalisée par `log_sa_access`) ; elle
 * n'emprunte jamais celle du compte. Rien n'est écrit ici.
 */

type Dossier = {
  account_id: string;
  email: string;
  cree_le: string;
  derniere_connexion: string | null;
  email_confirme_le: string | null;
  facteurs_mfa: number | null;
  bloque_jusqu_au: string | null;
  est_super_admin: boolean;
  artisan_id: string | null;
  artisan_raison_sociale: string | null;
};
type Adhesion = {
  id: string;
  role: string;
  status: string;
  organization_id: string | null;
  organisation: { id: string; name: string; type: string | null } | { id: string; name: string; type: string | null }[] | null;
};
type FichePersonne = { id: string; organization_id: string; nom: string; prenom: string | null; organisation: { name: string } | { name: string }[] | null };
type LigneAudit = { id: string; action: string; details: unknown; created_at: string; organization_id: string | null; organisation: { name: string } | { name: string }[] | null };
type LigneTech = { id: string; evenement: string; details: unknown; created_at: string };

const un = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

export default async function PageCompte({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(accountId)) notFound();
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const [dossierLu, adhesionsLues, personnesLues, auditLu, techLu] = await Promise.all([
    supabase.rpc("dossier_compte_supervision", { p_account: accountId }),
    supabase
      .from("memberships")
      .select("id, role, status, organization_id, organisation:organizations(id, name, type)")
      .eq("account_id", accountId)
      .order("created_at"),
    supabase
      .from("persons")
      .select("id, organization_id, nom, prenom, organisation:organizations(name)")
      .eq("account_id", accountId),
    supabase
      .from("audit_log")
      .select("id, action, details, created_at, organization_id, organisation:organizations(name)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("tech_log")
      .select("id, evenement, details, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const dossier = ((dossierLu.data ?? []) as Dossier[])[0];
  if (!dossier) {
    // Compte inconnu, ou supervision déléguée : la fiche est réservée au
    // superviseur permanent (la RPC ne rend rien sinon).
    notFound();
  }
  const adhesions = (adhesionsLues.data ?? []) as unknown as Adhesion[];
  const personnes = (personnesLues.data ?? []) as unknown as FichePersonne[];
  const audit = (auditLu.data ?? []) as unknown as LigneAudit[];
  const tech = (techLu.data ?? []) as unknown as LigneTech[];

  const bloque = dossier.bloque_jusqu_au && new Date(dossier.bloque_jusqu_au) > new Date();
  const etat: [string, string][] = [
    ["Compte créé le", formaterDateHeureParis(dossier.cree_le)],
    ["Dernière connexion", dossier.derniere_connexion ? formaterDateHeureParis(dossier.derniere_connexion) : "Jamais connecté"],
    ["Adresse confirmée", dossier.email_confirme_le ? `oui, le ${formaterDateHeureParis(dossier.email_confirme_le)}` : "non"],
    ["Second facteur", dossier.facteurs_mfa === null ? "inconnu sur ce banc" : dossier.facteurs_mfa > 0 ? `${dossier.facteurs_mfa} facteur${dossier.facteurs_mfa > 1 ? "s" : ""} vérifié${dossier.facteurs_mfa > 1 ? "s" : ""}` : "aucun"],
    ["Blocage", bloque ? `jusqu’au ${formaterDateHeureParis(dossier.bloque_jusqu_au!)}` : "aucun"],
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <Link href="/admin/clients" className="lien-discret text-sm">← Agences, bailleurs et artisans</Link>

      <div className="entete-page mt-2 mb-6">
        <div className="min-w-0">
          <h1 className="[overflow-wrap:anywhere] max-sm:text-2xl">{dossier.email}</h1>
          <p className="mono-discret sans-majuscules">
            Fiche de débogage · {dossier.est_super_admin ? "compte de supervision" : `${adhesions.filter((a) => a.status === "active").length} rôle${adhesions.filter((a) => a.status === "active").length > 1 ? "s" : ""} actif${adhesions.filter((a) => a.status === "active").length > 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      <p className="mesure-lecture mb-6 text-sm text-[var(--texte-secondaire)]">
        Vous lisez ce que la base sait de ce compte, avec vos propres droits. Entrer dans un de ses
        espaces se fait aussi avec votre identité : la traversée et chaque geste sont inscrits au
        journal d’audit à votre nom.
      </p>

      <section className="loc-carte">
        <div className="entete-carte"><h2>État du compte</h2></div>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {etat.map(([l, v]) => (
            <div key={l}><dt className="libelle-champ">{l}</dt><dd className="text-sm">{v}</dd></div>
          ))}
        </dl>
      </section>

      <section className="loc-carte mt-4">
        <div className="entete-carte"><h2>Rôles et espaces</h2><span className="puce puce-grise">{adhesions.length}</span></div>
        {adhesions.length === 0 && !dossier.artisan_id ? (
          <p className="text-sm text-[var(--texte-secondaire)]">Aucun rôle : ce compte n’a accès à aucun espace.</p>
        ) : (
          <ul className="divide-y divide-[var(--filet-leger)]">
            {adhesions.map((m) => {
              const org = un(m.organisation);
              const locataire = m.role === "locataire";
              const fiche = locataire ? personnes.find((p) => p.organization_id === m.organization_id) : null;
              const href = !org ? null : locataire
                ? fiche ? `/agence/${org.id}/personnes/${fiche.id}` : `/agence/${org.id}/personnes`
                : `/agence/${org.id}`;
              return (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <b>{libelleRole(m.role)}</b>
                    {org ? <> · {org.name} <span className="text-[var(--texte-secondaire)]">({familleOrganisation(org.type) === "agence" ? "agence" : "propriétaire bailleur"})</span></> : <> · toute la plateforme</>}
                    {" "}<span className="text-[var(--texte-secondaire)]">— adhésion {libelleStatutAdhesion(m.status)}</span>
                    {fiche && <span className="text-[var(--texte-secondaire)]"> · fiche {fiche.prenom ? `${fiche.prenom} ` : ""}{fiche.nom}</span>}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {org && <Link href={`/admin/organisations/${org.id}`} className="lien-discret">Fiche console →</Link>}
                    {href && <Link href={href} className="btn-secondaire min-h-9">{locataire ? "Ouvrir son dossier locataire" : "Entrer dans son espace"}</Link>}
                  </span>
                </li>
              );
            })}
            {dossier.artisan_id && (
              <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><b>Artisan</b> · {dossier.artisan_raison_sociale}</span>
                <Link href={`/admin/clients/artisans/${dossier.artisan_id}`} className="btn-secondaire min-h-9">Fiche artisan</Link>
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="loc-carte mt-4">
        <div className="entete-carte"><h2>Journal d’audit de ce compte</h2><span className="puce puce-grise">{audit.length}{audit.length === 60 ? "+" : ""}</span></div>
        {auditLu.error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">Le journal est indisponible. Rechargez la page.</p>
        ) : audit.length === 0 ? (
          <p className="text-sm text-[var(--texte-secondaire)]">Aucune action enregistrée pour ce compte.</p>
        ) : (
          <ol className="divide-y divide-[var(--filet-leger)]">
            {audit.map((l) => {
              const org = un(l.organisation);
              const detail = detailsExpurges(l.details);
              return (
                <li key={l.id} className="py-2 text-sm">
                  <span className="mono-discret">{formaterDateHeureParis(l.created_at)}</span> · <b>{libelleActionAudit(l.action)}</b>
                  {org && <span className="text-[var(--texte-secondaire)]"> · {org.name}</span>}
                  {detail && <span className="block text-[var(--texte-secondaire)]">{detail}</span>}
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 text-sm"><Link href="/admin/journaux" className="lien-discret">Tous les journaux, avec filtres →</Link></p>
      </section>

      <section className="loc-carte mt-4">
        <div className="entete-carte"><h2>Journal technique</h2><span className="puce puce-grise">{tech.length}</span></div>
        {tech.length === 0 ? (
          <p className="text-sm text-[var(--texte-secondaire)]">Aucun événement technique rattaché à ce compte.</p>
        ) : (
          <ol className="divide-y divide-[var(--filet-leger)]">
            {tech.map((l) => {
              const detail = detailsExpurges(l.details);
              return (
                <li key={l.id} className="py-2 text-sm">
                  <span className="mono-discret">{formaterDateHeureParis(l.created_at)}</span> · <b>{libelleEvenement(l.evenement)}</b>
                  {detail && <span className="block text-[var(--texte-secondaire)]">{detail}</span>}
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
