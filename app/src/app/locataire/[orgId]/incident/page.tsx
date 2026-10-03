import Link from "next/link";
import { NOTE_SIGNALEMENT_FERME, signalementOuvert } from "../types";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { ReflexesUrgence } from "../reflexes-urgence";
import { FormulaireIncidentLocataire } from "./formulaire-incident-locataire";

// Un seul nom pour la page (24/09) : le bouton qui y mène dit « Signaler un
// problème », le titre et l'onglet disaient « Nouveau signalement ».
export const metadata = { title: "Signaler un problème" };

// Déclaration d'incident par le locataire (module 7 + module 19) : deux
// colonnes façon maquette pLocDeclarer — le formulaire à gauche, l'encart
// adaptatif « Qui paiera la réparation » à droite (les deux cartes vivent dans
// FormulaireIncidentLocataire, l'encart suivant la catégorie choisie).
export default async function PageSignalerIncident(
  props: PageProps<"/locataire/[orgId]/incident">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const { data: baux, error: erreurBail } = await supabase.rpc("mon_bail_locataire", { p_org: orgId });
  const bailActif = adhesionActive && !erreurBail && signalementOuvert(baux as { etat: string }[] | null);
  // Bail en préparation (recette 03/10) : dire ce qui manque, pas seulement
  // « contactez votre gestionnaire ».
  const bailEnPreparation = !bailActif && ((baux ?? []) as { etat: string }[]).some((b) => b.etat === "brouillon");
  // Depuis la revue du 11/09 l'entrée de menu « Signaler un problème » mène
  // ici et non plus à la liste : le suivi doit rester à un clic, avec son
  // compte — sinon le raccourci ferait perdre l'accès à ce qu'on a déclaré.
  const { data: incidentsBruts } = await supabase.rpc("mes_incidents_locataire", {
    p_org: orgId,
  });
  const enCours = ((incidentsBruts ?? []) as { etat: string }[]).filter(
    (i) => i.etat !== "clos"
  ).length;

  return (
    <div className="space-y-4">
      {/* L'en-tête standard de l'espace (24/09) : titre, et le suivi à
          droite. Plus de fil d'Ariane — aucune autre page n'en a, le menu
          dit où l'on est. « Prévenu immédiatement » n'est plus dit qu'une
          fois, dans la carte d'urgence. */}
      <div className="entete-page">
        <h1>Signaler un problème</h1>
        <Link href={`/locataire/${orgId}/demandes`} className="lien-discret">
          Suivre mes demandes{enCours > 0 ? ` (${enCours} en cours)` : ""}{"\u00a0"}→
        </Link>
      </div>
      {bailActif && (
        <p className="text-sm text-muted-foreground">
          Vous saurez qui prend la réparation en charge après examen par votre
          gestionnaire.
        </p>
      )}

      {bailActif ? (
        <>
          <ReflexesUrgence />
          <FormulaireIncidentLocataire orgId={orgId} />
        </>
      ) : (
        <div className="loc-carte">
          <p className="text-sm text-muted-foreground">
            {erreurBail
              ? "Votre bail ne peut pas être vérifié pour le moment. Réessayez ou contactez votre gestionnaire."
              : bailEnPreparation
                ? `La déclaration nécessite un bail actif. ${NOTE_SIGNALEMENT_FERME}`
                : "La déclaration nécessite un bail actif. Contactez votre gestionnaire pour vérifier votre dossier."}{" "}
            Vos anciens signalements restent consultables dans{" "}
            <Link href={`/locataire/${orgId}/demandes`} className="lien-discret">
              Mes demandes
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
