import { PLAFOND_IA_MAXIMUM, PLAFOND_IA_PAR_DEFAUT, USAGES_IA } from '@/lib/plafond-ia';
import { nomArret } from '@/lib/nom-arret-supervision';
import { formaterDateHeureParis } from '@/lib/heure-paris';
import { FormulaireLimiteIA } from './limite-ia-formulaire';

export type ReglageLimiteIA = { plafond_jour: number; modifie_le: string; modifie_par: string | null };

const appels = (n: number) => `${n} appel${n > 1 ? 's' : ''}`;
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Décision X19 (SA-10) : la limite quotidienne des appels payants à l'IA et le compteur du jour de Paris, avec ce que
 * l'arrêt d'urgence retient. Composant synchrone : la page lit les données (une lecture illisible = `lisible` faux).
 */
export function LimiteAppelsIA({ reglage, jour, lisible, auteur }: {
  reglage: ReglageLimiteIA | null;
  jour: { appels: number; refus: number } | null;
  lisible: boolean;
  auteur: string | null;
}) {
  const plafond = lisible ? reglage?.plafond_jour ?? null : null;
  const accordes = jour?.appels ?? 0;
  const refus = jour?.refus ?? 0;
  return (
    <section id="limite-ia" className="loc-carte scroll-mt-6 space-y-4">
      <h2 className="text-xl font-semibold">Appels payants à l’intelligence artificielle</h2>
      <p>
        Avant chaque appel payant à l’IA, y compris ceux lancés à la main, Gerimmo consulte l’arrêt d’urgence, puis la
        limite quotidienne ci-dessous, comptée sur le jour de Paris. Sous arrêt, ou une fois la limite atteinte, l’appel
        n’a pas lieu et l’écran ou la tâche concernée le dit. Un appel parti compte, même s’il échoue ; un appel arrêté
        ou refusé ne compte pas.
      </p>
      {plafond === null ? (
        <p role="alert" className="err">
          La limite et le compteur du jour ne peuvent pas être lus actuellement. Tant que ce contrôle est indisponible,
          aucun appel payant à l’IA ne part.
        </p>
      ) : (
        <p>
          <strong>Aujourd’hui : {appels(accordes)} sur {plafond} permis.</strong>
          {refus > 0 && ` ${appels(refus)} ${refus > 1 ? 'n’ont' : 'n’a'} pas eu lieu, faute de place.`}
          {plafond === 0 && ' La limite est à 0 : aucun appel payant à l’IA ne part.'}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Limite par défaut : {PLAFOND_IA_PAR_DEFAUT} appels par jour. Elle se règle de 0 à{' '}
        {PLAFOND_IA_MAXIMUM.toLocaleString('fr-FR')} ; à 0, plus aucun appel payant ne part.{' '}
        {reglage?.modifie_par
          ? `Dernier réglage le ${formaterDateHeureParis(reglage.modifie_le)}${auteur ? ` par ${auteur}` : ''}.`
          : 'Valeur par défaut, jamais modifiée.'}
      </p>
      <details>
        <summary className="cursor-pointer font-semibold">Les appels concernés et les arrêts qui les retiennent</summary>
        <ul className="mt-3 space-y-2 text-sm">
          {Object.entries(USAGES_IA).map(([cle, u]) => (
            <li key={cle}>
              <b>{majuscule(u.libelle)}</b> — arrêté par « {nomArret('global')} »
              {u.arret ? ` et par « ${nomArret(u.arret)} »` : ''}.
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Un lancement de l’atelier compte pour un appel, quelle que soit la durée de son travail. Un lancement fait
          directement depuis GitHub, hors de Gerimmo, n’est ni compté ni arrêté.
        </p>
      </details>
      <FormulaireLimiteIA plafond={plafond} />
    </section>
  );
}
