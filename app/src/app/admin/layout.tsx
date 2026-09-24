import { PresenceSupervision } from "@/components/presence-supervision";
import Link from "next/link";
import { aujourdhuiParis } from "@/lib/ged";
import { NavAdmin } from "./nav-admin";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuCompte } from "@/components/menu-compte";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { RechercheSupervision } from "@/components/recherche-supervision";

// La supervision reprend le repère latéral des espaces métier. Les actions de
// sécurité restent dans l'en-tête, visibles sur chaque écran.
// 24/09 : « Sécurité du compte » et « Se déconnecter » passent dans le menu du
// compte, le même que dans les espaces agence et locataire. À 390 px, le
// bandeau tenait sur trois lignes (235 à 300 px avant le titre de la page) ;
// il tient désormais sur une seule.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const [alertes, { data: artisansAValider }, { data: utilisateur }] = await Promise.all([
    chargerSyntheseAlertes(supabase, { toutes: true }),
    supabase.rpc("artisans_a_valider"),
    supabase.auth.getUser(),
  ]);
  const courriel = utilisateur.user?.email ?? "";
  // Lecture en échec : pas de pastille plutôt qu'un zéro affirmé.
  const artisansEnAttente = Array.isArray(artisansAValider) ? artisansAValider.length : 0;

  return (
    // Sous 900 px, la colonne devient une rangée : elle garde la hauteur de son
    // contenu et le corps prend le reste (24/09). Sans rangées explicites, une
    // page courte laissait 45 à 160 px de vide entre les onglets et le bandeau.
    <div className="admin-coquille max-[900px]:grid-rows-[auto_minmax(0,1fr)]">
      <PresenceSupervision />
      <aside className="admin-late">
        <Link href="/admin" className="admin-marque" aria-label="Accueil de la supervision">
          <MarqueGerimmo />
        </Link>
        <nav className="admin-nav" aria-label="Navigation de la supervision">
          <NavAdmin artisansEnAttente={artisansEnAttente} />
        </nav>
      </aside>
      <div className="admin-corps">
        <header className="bandeau-appli admin-bandeau">
          <div className="admin-bandeau-interieur">
            {/* « Supervision », le nom de la barre et du titre (24/09). Sur
                téléphone, le logo et l'onglet allumé disent déjà où l'on est. */}
            <Link href="/admin" className="admin-contexte max-sm:hidden">
              Supervision
            </Link>
            <div className="admin-bandeau-actions">
              <RechercheSupervision />
              <SyntheseAlertes alertes={alertes} modeAdmin rappel aujourdhui={aujourdhuiParis()} />
              <MenuCompte
                initiales={(courriel[0] ?? "◇").toUpperCase()}
                titre={courriel || "Mon compte"}
                liens={[{ href: "/compte", libelle: "Sécurité du compte" }]}
              />
            </div>
          </div>
        </header>
        {/* Le bas de page passe au-dessus du bouton flottant « Aide et
            retours » (24/09) : sans cette réserve, la dernière ligne restait
            dessous. */}
        <aside role="status" className="mx-4 mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Les agents sont en pause.</strong>{" "}
          Aucun travail programmé ne démarre. La validation de chaque action est en préparation.{" "}
          <Link href="/admin/controle-agents" className="font-semibold underline">Comprendre ce qui est arrêté</Link>
        </aside>
        <div className="portail-ecrans min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom,0px))]">{children}</div>
      </div>
    </div>
  );
}
