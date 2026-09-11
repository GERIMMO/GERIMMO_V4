import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_RESPONSABLES } from "@/lib/ged";
import { FormulaireProfilOrganisation } from "./formulaire-profil";
import { FormulaireSignature } from "./formulaire-signature";
import { EncadreLectureImpossible, EnteteReglages } from "./famille-reglages";
import { signatureOrganisation } from "@/lib/documents/modeles/communs";

export const metadata = { title: "Profil — Gerimmo" };

// Profil de l'organisation (sprint « Documents-0 ») : l'identité imprimée en
// en-tête et en pied de chaque document généré, et la commune du « Fait à ».
//
// Relevé 11/09 : la page se terminait par `if (!organisation) return null` —
// lecture en échec ou ligne masquée, l'écran ne rendait RIEN : ni titre, ni
// message, ni moyen de réessayer. Elle rend désormais son en-tête dans tous
// les cas, et distingue les deux causes.
export default async function PageProfil(props: PageProps<"/agence/[orgId]/profil">) {
  const { orgId } = await props.params;
  const { supabase, role, estProprietaire, organisation } = await verifierAccesEspace(orgId);
  const responsable = ROLES_RESPONSABLES.includes(role);
  const titre = estProprietaire ? "Mon profil" : "Profil de l'agence";

  const { data: profil, error: erreurProfil } = await supabase
    .from("organizations")
    .select(
      "name, address_line1, postal_code, city, telephone, email_contact, siret, carte_pro, garantie_financiere, iban"
    )
    .eq("id", orgId)
    .maybeSingle();

  if (erreurProfil || !profil) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
        <EnteteReglages titre={titre} mention={organisation.name} />
        <EncadreLectureImpossible
          titre={erreurProfil ? "Lecture impossible" : "Fiche introuvable"}
        >
          {erreurProfil
            ? "Votre fiche n'a pas pu être lue — elle n'est pas vide pour autant, et rien n'a été perdu. Rechargez la page dans un instant."
            : "Aucune fiche n'est accessible pour cette organisation depuis votre compte. Si vous venez de changer d'espace, revenez par « Mes espaces » ; sinon, signalez-le à votre administrateur."}
        </EncadreLectureImpossible>
      </main>
    );
  }

  // La signature préenregistrée, prête à prévisualiser (chantier documentaire)
  const apercuSignature = await signatureOrganisation(supabase, orgId);

  const manquants = [
    !profil.address_line1 && "adresse",
    !profil.city && "ville (le « Fait à » des documents)",
    !profil.email_contact && "email de contact",
    !profil.telephone && "téléphone",
  ].filter(Boolean) as string[];

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre={titre} mention={organisation.name}>
        Ces informations signent vos documents générés (bail, quittances, états
        des lieux…) : en-tête, pied de page et « Fait à ». Un champ vide reste
        en libellé dans le PDF.
      </EnteteReglages>

      {manquants.length > 0 && (
        <div className="border-l-[3px] border-l-warning bg-warning-soft p-3">
          <p className="text-sm text-warning-soft-foreground">
            À compléter pour des documents sans trous : {manquants.join(" · ")}.
          </p>
        </div>
      )}

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Identité</h3>
          {!responsable && <span className="puce puce-grise">lecture seule</span>}
        </div>
        {!responsable && (
          <p className="mesure-lecture mb-4 text-sm text-muted-foreground">
            Demandez à un responsable de l&apos;organisation pour modifier ces
            informations.
          </p>
        )}
        <FormulaireProfilOrganisation
          orgId={orgId}
          organisation={profil}
          lectureSeule={!responsable}
          estProprietaire={estProprietaire}
        />
      </div>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Signature préenregistrée</h3>
          {!responsable && <span className="puce puce-grise">lecture seule</span>}
        </div>
        <p className="mesure-lecture mb-4 text-sm text-muted-foreground">
          Apposée sur les documents que vous émettez seul — quittances, reçus,
          courriers. Jamais sur un bail ni un état des lieux : là, chacun signe.
        </p>
        <FormulaireSignature
          orgId={orgId}
          apercu={apercuSignature}
          lectureSeule={!responsable}
        />
      </div>
    </main>
  );
}
