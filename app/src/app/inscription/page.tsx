import { CoquilleAuth } from "@/components/coquille-auth";
import { codeDeLaRecherche } from "@/lib/parrainage";
import { FormulaireInscription } from "./formulaire-inscription";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";

export const metadata = metadonneesPubliques({
  titre: "Ouvrir mon espace propriétaire — Gerimmo",
  description:
    "Créez votre compte Gerimmo et gérez vos locations en direct : baux, quittances, incidents, états des lieux. Essai gratuit de 2 mois, sans carte bancaire.",
  chemin: "/inscription",
});

// Auto-inscription du propriétaire bailleur en gestion directe (S9a) : la
// seule porte d'entrée publique — une agence, elle, est créée par le super
// admin après contrat. Même coquille que les trois autres portes.
//
// Depuis le 19/09, la porte accepte un code de parrainage : tapé, ou porté par
// le lien `/inscription?parrain=…` que le parrain a partagé (wiki : Parrainage).
export default async function PageInscription(props: PageProps<"/inscription">) {
  const codeParrain = codeDeLaRecherche((await props.searchParams) as Record<string, string | string[] | undefined>);
  return (
    <CoquilleAuth
      promesse="Gérez vos locations vous-même, au carré."
      sousPromesse="Vos lots, vos baux, vos quittances, votre livre recettes-dépenses et l'aide à la déclaration des revenus fonciers — partout en France, sans agence, sans commission. Le réseau d’artisans dépend de la commune du bien et du métier disponible."
      mention="2 mois d'essai, sans carte bancaire"
      titre="Ouvrir mon espace propriétaire"
      // La réassurance « sans carte bancaire » passe dans le chapo (24/09) : la
      // mention du panneau est masquée sur téléphone, où elle n'apparaissait pas.
      chapo={"Un compte, votre parc, 2 mois pour l'essayer — sans\u00a0carte\u00a0bancaire."}
      largeur="380px"
    >
      <FormulaireInscription codeParrain={codeParrain} />
    </CoquilleAuth>
  );
}
