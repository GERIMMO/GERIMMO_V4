import { formaterDateHeureParis } from "@/lib/heure-paris";
import { PHRASE_CANAUX_RELAIS, PLAFOND_URGENCES_PAR_HEURE } from "@/lib/relais-urgences";
import {
  avertissementAdresses,
  descriptionRelais,
  relaisEnRetard,
  resultatPassageRelais,
  type AdressesRelais,
  type PassageRelais,
} from "@/lib/relais-alerte";

/**
 * L'alerte e-mail du relais, telle qu'elle est vraiment (D46-B, 15/10/2026) : vers combien d'adresses (masquées), ou
 * « relais non configuré » ; l'e-mail immédiat des urgences et l'e-mail quotidien de 5 h ; ce qu'ils signalent ; la date
 * et le résultat du dernier passage et du dernier envoi de 5 h.
 * Les adresses viennent du réglage du serveur : seule leur forme masquée arrive ici.
 */
export function AlerteEmailRelais({ adresses, passages }: { adresses: AdressesRelais; passages: PassageRelais[] | null }) {
  const dernier = passages?.[0] ?? null;
  const dernierEnvoi = passages?.find((p) => p.statut === "envoye" || p.statut === "envoi_partiel") ?? null;
  const avertissement = avertissementAdresses(adresses);
  return (
    <section id="alerte-email" className="loc-carte scroll-mt-6 space-y-3">
      <h2 className="text-xl font-semibold">Alerte e-mail du relais</h2>
      <p><strong>{descriptionRelais(adresses)}</strong></p>
      {avertissement && <p role="alert" className="err">{avertissement}</p>}
      {/* Décision du 15/10/2026 : envoi immédiat pour les urgences, en plus de l'e-mail quotidien de 5 h. */}
      {adresses.configure && <p><strong>{PHRASE_CANAUX_RELAIS}</strong></p>}
      <p className="text-sm">
        Une urgence est une alerte nouvelle du mode vacances : un passage à reprendre, une lecture bloquée, un responsable
        qui perd son habilitation ou un signalement fait à la main. Son e-mail immédiat part une seule fois, sans son texte,
        au plus {PLAFOND_URGENCES_PAR_HEURE} fois par heure : au-delà, les urgences suivantes partent groupées dans l’envoi
        suivant ou dans l’e-mail de 5 h, qui rappelle aussi les urgences des dernières 24 h, envoyées ou non.
      </p>
      <p className="text-sm">
        L’e-mail de 5 h signale, en nombres seulement : les alertes du mode vacances non accusées, les tâches planifiées en
        échec ou absentes sur les dernières 24 h, et l’arrêt d’urgence s’il est actif. Sans rien à signaler, aucun e-mail ne
        part. Ni l’un ni l’autre ne contient de nom ni de montant, et l’arrêt d’urgence ne les coupe pas : ce sont des
        alertes au dirigeant, sans effet sur les utilisateurs, et l’arrêt fait partie de ce qu’elles signalent.
      </p>
      {passages === null ? (
        <p role="alert" className="err">Le dernier passage du relais n’a pas pu être lu.</p>
      ) : (
        <div className="text-sm">
          <p>
            {dernier
              ? `Dernier passage : ${formaterDateHeureParis(dernier.termine_le ?? dernier.commence_le)} — ${resultatPassageRelais(dernier)}.`
              : "Aucun passage du relais enregistré pour l’instant."}
          </p>
          {dernier && dernierEnvoi && dernierEnvoi !== dernier && (
            <p>Dernier e-mail envoyé : {formaterDateHeureParis(dernierEnvoi.termine_le ?? dernierEnvoi.commence_le)} — {resultatPassageRelais(dernierEnvoi)}.</p>
          )}
          {adresses.configure && relaisEnRetard(dernier) && (
            <p className="err">Aucun passage du relais depuis plus de 26 heures : vérifiez la tâche planifiée « alerte du relais » chez l’hébergeur.</p>
          )}
        </div>
      )}
    </section>
  );
}
