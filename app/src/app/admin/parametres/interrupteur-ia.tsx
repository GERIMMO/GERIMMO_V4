"use client";

import Link from "next/link";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerIAActive } from "@/app/actions/plafond-ia";
import { EQUIVALENTS_MANUELS_IA, type EtatIA } from "@/lib/etat-ia";

/**
 * Interrupteur IA (mission palier 1, 22/11/2026) : un seul geste pour couper toute l'IA, le reste de Gerimmo
 * continuant de fonctionner. `active` : le réglage enregistré (null = illisible) ; `etat` : ce que les écrans
 * constatent (activée, désactivée, ou activée mais non connectée au fournisseur) ; `motif` : pourquoi aucun appel ne
 * peut partir de ce serveur (clé absente, ou mode pilote), le cas échéant.
 */
export function InterrupteurIA({ active, etat, motif = null }: { active: boolean | null; etat: EtatIA; motif?: "cle" | "pilote" | null }) {
  const [retour, action, pending] = useActionState(reglerIAActive, {});
  return (
    <section className="loc-carte space-y-4" aria-labelledby="titre-interrupteur-ia" data-interrupteur-ia={active === null ? "illisible" : active ? "activee" : "desactivee"}>
      <div className="entete-carte">
        <h2 id="titre-interrupteur-ia">Fonctions assistées par l’IA</h2>
        <span className={`puce ${active === false ? "puce-prep" : "puce-loue"}`}>{active === null ? "État indisponible" : active ? "IA activée" : "IA désactivée"}</span>
      </div>
      {active === null ? (
        <p role="alert" className="err">Le réglage de l’IA ne peut pas être lu. Il est visible par un superviseur permanent, avec sa double vérification. Rechargez la page avant de le modifier.</p>
      ) : active ? (
        <p className="text-sm">
          Les fonctions assistées sont proposées dans les espaces. Vous pouvez les couper d’un geste : tout le reste de
          Gerimmo continue de fonctionner, et chaque écran propose alors la saisie manuelle.
        </p>
      ) : (
        <p className="text-sm">
          Aucun appel à l’IA ne part, et rien n’est compté. Chaque écran propose la saisie manuelle ; les tâches
          planifiées continuent sans leur partie assistée, sans être signalées en panne.
        </p>
      )}
      {active === true && etat === "non_connectee" && (
        <p className="text-sm text-[var(--texte-secondaire)]" data-ia-non-connectee={motif ?? "cle"}>
          {motif === "pilote"
            ? "Ce serveur est en mode pilote : les opérations payantes externes y sont suspendues. L’assistant, la lecture de documents, la proposition de devis et les tâches planifiées n’appellent donc pas l’IA, et les écrans proposent déjà la saisie manuelle. Seules l’analyse du brief et la rédaction d’un article, dans la console, restent possibles."
            : "La connexion au fournisseur d’IA n’est pas en place sur ce serveur : aucun appel ne peut partir, et les écrans proposent déjà la saisie manuelle."}
        </p>
      )}
      <details>
        <summary className="cursor-pointer font-semibold">Les dix fonctions concernées et ce qui les remplace</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {EQUIVALENTS_MANUELS_IA.map((f) => (
            <li key={f.fonction}><b>{f.fonction}</b> ({f.pour}) — {f.manuel}</li>
          ))}
        </ul>
      </details>
      {active !== null && (
        <form action={action} data-saisie-confirmee>
          <input type="hidden" name="ia" value={active ? "desactiver" : "activer"} />
          <BoutonEnvoi variant={active ? "outline" : "default"} size="lg" enCours={pending} enCoursTexte="Enregistrement…">
            {active ? "Désactiver l’IA" : "Réactiver l’IA"}
          </BoutonEnvoi>
        </form>
      )}
      {retour.erreur && <p role="alert" className="err">{retour.erreur}</p>}
      {retour.succes && <p role="status">{retour.succes}</p>}
      <p className="text-sm text-[var(--texte-secondaire)]">
        La limite quotidienne des appels reste réglable dans{" "}
        <Link className="lien-discret" href="/admin/relais#limite-ia">Relais en mon absence</Link>. Une seule chose échappe
        à ce réglage : l’atelier de corrections lancé directement depuis GitHub, hors de Gerimmo. Il se coupe dans les
        réglages du dépôt GitHub (variable <code>GERIMMO_CODEX_ENABLED</code>).
      </p>
    </section>
  );
}
