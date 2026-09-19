import { CoquilleAuth } from "@/components/coquille-auth";
import { codeDeLaRecherche } from "@/lib/parrainage";
import { FormulaireInscription } from "./formulaire-inscription";

export const metadata = { title: "Ouvrir mon espace propriétaire — Gerimmo" };

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
      sousPromesse="Vos lots, vos baux, vos quittances, votre livre recettes-dépenses et l'aide à la déclaration des revenus fonciers — sans agence, sans commission."
      mention="14 jours d'essai, sans carte bancaire"
      titre="Ouvrir mon espace propriétaire"
      chapo="Un compte, votre parc, 14 jours pour l'essayer."
      largeur="380px"
    >
      <FormulaireInscription codeParrain={codeParrain} />
    </CoquilleAuth>
  );
}
