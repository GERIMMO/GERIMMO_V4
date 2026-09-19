import { verifierAccesEspace } from "@/lib/espace";
import { ROLES_GERANTS, ROLES_RESPONSABLES } from "@/lib/ged";
import { FormulaireProfilOrganisation } from "./formulaire-profil";
import { FormulaireSignature } from "./formulaire-signature";
import { EncadreLectureImpossible, EnteteReglages } from "./famille-reglages";
import { signatureOrganisation } from "@/lib/documents/modeles/communs";
import {
  lienDeParrainage,
  libelleAvantage,
  PROMESSE_PARRAINAGE,
  type AvantageParrainage,
} from "@/lib/parrainage";
import { eur } from "@/lib/ged";
import { adresseDuSite } from "@/lib/site";

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
      "name, address_line1, postal_code, city, telephone, email_contact, siret, carte_pro, garantie_financiere, iban, tva_intracom, tva_franchise, quittances_envoi_auto, appels_envoi_auto, code_parrainage"
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
  const { data: roleMetier } = await supabase.rpc("has_org_role", { org: orgId, roles: ROLES_GERANTS });
  const apercuSignature = roleMetier ? await signatureOrganisation(supabase, orgId) : null;

  // Parrainage (19/09) : le code, le lien à partager, qui a été amené — et par
  // qui. La RLS ne rend que les rattachements où cette organisation est
  // parrain ou filleule ; on trie ici de quel côté elle est.
  const { data: parrainages } = await supabase
    .from("parrainages")
    .select(
      "parrain_organization_id, filleul_organization_id, parrain:organizations!parrainages_parrain_organization_id_fkey(name)"
    );
  const lignesParrainage = (parrainages ?? []) as unknown as {
    parrain_organization_id: string;
    filleul_organization_id: string;
    parrain: { name: string } | null;
  }[];
  const filleuls = lignesParrainage.filter((p) => p.parrain_organization_id === orgId).length;
  const monParrain =
    lignesParrainage.find((p) => p.filleul_organization_id === orgId)?.parrain?.name ?? null;
  const codeParrainage = (profil as { code_parrainage?: string | null }).code_parrainage ?? null;
  const site = adresseDuSite();

  // Ce que le parrainage a rapporté À CETTE organisation (19/09). La RLS ne
  // rend que ses propres lignes : un avantage ne se lit pas de l'extérieur.
  const { data: avantagesLus } = await supabase
    .from("avantages_parrainage")
    .select("nature, jours, montant_cents, etat")
    .order("created_at", { ascending: false });
  const mesAvantages = (avantagesLus ?? []) as unknown as AvantageParrainage[];

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
          <h3>Parrainage</h3>
          <span className="mono-discret">
            {filleuls} filleul{filleuls > 1 ? "s" : ""}
          </span>
        </div>
        <p className="mesure-lecture mb-3 text-sm text-muted-foreground">
          {PROMESSE_PARRAINAGE} Le mois du parrain s&apos;acquiert à la
          souscription du filleul, pas à son inscription.
        </p>
        {mesAvantages.length > 0 && (
          <ul className="mb-3 space-y-1">
            {mesAvantages.map((a, i) => (
              <li key={i} className="ligne-info">
                <span>{libelleAvantage(a, (cents) => eur(cents / 100))}</span>
                <span
                  className={`puce ${
                    a.etat === "applique"
                      ? "puce-loue"
                      : a.etat === "a_appliquer"
                        ? "puce-prep"
                        : "puce-grise"
                  }`}
                >
                  {a.etat === "applique"
                    ? "acquis"
                    : a.etat === "a_appliquer"
                      ? "en cours"
                      : "sans objet"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <div className="ligne-info">
            <dt className="text-muted-foreground">Votre code</dt>
            <dd className="montant font-semibold tracking-wider">{codeParrainage ?? "—"}</dd>
          </div>
          {monParrain && (
            <div className="ligne-info">
              <dt className="text-muted-foreground">Votre parrain</dt>
              <dd className="font-medium">{monParrain}</dd>
            </div>
          )}
        </dl>
        {site && codeParrainage && (
          <p className="mt-3 text-[13px] text-muted-foreground">
            Lien à partager :{" "}
            <code className="break-all text-[var(--corps)]">{lienDeParrainage(site, codeParrainage)}</code>
          </p>
        )}
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
        {roleMetier ? <FormulaireSignature
          orgId={orgId}
          apercu={apercuSignature}
          lectureSeule={!responsable}
        /> : <p className="rounded-lg bg-muted p-4 text-sm">La signature reste sous le contrôle du responsable de cette organisation. L’accès de supervision ne permet ni de la remplacer ni de l’apposer sur de nouveaux documents.</p>}
      </div>
    </main>
  );
}
