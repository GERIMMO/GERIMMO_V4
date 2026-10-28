import type { VersionDevis } from "../../acces";
import { dateSimple, euros } from "../../libelles";
import { Carte, CLASSE_AIDE, Etiquette, LigneInfo, TitreSection } from "../../ui";

/** Ce qu'il est advenu de chaque version, dans les mots de l'artisan (décision D18, livraison 2). */
const ETATS_VERSION: Record<VersionDevis["statut"], { libelle: string; ton: "neutre" | "encre" | "attente" | "alerte" | "ok" }> = {
  depose: { libelle: "Envoyée, en attente de décision", ton: "encre" },
  retenu: { libelle: "Retenue", ton: "ok" },
  non_retenu: { libelle: "Non retenue", ton: "neutre" },
  expire: { libelle: "Expirée", ton: "neutre" },
  annule: { libelle: "Annulée", ton: "neutre" },
  refuse: { libelle: "Refusée par le client", ton: "neutre" },
  revise: { libelle: "Révision demandée par le client", ton: "attente" },
};

/**
 * L'historique des versions du devis de l'artisan sur une demande (décision D18, livraison 2), en lecture seule :
 * montant, dates, ce qui changeait, et la décision du client avec son texte. Rien d'un concurrent : la base ne rend
 * que ses propres versions (`mes_versions_devis`). Une seule version et aucune révision : rien à montrer de plus que
 * la carte « Ma réponse ».
 */
export function VersionsPrecedentes({
  sollicitationId,
  versions,
  erreur,
  versionCourante,
}: {
  sollicitationId: string;
  versions: VersionDevis[];
  erreur: boolean;
  /** La version en cours de préparation (en révision) : elle n'est pas dans l'historique ; null si la demande est close. */
  versionCourante: number | null;
}) {
  if (erreur) {
    return (
      <Carte>
        <TitreSection>Versions précédentes</TitreSection>
        <p className={CLASSE_AIDE}>L’historique de vos versions n’a pas pu être lu. Rechargez la page dans un instant.</p>
      </Carte>
    );
  }
  const anciennes = versions.filter((v) => v.statut === "revise" || versions.length > 1);
  if (anciennes.length === 0) return null;
  return (
    <Carte>
      <TitreSection>{anciennes.length > 1 ? `Vos versions (${anciennes.length})` : "Votre version précédente"}</TitreSection>
      <p className={CLASSE_AIDE}>
        Chaque version reste au dossier. Seule la dernière peut être retenue par le client
        {versionCourante ? ` ; la version ${versionCourante + 1} est en préparation.` : "."}
      </p>
      <ol className="space-y-3">
        {anciennes.map((v) => {
          const etat = ETATS_VERSION[v.statut] ?? { libelle: "État à vérifier", ton: "neutre" as const };
          return (
            <li key={v.devis_id} className="rounded-lg border-2 border-[var(--filet)] p-3.5" data-version-devis={v.version}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-base font-semibold">Version {v.version}</p>
                <Etiquette ton={etat.ton}>{etat.libelle}</Etiquette>
              </div>
              <div className="mt-2">
                <LigneInfo libelle="Montant">{euros(v.montant_ttc_cents)} TTC</LigneInfo>
                <LigneInfo libelle="Envoyée le">{dateSimple(v.depose_le)}</LigneInfo>
                <LigneInfo libelle="Valable jusqu’au">{dateSimple(v.valide_jusqu_au)}</LigneInfo>
                {v.decide_le && (
                  <LigneInfo libelle={v.decision === "revision" ? "Révision demandée le" : "Décision du client le"}>{dateSimple(v.decide_le)}</LigneInfo>
                )}
              </div>
              {v.note_revision && (
                <p className="mt-2 whitespace-pre-wrap break-words text-[0.9375rem]">Ce qui changeait&nbsp;: « {v.note_revision} »</p>
              )}
              {v.decision_motif && (
                <p className="mt-2 whitespace-pre-wrap break-words text-[0.9375rem]">
                  {v.decision === "revision" ? "Ce que le client demandait" : "Motif du client"} : « {v.decision_motif} »
                </p>
              )}
              <a href={`/api/devis/${sollicitationId}/pdf?version=${v.version}`} target="_blank" rel="noreferrer" className="lien-discret">Ouvrir le PDF de la version {v.version}</a>
            </li>
          );
        })}
      </ol>
    </Carte>
  );
}
