import { CoquilleAuth } from "@/components/coquille-auth";
import { codeDeLaRecherche } from "@/lib/parrainage";
import { FormulaireInscription } from "./formulaire-inscription";
import { metadonneesPubliques } from "@/lib/metadonnees-publiques";
import { badgeEssai, dureeEssai } from "@/lib/tarifs";

export const revalidate = 3600;

export function generateMetadata() {
  return metadonneesPubliques({
    titre: "Ouvrir mon espace propriétaire — Gerimmo",
    description: `Créez votre compte Gerimmo et gérez vos locations en direct : baux, quittances, incidents, états des lieux. Essai gratuit de ${dureeEssai()}, sans carte bancaire.`,
    chemin: "/inscription",
  });
}

// Auto-inscription du propriétaire bailleur en gestion directe (S9a) : la
// seule porte d'entrée publique — une agence, elle, est créée par le super
// admin après contrat. Même coquille que les trois autres portes.
//
// Depuis le 19/09, la porte accepte un code de parrainage : tapé, ou porté par
// le lien `/inscription?parrain=…` que le parrain a partagé (wiki : Parrainage).
export default async function PageInscription(props: PageProps<"/inscription">) {
  const codeParrain = codeDeLaRecherche((await props.searchParams) as Record<string, string | string[] | undefined>);
  const duree = dureeEssai();
  return (
    <CoquilleAuth
      promesse="Vos locations, simplement."
      sousPromesse="L’essentiel de votre gestion locative, au même endroit."
      mention={`${duree} d'essai, sans carte bancaire`}
      titre="Ouvrir mon espace propriétaire"
      chapo={<>{badgeEssai()}, sans carte ni abonnement automatique.</>}
      largeur="420px"
    >
      <FormulaireInscription codeParrain={codeParrain} dureeEssai={duree} />
    </CoquilleAuth>
  );
}
