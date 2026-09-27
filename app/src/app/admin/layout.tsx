import { PresenceSupervision } from "@/components/presence-supervision";
import Link from "next/link";
import { aujourdhuiParis } from "@/lib/ged";
import { BoutonMenuSupervision, ColonneSupervision, MenuSupervisionProvider, NavAdmin, OngletsSupervision } from "./nav-admin";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MenuCompte } from "@/components/menu-compte";
import { SyntheseAlertes } from "@/components/synthese-alertes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { chargerSyntheseAlertes } from "@/lib/alertes";
import { RechercheSupervision } from "@/components/recherche-supervision";
import { chargerDecisionsAttendues } from "@/lib/decisions-attendues";
import { faitsManquants } from "@/lib/editeur";

// La supervision reprend le repère latéral des espaces métier. Les actions de
// sécurité restent dans l'en-tête, visibles sur chaque écran.
// 24/09 : « Sécurité du compte » et « Se déconnecter » passent dans le menu du
// compte, le même que dans les espaces agence et locataire.
// 25/09 (audit C26, C6) : au téléphone, UNE barre — logo, menu, décisions,
// alertes, compte ; la recherche est dans le menu. Le badge « À décider » lit
// le même calcul que l'accueil et le point du matin.
export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const supabase = await createClient();
  const { data: estSuperAdmin } = await supabase.rpc("is_super_admin");
  if (!estSuperAdmin) redirect("/espaces");

  const [alertes, decisions, { data: utilisateur }] = await Promise.all([
    chargerSyntheseAlertes(supabase, { toutes: true }),
    chargerDecisionsAttendues(supabase, process.env, faitsManquants().length),
    supabase.auth.getUser(),
  ]);
  const courriel = utilisateur.user?.email ?? "";
  // Lecture en échec : pas de pastille plutôt qu'un zéro affirmé.
  const artisansEnAttente = decisions.artisans ?? 0;

  return (
    <MenuSupervisionProvider>
      {/* Sous 900 px, la colonne devient une rangée : elle garde la hauteur de son
          contenu et le corps prend le reste (24/09). */}
      {/* Ordinateur : colonne + corps. Téléphone : barre haute, puis le menu
          (seulement ouvert), puis le corps — un seul menu dans la page. */}
      <div className="admin-coquille min-[901px]:grid-rows-[auto_minmax(0,1fr)] max-[900px]:grid-rows-[auto_auto_minmax(0,1fr)]">
        <PresenceSupervision />
        <header className="bandeau-appli admin-bandeau min-[901px]:col-start-2 min-[901px]:row-start-1 max-[900px]:row-start-1">
          <div className="admin-bandeau-interieur">
            {/* « Supervision », le nom de la barre (24/09). Au téléphone, le
                logo prend sa place et le bouton du menu le suit. */}
            <Link href="/admin/brief" className="admin-contexte max-[900px]:hidden">
              Supervision
            </Link>
            <div className="admin-bandeau-actions w-full max-[640px]:flex-nowrap!">
              <Link href="/admin/brief" className="hidden shrink-0 max-[900px]:flex" aria-label="Accueil de la supervision">
                <MarqueGerimmo className="[&>span]:hidden" />
              </Link>
              <BoutonMenuSupervision />
              <RechercheSupervision masquerSousMobile />
              <Link href="/admin/brief" className="lien-bandeau ml-auto" aria-label={decisions.total > 0 ? `${decisions.total} décision${decisions.total > 1 ? "s" : ""} à prendre aujourd’hui` : "Aujourd’hui : rien à décider"}>
                <span className="max-[640px]:hidden">À décider</span>
                <span className={`puce ml-1.5 max-[640px]:ml-0 ${decisions.total > 0 ? "puce-prep" : "puce-grise"}`}>{decisions.total}</span>
              </Link>
              <SyntheseAlertes alertes={alertes} modeAdmin rappel aujourdhui={aujourdhuiParis()} />
              <MenuCompte
                initiales={(courriel[0] ?? "◇").toUpperCase()}
                titre={courriel || "Mon compte"}
                liens={[{ href: "/compte", libelle: "Sécurité du compte" }]}
              />
            </div>
          </div>
        </header>
        <ColonneSupervision>
          <Link href="/admin/brief" className="admin-marque max-[900px]:hidden!" aria-label="Accueil de la supervision">
            <MarqueGerimmo />
          </Link>
          <nav className="admin-nav" aria-label="Navigation de la supervision">
            <NavAdmin artisansEnAttente={artisansEnAttente} decisions={decisions.total} />
          </nav>
        </ColonneSupervision>
        <div className="admin-corps min-[901px]:col-start-2 min-[901px]:row-start-2 max-[900px]:row-start-3">
          <OngletsSupervision artisansEnAttente={artisansEnAttente} decisions={decisions.total} />
          {/* Le bas de page passe au-dessus du bouton flottant « Aide et
              retours » (24/09) : sans cette réserve, la dernière ligne restait
              dessous. */}
          <div className="portail-ecrans min-w-0 flex-1 pb-[calc(72px+env(safe-area-inset-bottom,0px))]">{children}</div>
        </div>
      </div>
    </MenuSupervisionProvider>
  );
}
