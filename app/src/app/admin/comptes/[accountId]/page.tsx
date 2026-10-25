import { randomUUID } from "node:crypto";
import { OffrirMoisAbonnement } from "@/components/offrir-mois-abonnement";
import { ConsoleSection } from "@/components/console-section";
import { LectureIndisponible } from "../../lecture-indisponible";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { libelleRole, libelleStatutAdhesion } from "@/lib/libelles";
import { familleOrganisation } from "@/lib/clients-supervision";
import { detailsExpurges, libelleActionAudit, libelleEvenement } from "@/lib/libelles-journaux";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import { GesteControle } from "@/components/geste-controle";
import { controlerCompte } from "@/app/actions/controle-supervision";
import { baseEspace } from "@/lib/racine-espace";

export const maxDuration = 180;
export const metadata = { title: "Fiche d’un compte" };

/**
 * LA FICHE DE DÉBOGAGE D'UN COMPTE (25/09).
 *
 * Le porteur : « je veux être le super admin, que toutes les actions soient
 * enregistrées, je veux juste pouvoir déboguer au besoin. » Cette page réunit
 * ce que la base sait d'un compte — connexion, second facteur, rôles, fiches
 * locataire, fiche artisan — et tout ce qu'il a fait ou subi : journal d'audit,
 * journal technique. Depuis chaque rôle, la supervision ENTRE dans l'espace
 * avec sa propre identité (traversée journalisée par `log_sa_access`) ; elle
 * n’emprunte jamais celle du compte. Seuls les gestes de contrôle (bloquer,
 * débloquer, réinitialiser le second facteur) écrivent, à son nom, journalisés.
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

  const [dossierLu, adhesionsLues, personnesLues, auditLu, techLu, gestesLus] = await Promise.all([
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
    // Les gestes de la supervision SUR ce compte (audit console 27/09) : ils
    // sont écrits au nom du superviseur, le compte visé est dans le détail.
    supabase
      .from("audit_log")
      .select("id, action, details, created_at, organization_id, organisation:organizations(name)")
      .contains("details", { compte: accountId })
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const retour = `/admin/comptes/${accountId}`;
  if (dossierLu.error) return <main className="p-4 sm:p-7"><LectureIndisponible sujet="Fiche du compte" retour={retour} /></main>;
  const dossier = ((dossierLu.data ?? []) as Dossier[])[0];
  if (!dossier) {
    // Compte inconnu, ou supervision déléguée : la fiche est réservée au
    // superviseur permanent (la RPC ne rend rien sinon).
    notFound();
  }
  const adhesions = (adhesionsLues.data ?? []) as unknown as Adhesion[];
  const personnes = (personnesLues.data ?? []) as unknown as FichePersonne[];
  const audit = (auditLu.data ?? []) as unknown as LigneAudit[];
  const gestesSurLeCompte = (gestesLus.data ?? []) as unknown as LigneAudit[];
  const tech = (techLu.data ?? []) as unknown as LigneTech[];

  const espacesCadeau = Array.from(new Map(adhesions
    .filter(a => a.status === "active" && ["proprietaire_direct", "admin_agence"].includes(a.role))
    .flatMap(a => { const o = un(a.organisation); return o ? [[o.id, { id: o.id, nom: o.name }] as const] : []; })).values());
  const cadeaux = (await Promise.all(espacesCadeau.map(async o => {
    const { data, error } = await supabase.rpc("lire_mois_offerts", { p_org: o.id });
    return { espace: o, data: error ? null : data as { id: string; compte: string; mois: number; motif: string; nature: string; fin: string | null; montant_cents: number; applique_le: string | null }[] };
  })));

  const bloque = dossier.bloque_jusqu_au && new Date(dossier.bloque_jusqu_au) > new Date();
  const etat: [string, string][] = [
    ["Compte créé le", formaterDateHeureParis(dossier.cree_le)],
    ["Dernière connexion", dossier.derniere_connexion ? formaterDateHeureParis(dossier.derniere_connexion) : "Jamais connecté"],
    ["Adresse confirmée", dossier.email_confirme_le ? `oui, le ${formaterDateHeureParis(dossier.email_confirme_le)}` : "non"],
    ["Second facteur", dossier.facteurs_mfa === null ? "non renseigné" : dossier.facteurs_mfa > 0 ? `${dossier.facteurs_mfa} facteur${dossier.facteurs_mfa > 1 ? "s" : ""} vérifié${dossier.facteurs_mfa > 1 ? "s" : ""}` : "aucun"],
    ["Blocage", bloque ? `jusqu’au ${formaterDateHeureParis(dossier.bloque_jusqu_au!)}` : "aucun"],
  ];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <Link href="/admin/clients" className="lien-discret text-sm">← Utilisateurs</Link>

      <div className="entete-page mt-2 mb-6">
        <div className="min-w-0">
          <TitreEcran rubrique="personnes">{dossier.email}</TitreEcran>
          <p className="mono-discret sans-majuscules">
            Fiche du compte · {dossier.est_super_admin ? "compte de supervision" : adhesionsLues.error ? "rôles indisponibles" : `${adhesions.filter((a) => a.status === "active").length} rôle${adhesions.filter((a) => a.status === "active").length > 1 ? "s" : ""} actif${adhesions.filter((a) => a.status === "active").length > 1 ? "s" : ""}`}
          </p>
        </div>
      </div>

      <p className="mesure-lecture mb-6 text-sm text-[var(--texte-secondaire)]">
        Les consultations et actions réalisées dans les espaces restent enregistrées à votre nom.
      </p>

      <ConsoleSection titre="État du compte" description="Connexion, identité et protection du compte." icone="personnes" ouverte>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {etat.map(([l, v]) => (
            <div key={l}><dt className="libelle-champ">{l}</dt><dd className="text-sm">{v}</dd></div>
          ))}
        </dl>
      </ConsoleSection>

      {!dossier.est_super_admin && !adhesionsLues.error && (
        <ConsoleSection titre="Offrir des mois d’abonnement" description="Un cadeau ou un geste commercial après un problème." icone="personnes" ouverte>
          {cadeaux.some(c => c.data === null) ? <LectureIndisponible sujet="Mois offerts" retour={retour}/> : espacesCadeau.length > 0 ? <>
            {cadeaux.flatMap(c => (c.data ?? []).filter(g => !g.applique_le)).length ? cadeaux.flatMap(c => (c.data ?? []).filter(g => !g.applique_le).map(g => (
              <div key={g.id}><p className="mb-3 text-sm">Un cadeau attend sa transmission pour {c.espace.nom}. Reprenez-le pour éviter un doublon.</p>
                <OffrirMoisAbonnement confirmationId={g.id} compte={g.compte} espaces={[c.espace]} reprise={{ id:g.id, mois:g.mois, motif:g.motif, montant_cents:g.montant_cents, organisation:c.espace.id }}/>
              </div>
            ))) : <OffrirMoisAbonnement confirmationId={randomUUID()} compte={accountId} espaces={espacesCadeau}/>}
            <ul className="mt-4 space-y-2 text-sm">{cadeaux.flatMap(c => (c.data ?? []).filter(g => g.applique_le).slice(0,10).map(g => <li key={g.id}>
              {c.espace.nom} · {g.mois} mois offerts · {g.nature === "acces" ? `Accès jusqu’au ${g.fin?.split("-").reverse().join("/")}` : `${(g.montant_cents/100).toFixed(2)} € crédités sur les prochaines factures`}
            </li>))}</ul>
          </> : <p className="text-sm text-[var(--texte-secondaire)]">Cet utilisateur n’a pas encore d’espace propriétaire ou agence. Ouvrez son espace avant de lui offrir des mois ; les espaces locataires et artisans sont gratuits.</p>}

        </ConsoleSection>
      )}

      {/* Les gestes de contrôle (audit console 27/09, majeur 8) : faits au nom
          du superviseur par l'API d'administration, jamais en se connectant
          comme ce compte ; chacun est confirmé et journalisé. */}
      <ConsoleSection titre="Contrôler l’accès" description="Blocage et second facteur, avec confirmation." icone="securite" ton="ambre" ouverte={Boolean(bloque)}>
        {dossier.est_super_admin ? (
          <p className="text-sm text-[var(--texte-secondaire)]">Un compte de supervision ne se bloque pas depuis la console : le relais en votre absence règle ce cas.</p>
        ) : (
          <div className="grid gap-2">
            {bloque ? (
              <GesteControle action={controlerCompte.bind(null, accountId)} geste="debloquer" titre="Débloquer le compte" bouton="Débloquer"
                confirmation="Je rends à ce compte la possibilité de se connecter." />
            ) : (
              <GesteControle action={controlerCompte.bind(null, accountId)} geste="bloquer" titre="Bloquer le compte" bouton="Bloquer" motif destructif
                confirmation="Je bloque ce compte : il ne peut plus se connecter ni prolonger sa session. Ses données et ses rôles sont conservés." />
            )}
            {(dossier.facteurs_mfa ?? 0) > 0 && (
              <GesteControle action={controlerCompte.bind(null, accountId)} geste="reinitialiser_mfa" titre="Réinitialiser le second facteur" bouton="Réinitialiser le second facteur" motif destructif
                confirmation="Je supprime les seconds facteurs de ce compte (téléphone perdu, par exemple) : il devra en enregistrer un nouveau. J’ai vérifié l’identité du demandeur hors de Gerimmo." />
            )}
          </div>
        )}
        {gestesLus.error && <LectureIndisponible sujet="Historique des contrôles" retour={retour} />}
        {gestesSurLeCompte.length > 0 && (
          <ol className="mt-3 divide-y divide-[var(--filet-leger)] border-t border-[var(--filet)] pt-2">
            {gestesSurLeCompte.map((l) => (
              <li key={l.id} className="py-2 text-sm"><span className="mono-discret">{formaterDateHeureParis(l.created_at)}</span> · <b>{libelleActionAudit(l.action)}</b></li>
            ))}
          </ol>
        )}
      </ConsoleSection>

      <ConsoleSection titre="Rôles et espaces" description="Retrouver les dossiers et les accès rattachés." icone="personnes" ton="vert" ouverte statut={adhesionsLues.error || personnesLues.error ? "Lecture indisponible" : `${adhesions.length} rôles`}>
        <div className="entete-carte"><span className="puce puce-grise">{adhesionsLues.error ? "—" : adhesions.length}</span></div>
        {adhesionsLues.error || personnesLues.error ? <LectureIndisponible sujet="Rôles et dossiers rattachés" retour={retour} /> : adhesions.length === 0 && !dossier.artisan_id ? (
          <p className="text-sm text-[var(--texte-secondaire)]">Aucun rôle : ce compte n’a accès à aucun espace.</p>
        ) : (
          <ul className="divide-y divide-[var(--filet-leger)]">
            {adhesions.map((m) => {
              const org = un(m.organisation);
              const locataire = m.role === "locataire";
              const fiche = locataire ? personnes.find((p) => p.organization_id === m.organization_id) : null;
              // Décision D27 : l'espace d'un propriétaire direct vit sous /espace/<id>.
              const baseOrg = org ? baseEspace(org.id, org.type === "proprietaire_direct") : null;
              const href = !baseOrg ? null : locataire
                ? fiche ? `${baseOrg}/personnes/${fiche.id}` : `${baseOrg}/personnes`
                : baseOrg;
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
      </ConsoleSection>

      <ConsoleSection titre="Actions sur ce compte" description="Journal des actions sensibles." icone="historique" statut={auditLu.error ? "Lecture indisponible" : undefined}>
        <div className="entete-carte"><span className="puce puce-grise">{auditLu.error ? "—" : `${audit.length}${audit.length === 60 ? " derniers" : ""}`}</span></div>
        {auditLu.error ? (
          <LectureIndisponible sujet="Journal d’audit" retour={retour} />
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
      </ConsoleSection>

      <ConsoleSection titre="Événements techniques" description="Éléments utiles pour rechercher un problème." icone="sante" statut={techLu.error ? "Lecture indisponible" : undefined}>
        <div className="entete-carte"><span className="puce puce-grise">{techLu.error ? "—" : `${tech.length}${tech.length === 40 ? " derniers" : ""}`}</span></div>
        {techLu.error ? <LectureIndisponible sujet="Journal technique" retour={retour} /> : tech.length === 0 ? (
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
      </ConsoleSection>
    </main>
  );
}
