import Link from "next/link";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { FormulaireDeconnexion } from "@/components/formulaire-deconnexion";
import { PurgerCopiesAutresComptes } from "@/components/purger-copies-autres-comptes";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { type MarqueOrganisation as Marque } from "@/lib/marque-organisation";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import { interlocuteurDeLIdentite, type IdentiteContactLocataire } from "@/lib/identite-contact-locataire";
import { lireIdentiteContactLocataire } from "@/lib/interlocuteur-locataire-serveur";

/**
 * Phase 3, lot 61 — ce que /compte et /compte/donnees ont en commun.
 *
 * /compte/donnees n'avait ni bandeau, ni retour à « Mon espace », ni « Se déconnecter » (E021, E143), et ne disait pas
 * au locataire, comme /compte, que les demandes sur les données de SA LOCATION vont à son gestionnaire ou à son bailleur
 * (E019, E140). Les lectures, le bandeau et la phrase de renvoi étaient dans compte/page.tsx ; ils sont ici, déplacés
 * tels quels, pour que les deux écrans disent exactement la même chose.
 */

// LA MARQUE DU LOCATAIRE (25/09, D04). Cet écran est hors de tout espace, et
// il affichait le logo GERIMMO — au locataire d'une agence en marque blanche,
// qui ne doit jamais lire ce nom. Quand le compte n'a QUE des adhésions de
// locataire, l'en-tête et l'onglet portent la marque de son organisation ; un
// compte qui a aussi un espace agence ou propriétaire garde Gerimmo. Lu une
// fois par requête : la page et son titre en ont besoin.
export const lireMarqueLocataire = cache(async function lireMarqueLocataire(): Promise<Marque | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization_id")
    .eq("account_id", user.id)
    .eq("status", "active");
  const adhesions = (data ?? []) as { role: string; organization_id: string }[];
  // Une lecture tombée ne décide rien : on garde l'en-tête neutre.
  if (error || adhesions.length === 0 || adhesions.some((a) => a.role !== "locataire")) return null;
  return chargerMarque(supabase, adhesions[0].organization_id);
});

// L'espace locataire de la personne, quand elle n'en a qu'un et n'est que
// locataire (audit du 27/09) : « Mes espaces » lui coûtait un clic de plus
// pour revenir chez elle.
export const lireEspaceLocataire = cache(async function lireEspaceLocataire(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization_id")
    .eq("account_id", user.id)
    .eq("status", "active");
  const adhesions = (data ?? []) as { role: string; organization_id: string }[];
  if (error || adhesions.length !== 1 || adhesions[0].role !== "locataire") return null;
  return adhesions[0].organization_id;
});

// Lot 47 : à qui un compte de LOCATAIRE s'adresse depuis cet écran, hors de tout espace. « Votre gestionnaire » était
// faux pour le locataire d'un propriétaire qui gère lui-même. Une seule adhésion de locataire : son interlocuteur, lu
// comme le titre « Mon gestionnaire » / « Mon bailleur » de l'espace (même lecture, `lireIdentiteContactLocataire`) —
// « gestionnaire » seulement dans un espace d'agence. Plusieurs : on ne choisit pas, `identite` est nulle. Un compte
// sans adhésion de locataire (propriétaire, agence) : `null`, il garde le texte d'avant.
// Reprise : un compte qui est AUSSI locataire (propriétaire de son propre espace, par exemple) retombait sur « votre
// gestionnaire », comme un compte dont les adhésions ne se lisent pas ; son adhésion de locataire décide désormais, et
// une lecture en échec prend la tournure vraie dans tous les espaces (`identite` nulle).
export const lireContactCompteLocataire = cache(async function lireContactCompteLocataire(): Promise<{
  identite: IdentiteContactLocataire | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("memberships")
    .select("role, organization_id")
    .eq("account_id", user.id)
    .eq("status", "active");
  if (error) return { identite: null };
  const locataire = ((data ?? []) as { role: string; organization_id: string }[]).filter((a) => a.role === "locataire");
  if (locataire.length === 0) return null;
  if (locataire.length > 1) return { identite: null };
  return { identite: await lireIdentiteContactLocataire(supabase, locataire[0].organization_id) };
});

/** Le libellé et le dessin du lien vers /confidentialite, les mêmes sur /compte et /compte/donnees (E022, E144, E139) :
 *  souligné, et haut de 24 px au moins. */
export const LIEN_CONFIDENTIALITE = "lien-texte inline-flex min-h-6 items-center text-sm";

/** Le bandeau du compte : la marque, le retour à l'espace de la personne, la déconnexion. Les pages lui passent ce
 *  qu'elles ont déjà lu (`lireMarqueLocataire`, `lireEspaceLocataire`, la fiche d'artisan). */
export function BandeauCompte({
  compteId,
  marque,
  estArtisan,
  espaceLocataire,
}: {
  compteId: string;
  marque: Marque | null;
  /** Audit 27/09 : l'artisan n'a pas de « gestionnaire » ; on lui rend le chemin de son portail. */
  estArtisan: boolean;
  espaceLocataire: string | null;
}) {
  return (
      <header className="bandeau-appli">
        {/* Les deux liens ne se coupent pas sur deux lignes à 390 px (25/09,
            D28) : ils restent d'un tenant, c'est la marque qui cède la place. */}
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-7">
          {/* overflow-hidden : à 390 px, la marque débordait de sa boîte et
              touchait « Mes espaces » (audit du 27/09). */}
          <div className="min-w-0 max-w-[180px] overflow-hidden">
            {marque ? <MarqueOrganisation marque={marque} tuile /> : <MarqueGerimmo tuile />}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {estArtisan ? (
              <Link href="/artisan" className="lien-bandeau whitespace-nowrap">
                ← Espace artisan
              </Link>
            ) : espaceLocataire ? (
              <Link href={`/locataire/${espaceLocataire}`} className="lien-bandeau whitespace-nowrap">
                ← Mon espace
              </Link>
            ) : (
              <Link href="/espaces" className="lien-bandeau whitespace-nowrap">
                Mes espaces
              </Link>
            )}
            <PurgerCopiesAutresComptes compteId={compteId} />
            <FormulaireDeconnexion className="lien-bandeau whitespace-nowrap">
              Se déconnecter
            </FormulaireDeconnexion>
          </div>
        </div>
      </header>
  );
}

/**
 * À qui le locataire d'UN espace adresse une demande sur les données de sa location : la phrase de /compte (lot 47),
 * reprise mot pour mot sur /compte/donnees. Le délai et la qualité du bailleur particulier restent une question posée
 * au juriste (JURISTE.md, partie 5, point 18) : la formulation n'est pas modifiée ici.
 */
export function RenvoiDonneesLocation({ espace, identite }: { espace: string; identite: IdentiteContactLocataire }) {
  return (
    <>
      Pour tout ce qui concerne votre location, écrivez à votre {interlocuteurDeLIdentite(identite)} depuis{" "}
      <Link href={`/locataire/${espace}/contact`} className="lien-discret">
        {identite.titre}
      </Link>{" "}
      : c&apos;est lui qui y répond, sous un mois.
    </>
  );
}
