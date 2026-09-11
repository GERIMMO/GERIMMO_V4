import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { seDeconnecter } from "@/app/actions/auth";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { sansJargon } from "@/lib/erreurs";

export const metadata = { title: "Mes espaces — Gerimmo" };

const LIBELLES: Record<string, string> = {
  super_admin: "Console d'administration",
  admin_agence: "Espace agence (administrateur)",
  agent: "Espace agence",
  proprietaire_direct: "Espace propriétaire",
  locataire: "Espace locataire",
  artisan: "Espace artisan",
};

type Adhesion = {
  id: string;
  role: string;
  organization: { id: string; name: string } | null;
};

function cheminEspace(a: Adhesion): string | null {
  if (a.role === "super_admin") return "/admin";
  // Le propriétaire direct partage les écrans de l'espace agence dès le S2
  // (parcours communs du plan) ; ses écrans propres arrivent au S9
  if (["admin_agence", "agent", "proprietaire_direct"].includes(a.role))
    return a.organization ? `/agence/${a.organization.id}` : null;
  if (a.role === "locataire")
    return a.organization ? `/locataire/${a.organization.id}` : null;
  // L'artisan est le seul rôle SANS organisation dans son adresse : il
  // travaille pour plusieurs agences et son portail les réunit (RM-19.3.3 —
  // « agenda toutes agences confondues »). Une adhésion d'artisan ne sert
  // qu'à faire apparaître l'agence ici ; elle n'ouvre aucune donnée.
  if (a.role === "artisan") return "/artisan";
  return null; // espaces des sprints suivants

}

export default async function PageEspaces() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // La fiche artisan se lit EN PARALLÈLE des adhésions, pas après : l'artisan
  // qui s'est inscrit lui-même (pivot du 2026-09-04) n'a AUCUNE adhésion tant
  // qu'aucune agence ne l'a sollicité — son adhésion de navigation naît avec la
  // première demande de devis. Sans cette lecture, il arrivait sur « Aucun
  // accès actif » alors que sa fiche existe et attend d'être validée.
  const [{ data }, { data: artisan }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, organization:organizations(id, name)")
      .eq("account_id", user.id)
      .eq("status", "active"),
    supabase.rpc("mon_artisan"),
  ]);

  const adhesions = (data ?? []) as unknown as Adhesion[];
  // Une seule carte pour l'artisan, quel que soit le nombre d'agences : son
  // portail ne se décline pas par organisation, il les réunit. Autant de
  // cartes que d'agences mènerait trois fois à la même page.
  const adhesionsArtisan = adhesions.filter((a) => a.role === "artisan");
  const autresAdhesions = adhesions.filter((a) => a.role !== "artisan");
  const estArtisan =
    adhesionsArtisan.length > 0 || ((artisan ?? []) as unknown[]).length > 0;

  // Le super admin voit TOUTES les organisations (décision Tahir 09/09 :
  // « toutes les autorisations ») — une carte de supervision par espace,
  // en plus de sa console.
  const estSuperAdmin = adhesions.some((a) => a.role === "super_admin");
  const idsAdhesions = new Set(adhesions.map((a) => a.organization?.id).filter(Boolean));
  let supervision: { id: string; name: string; type: string; status: string }[] = [];
  let erreurSupervision = false;
  if (estSuperAdmin) {
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("id, name, type, status")
      .order("name");
    erreurSupervision = Boolean(error);
    supervision = (
      (orgs ?? []) as { id: string; name: string; type: string; status: string }[]
    ).filter((o) => !idsAdhesions.has(o.id));
  }

  // Locataire sorti (chantier D2) : l'adhésion désactivée garde un accès en
  // LECTURE à son espace — quittances, décompte de restitution, justificatifs.
  // La RLS ne livre pas le nom de l'organisation à une adhésion inactive :
  // il vient de la RPC de contexte.
  const { data: inactifsBruts } = await supabase
    .from("memberships")
    .select("id, organization_id")
    .eq("account_id", user.id)
    .eq("status", "inactive")
    .eq("role", "locataire");
  const anciens: { id: string; orgId: string; nom: string }[] = [];
  for (const m of (inactifsBruts ?? []) as { id: string; organization_id: string }[]) {
    const { data: ctx } = await supabase.rpc("mon_espace_locataire", {
      p_org: m.organization_id,
    });
    const nom = ((ctx ?? []) as { organisation_nom: string }[])[0]?.organisation_nom;
    if (nom) anciens.push({ id: m.id, orgId: m.organization_id, nom });
  }

  // S9a — un propriétaire qui vient de s'inscrire (immédiatement, ou via le
  // lien de confirmation reçu par email) n'a pas encore d'espace : on l'ouvre
  // ici, une fois pour toutes (fonction idempotente), puis on y entre.
  let erreurOuverture: string | null = null;
  if (
    adhesions.length === 0 &&
    !estArtisan &&
    user.user_metadata?.espace === "proprietaire_direct"
  ) {
    const { data: orgId, error } = await supabase.rpc("initialiser_espace_proprietaire");
    if (orgId) redirect(`/agence/${orgId}`);
    // Refus métier (ex. : adresse d'un mandant — exclusivité PD/PM) : dit tel quel
    erreurOuverture = error ? sansJargon(error.message) : null;
  }

  // L'artisan n'a qu'UNE destination, même avec trois adhésions : elles mènent
  // toutes à son portail, qui réunit les agences. Une page à une seule carte
  // n'apporterait rien — on y entre directement.
  if (estArtisan && autresAdhesions.length === 0 && anciens.length === 0 && !estSuperAdmin) {
    redirect("/artisan");
  }

  // Une seule adhésion (et pas d'ancien espace) : entrée directe — sauf le
  // super admin, qui choisit entre sa console et les espaces supervisés.
  // `!estArtisan` : un gérant qui est aussi artisan a deux destinations, même
  // si l'une d'elles ne tient pas encore à une adhésion.
  if (adhesions.length === 1 && !estArtisan && anciens.length === 0 && !estSuperAdmin) {
    const chemin = cheminEspace(adhesions[0]);
    if (chemin) redirect(chemin);
  }

  // Pop-up de synthèse à la connexion : mes alertes, toutes agences confondues
  const alertes = await chargerSyntheseAlertes(supabase);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Bandeau encre de la maquette, version nue : marque et sortie */}
      <header className="bg-[var(--encre)] text-[var(--sur-encre)]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3 sm:px-7">
          <MarqueGerimmo surEncre />
          <div className="flex items-center gap-4">
            <SyntheseAlertes alertes={alertes} surEncre rappel />
            <form action={seDeconnecter}>
              <button
                type="submit"
                className="text-[0.8125rem] text-[var(--sur-encre)]/75 hover:text-[var(--sur-encre)]"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-7">
        <p className="eyebrow mb-1.5">Un seul compte, tous vos espaces</p>
        <h1 className="mb-6">Mes espaces</h1>

        {adhesions.length === 0 && anciens.length === 0 && !estArtisan && (
          <p className="text-muted-foreground">
            {erreurOuverture
              ? `Votre espace propriétaire n'a pas pu être ouvert : ${erreurOuverture}`
              : "Aucun accès actif n'est associé à votre compte. Rapprochez-vous de votre agence."}
          </p>
        )}

        {erreurSupervision && (
          <p className="mb-2.5 text-sm text-muted-foreground">
            Impossible de charger les espaces supervisés — rechargez dans un
            instant.
          </p>
        )}

        <div className="grid gap-2.5">
          {/* L'artisan, en une carte : son portail est inter-agences, et les
              adhésions qu'il porte (une par agence qui l'a sollicité) mènent
              toutes au même endroit. Le nom d'une agence n'aurait pas de sens
              sur cette carte — elles y sont toutes. */}
          {estArtisan && (
            <Link href="/artisan">
              <span className="flex w-full items-center gap-3.5 border border-border bg-card px-4.5 py-4 text-left transition-all hover:translate-x-[3px] hover:border-[var(--encre)]">
                <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-[var(--encre)] text-[13px] text-[var(--or)]">
                  AR
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{LIBELLES.artisan}</span>
                  <span className="block text-xs text-muted-foreground">
                    {adhesionsArtisan.length > 0
                      ? `Mes missions et mes devis — ${adhesionsArtisan.length} agence${
                          adhesionsArtisan.length > 1 ? "s" : ""
                        }`
                      : "Mes missions et mes devis, toutes agences confondues"}
                  </span>
                </span>
              </span>
            </Link>
          )}
          {autresAdhesions.map((a) => {
            const chemin = cheminEspace(a);
            const initiales = (a.organization?.name ?? "Gerimmo")
              .split(/\s+/)
              .map((m: string) => m[0])
              .slice(0, 2)
              .join("")
              .toUpperCase();
            const carte = (
              <span
                className={`flex w-full items-center gap-3.5 border border-border bg-card px-4.5 py-4 text-left transition-all ${
                  chemin
                    ? "hover:translate-x-[3px] hover:border-[var(--encre)]"
                    : "opacity-60"
                }`}
              >
                <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-[var(--encre)] text-[13px] text-[var(--or)]">
                  {initiales}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {LIBELLES[a.role] ?? a.role}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {a.organization?.name ?? "Toute la plateforme"}
                    {!chemin && " — bientôt disponible"}
                  </span>
                </span>
              </span>
            );
            return chemin ? (
              <Link key={a.id} href={chemin}>
                {carte}
              </Link>
            ) : (
              <span key={a.id}>{carte}</span>
            );
          })}
          {supervision.map((o) => (
            <Link key={o.id} href={`/agence/${o.id}`}>
              <span className="flex w-full items-center gap-3.5 border border-border bg-card px-4.5 py-4 text-left transition-all hover:translate-x-[3px] hover:border-[var(--encre)]">
                <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-[var(--encre)] text-[13px] text-[var(--or)]">
                  {o.name
                    .split(/\s+/)
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {o.type === "proprietaire_direct"
                      ? "Espace propriétaire (supervision)"
                      : "Espace agence (supervision)"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {o.name}
                    {o.status === "suspendue" && " · suspendue"}
                    {o.status === "archivee" && " · archivée"}
                  </span>
                </span>
              </span>
            </Link>
          ))}
          {anciens.map((m) => (
            <Link key={m.id} href={`/locataire/${m.orgId}`}>
              <span className="flex w-full items-center gap-3.5 border border-border bg-card px-4.5 py-4 text-left opacity-80 transition-all hover:translate-x-[3px] hover:border-[var(--encre)]">
                <span className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-muted text-[13px] text-[var(--encre)]">
                  {m.nom
                    .split(/\s+/)
                    .map((x) => x[0])
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">Ancien espace locataire</span>
                  <span className="block text-xs text-muted-foreground">
                    {m.nom} — bail terminé, consultation seule (quittances, décompte)
                  </span>
                </span>
              </span>
            </Link>
          ))}
        </div>

        <p className="mt-4.5 text-xs text-muted-foreground">
          Le même compte peut porter plusieurs rôles : ce que vous voyez change
          avec l&apos;espace, pas avec l&apos;identifiant.
        </p>
      </main>
    </div>
  );
}
