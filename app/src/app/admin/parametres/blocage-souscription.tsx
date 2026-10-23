"use client";

import Link from "next/link";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { reglerBlocageSouscription } from "@/app/actions/reglage-souscription";

/**
 * `manquants` : les faits REQUIS absents, seuls à fermer le paiement ; `aCompleter` : ceux du médiateur, qui ne
 * ferment rien (lib/editeur.ts, A_COMPLETER). Relecture du 23/10 : sans `aCompleter`, la carte disait « L’identité
 * est complète » alors que la carte voisine comptait le médiateur « à compléter ».
 */
export function BlocageSouscription({ actif, revision, manquants, aCompleter }: {
  actif: boolean; revision: number | null; manquants: string[]; aCompleter: string[];
}) {
  const [etat, action, pending] = useActionState(reglerBlocageSouscription, {});
  return (
    <section className="loc-carte space-y-4" aria-labelledby="regle-souscription">
      <div className="entete-carte">
        <h2 id="regle-souscription">Blocage des abonnements</h2>
        <span className={`puce ${actif ? "puce-prep" : "puce-loue"}`}>Règle {actif ? "active" : "levée"}</span>
      </div>
      <p className="text-sm">
        {actif
          ? "Les informations légales requises manquantes bloquent les nouvelles souscriptions et les augmentations payantes. Le médiateur, à compléter, ne bloque rien."
          : "Les souscriptions et augmentations payantes peuvent continuer même si des informations légales manquent."}
      </p>
      {manquants.length > 0
        ? <p className="text-sm text-[var(--texte-secondaire)]">À compléter : {manquants.join(", ")}. Lever ce blocage ne complète pas les mentions légales.</p>
        : aCompleter.length > 0
          ? <p className="text-sm text-[var(--texte-secondaire)]">L’identité requise est complète ; le médiateur reste à compléter et ne bloque rien. Cette règle ne bloque actuellement aucune souscription.</p>
          : <p className="text-sm text-[var(--texte-secondaire)]">L’identité est complète : cette règle ne bloque actuellement aucune souscription.</p>}
      <p className="text-sm text-[var(--texte-secondaire)]">Les contrôles Stripe, les montants, la confirmation du client et l’acceptation des conditions restent obligatoires. Aucun paiement n’est déclenché par ce bouton.</p>
      {revision === null
        ? <p role="alert" className="err">Réglage indisponible. Rechargez la page avant de modifier.</p>
        : <form action={action} data-saisie-confirmee>
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="blocage" value={actif ? "lever" : "activer"} />
          <BoutonEnvoi variant={actif ? "default" : "outline"} size="lg" enCours={pending} enCoursTexte="Enregistrement…">
            {actif ? "Lever le blocage" : "Réactiver le blocage"}
          </BoutonEnvoi>
        </form>}
      {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
      {etat.succes && <p role="status">{etat.succes}</p>}
      <Link className="lien-discret inline-block" href="/admin/journaux?registre=supervision_identite">Historique des changements →</Link>
    </section>
  );
}
