import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { CRITICITES, COULEURS_CRITICITE, formaterDateHeure, ROLES_RESPONSABLES } from "@/lib/ged";
import { estConfieeAMoi } from "@/lib/alertes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireAlerte } from "./formulaire-alerte";
import { ListeAlertes, type AlerteRang } from "./liste-alertes";

export const metadata = { title: "Alertes — Gerimmo" };

// L'historique n'est pas paginé : on en montre les plus récentes, et la carte
// le dit plutôt que de laisser croire qu'il n'y a que celles-là.
const FERMEES_AFFICHEES = 30;

export default async function PageAlertes(
  props: PageProps<"/agence/[orgId]/alertes">
) {
  const { orgId } = await props.params;
  // « Traiter » depuis le tableau de bord ou la cloche (recette 22/08) : la
  // pop-up de traitement de cette alerte s'ouvre à l'arrivée sur la page.
  const { traiter } = await props.searchParams;
  const traiterId = typeof traiter === "string" ? traiter : undefined;
  const { supabase, user, role, organisation } = await verifierAccesEspace(orgId);
  const estResponsable = ROLES_RESPONSABLES.includes(role);

  // Trois lectures indépendantes : en parallèle plutôt qu'en cascade
  const [
    { data: ouvertes, error: erreurOuvertes },
    { data: fermees, error: erreurFermees },
    { data: donneesMembres, error: erreurMembres },
  ] = await Promise.all([
      supabase
        .from("alerts")
        .select(
          "id, type, criticite, titre, echeance, created_at, assignee_account_id, assigned_all, escalades, details"
        )
        .eq("organization_id", orgId)
        .eq("statut", "ouverte")
        .order("criticite", { ascending: false })
        .order("echeance", { ascending: true, nullsFirst: false }),
      supabase
        .from("alerts")
        .select("id, type, criticite, titre, closed_at, closed_action, closed_by, origine_type")
        .eq("organization_id", orgId)
        .eq("statut", "fermee")
        .order("closed_at", { ascending: false })
        .limit(FERMEES_AFFICHEES),
      supabase.rpc("org_membres_gerants", { org: orgId }),
    ]);
  const membres = (donneesMembres ?? []) as {
    account_id: string;
    email: string;
    role: string;
  }[];

  const rangs = (ouvertes ?? []) as AlerteRang[];
  const nbMiennes = rangs.filter((a) => estConfieeAMoi(a, user.id)).length;
  const nbCritiques = rangs.filter((a) => a.criticite === "critique").length;

  // PAR QUOI COMMENCER — la phrase du bandeau (gabarit du 12/09). L'écran
  // ouvrait sur le mot « Alertes » et un compteur en mono de 11 px : il disait
  // COMBIEN, jamais par quoi s'y prendre.
  const parQuoi = erreurOuvertes
    ? "La liste n’a pas pu être lue — ce n’est pas une journée sans alerte."
    : rangs.length === 0
      ? "Rien à traiter. Gerimmo repose les alertes tout seul, chaque nuit."
      : nbCritiques > 0
        ? `${nbCritiques} critique${nbCritiques > 1 ? "s" : ""} — à faire en premier.`
        : "Rien de critique : il ne reste que du courant.";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-7">
      <p className="mb-2 text-sm text-muted-foreground">
        <Link href={`/agence/${orgId}`} className="hover:underline">
          {organisation.name}
        </Link>{" "}
        / Alertes
      </p>
      <div className="bandeau-jour mb-6">
        <p className="mono-discret text-[var(--sur-encre)]/60">Plan du jour</p>
        {/* Un <h1> reste un <h1> : le bandeau change son habillage, pas son
            rang dans le document. */}
        <h1 className="compte text-[var(--sur-encre)]">
          {erreurOuvertes
            ? "Alertes"
            : rangs.length === 0
              ? "Votre journée est dégagée"
              : `${rangs.length} alerte${rangs.length > 1 ? "s" : ""} à traiter`}
        </h1>
        <p className="par-quoi">{parQuoi}</p>
        {/* Le partage « pour vous / pour d'autres » ne se dit que s'il y a
            vraiment deux camps : « 0 confiée à d'autres » n'apprend rien. */}
        {!erreurOuvertes && rangs.length - nbMiennes > 0 && (
          <p className="par-quoi">
            {`${nbMiennes} pour vous · ${rangs.length - nbMiennes} confiée${
              rangs.length - nbMiennes > 1 ? "s" : ""
            } à d’autres`}
          </p>
        )}
      </div>

      {/* `min-w-0` SUR LES DEUX COLONNES, et ce n'est pas décoratif (mesure au
          navigateur, 12/09). Un élément de grille vaut `min-width: auto` par
          défaut : il refuse de devenir plus étroit que son contenu. Le `select`
          « Assigné à » prend la largeur de sa plus longue option — une adresse
          e-mail — et poussait la page à 469 px de large sur un téléphone de
          390. Le navigateur ne débordait pas : il DÉZOOMAIT, et tout l'écran
          se lisait 17 % plus petit que partout ailleurs. Le parc et le tableau
          de bord, eux, tenaient dans leurs 390 px. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          {/* Une lecture en échec ne se déguise pas en « aucune alerte » :
              l'écran vide et l'écran illisible ne disent pas la même chose. */}
          {erreurOuvertes ? (
            <p className="err" role="alert">
              Impossible de lire les alertes ouvertes — ce n&apos;est pas une
              liste vide, c&apos;est une lecture qui a échoué. Rechargez dans un
              instant.
            </p>
          ) : (
            <ListeAlertes
              orgId={orgId}
              alertes={rangs}
              membres={membres}
              monCompte={user.id}
              estResponsable={estResponsable}
              ouvrirAlerteId={traiterId}
            />
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fermées récemment</CardTitle>
              <CardDescription>
                Les {FERMEES_AFFICHEES} dernières. Conservées 1 an après
                fermeture (règle de conservation), puis purgées.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {erreurFermees ? (
                <p className="err mb-0" role="alert">
                  Impossible de lire l&apos;historique des alertes fermées —
                  rechargez dans un instant.
                </p>
              ) : (fermees ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune alerte fermée pour l&apos;instant.
                </p>
              ) : (
                <ul className="divide-y">
                  {(fermees ?? []).map((a) => (
                    <li key={a.id} className="space-y-0.5 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`badge-statut ${COULEURS_CRITICITE[a.criticite] ?? ""}`}>
                          {CRITICITES[a.criticite] ?? a.criticite}
                        </span>
                        <span className="font-medium">{a.titre}</span>
                        {/* Sprint « Alertes & documents » : le type et l'objet
                            d'origine se lisent sans ouvrir l'alerte */}
                        <span className="mono-discret">
                          {a.type}
                          {a.origine_type ? ` · ${a.origine_type}` : ""}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {/* Sans auteur : fermée par l'événement d'origine (29/08) */}
                        {a.closed_by ? "Fermée" : "Fermée automatiquement"} le{" "}
                        {formaterDateHeure(a.closed_at)} — « {a.closed_action} »
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Créer une alerte</CardTitle>
            <CardDescription>
              Gerimmo en crée déjà tout seul — diagnostic périmé, état des lieux
              à faire, rapport à valider. Servez-vous d&apos;ici pour ce qui ne
              rentre pas dans ces cases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Sans la liste des gérants, « Assigné à » serait vide et le
                formulaire refuserait l'envoi sans jamais dire pourquoi. */}
            {erreurMembres && (
              <p className="err" role="alert">
                Impossible de lire la liste des gérants — la création d&apos;une
                alerte est indisponible le temps que la lecture repasse.
              </p>
            )}
            <FormulaireAlerte
              orgId={orgId}
              membres={membres}
              estResponsable={estResponsable}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
