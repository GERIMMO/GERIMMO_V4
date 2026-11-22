"use client";

import { useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { CalendarClock, CalendarOff } from "lucide-react";
import styles from "./entreprise.module.css";
import {
  declarerMonAbsence,
  enregistrerMaSemaineType,
  retirerMonAbsence,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { JOURS_SEMAINE, libelleAbsence, type AbsenceArtisan, type PlageJour } from "@/lib/semaine-type-artisan";
import {
  Carte,
  CLASSE_AIDE,
  CLASSE_BOUTON_SECONDAIRE,
  CLASSE_BOUTON_SOBRE,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  Erreur,
  Etiquette,
  Succes,
} from "../ui";

// AUDIT PALIER 1 DU 22/11/2026, P2-03 — les disponibilités de l'artisan.
//
// DEUX RÉGLAGES, QUI N'APPARTIENNENT QU'À LUI (aucune agence, aucun propriétaire ne les écrit) :
//  · ses ABSENCES : pendant une absence, aucun client ne peut lui envoyer de NOUVELLE demande, et l'écran du client dit
//    jusqu'à quand il est absent. Ce qui est en cours (demandes, devis, interventions) ne change pas ;
//  · sa SEMAINE TYPE : une plage par jour travaillé, qui ne sert qu'à préremplir les trois créneaux qu'il propose pour
//    une intervention. Elle ne réserve rien et personne d'autre ne la lit.

// Le bouton d'envoi commun (décision D30 B) : inerte tant que la page n'est pas prête, puis « Enregistrement… »
// pendant l'envoi. Un bouton écrit à la main, lui, laissait cliquer avant la fin du chargement sans rien faire.
function Enregistrer({ libelle, classe = CLASSE_BOUTON_SECONDAIRE }: { libelle: string; classe?: string }) {
  return <BoutonEnvoi className={classe} enCoursTexte="Enregistrement…">{libelle}</BoutonEnvoi>;
}

function RetraitAbsence({ absence }: { absence: AbsenceArtisan }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(retirerMonAbsence.bind(null, absence.id), {});
  return (
    <form data-saisie-confirmee action={action} className="flex flex-wrap items-center gap-2">
      <Enregistrer libelle="Retirer" classe={CLASSE_BOUTON_SOBRE} />
      <span className="sr-only">l’absence {libelleAbsence(absence)}</span>
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
    </form>
  );
}

export function AbsencesArtisan({ absences, aujourdhui }: { absences: AbsenceArtisan[]; aujourdhui: string }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(declarerMonAbsence, {});
  const [du, setDu] = useState("");
  return (
    <Carte className={styles.bloc}>
      <div className={styles.titreBloc}><span className={styles.icone}><CalendarOff size={19} aria-hidden /></span><div><h2>Mes absences</h2></div></div>
      <p className={CLASSE_AIDE}>
        Pendant une absence, aucun client ne peut vous envoyer de nouvelle demande : son écran lui indique jusqu’à quand
        vous êtes absent. Vos demandes, vos devis et vos interventions déjà en cours ne changent pas.
      </p>
      {absences.length === 0 ? (
        <p className="mt-4 text-[0.9375rem]" data-absences="aucune">Aucune absence déclarée.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--filet-leger)]" data-absences={absences.length}>
          {absences.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3" data-absence={a.en_cours ? "en-cours" : "a-venir"}>
              <span className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
                <span className="first-letter:uppercase">{libelleAbsence(a)}</span>
                {a.en_cours && <Etiquette ton="attente">En cours</Etiquette>}
              </span>
              <RetraitAbsence absence={a} />
            </li>
          ))}
        </ul>
      )}
      <form data-saisie-confirmee action={action} className="mt-5 space-y-4 border-t border-[var(--filet-leger)] pt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className={CLASSE_LIBELLE}>Premier jour d’absence</span>
            <input type="date" name="du" required min={aujourdhui} value={du} onChange={(e) => setDu(e.target.value)} className={CLASSE_CHAMP} /></label>
          <label className="space-y-1.5"><span className={CLASSE_LIBELLE}>Dernier jour d’absence</span>
            <input type="date" name="au" required min={du || aujourdhui} className={CLASSE_CHAMP} /></label>
        </div>
        {etat.succes && <Succes>{etat.succes}</Succes>}
        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
        <Enregistrer libelle="Déclarer cette absence" />
      </form>
    </Carte>
  );
}

export function SemaineTypeArtisan({ semaine }: { semaine: PlageJour[] }) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(enregistrerMaSemaineType, {});
  const [travailles, setTravailles] = useState<Record<number, boolean>>(() => Object.fromEntries(semaine.map((p) => [p.jour, true])));
  const plage = (jour: number) => semaine.find((p) => p.jour === jour);
  return (
    <Carte className={styles.bloc}>
      <div className={styles.titreBloc}><span className={styles.icone}><CalendarClock size={19} aria-hidden /></span><div><h2>Ma semaine type</h2></div></div>
      <p className={CLASSE_AIDE}>
        Cochez vos jours travaillés et vos horaires habituels. Quand vous proposez des créneaux pour une intervention,
        un bouton les préremplit à partir de cette semaine, en sautant vos absences. Elle ne réserve rien : vous relisez
        et vous envoyez vous-même.
      </p>
      <form data-saisie-confirmee action={action} className="mt-4 space-y-4">
        <ul className="divide-y divide-[var(--filet-leger)]">
          {JOURS_SEMAINE.map((nom, i) => {
            const jour = i + 1;
            const coche = Boolean(travailles[jour]);
            return (
              <li key={jour} className="grid grid-cols-[minmax(0,1fr)] items-center gap-3 py-3 sm:grid-cols-[10rem_minmax(0,1fr)]" data-jour-semaine={jour}>
                <label className="flex min-h-11 items-center gap-3 text-[0.9375rem] font-medium">
                  <input type="checkbox" name={`jour_${jour}`} checked={coche} onChange={(e) => setTravailles((t) => ({ ...t, [jour]: e.target.checked }))} className="size-5 shrink-0 accent-[var(--encre)]" />
                  {nom}
                </label>
                {coche ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1"><span className="block text-[0.8125rem] font-medium text-[var(--texte-secondaire)]">De<span className="sr-only"> — {nom}</span></span>
                      <input type="time" name={`debut_${jour}`} required defaultValue={plage(jour)?.debut ?? "08:00"} className={CLASSE_CHAMP} /></label>
                    <label className="space-y-1"><span className="block text-[0.8125rem] font-medium text-[var(--texte-secondaire)]">À<span className="sr-only"> — {nom}</span></span>
                      <input type="time" name={`fin_${jour}`} required defaultValue={plage(jour)?.fin ?? "18:00"} className={CLASSE_CHAMP} /></label>
                  </div>
                ) : (
                  <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">Non travaillé</p>
                )}
              </li>
            );
          })}
        </ul>
        {etat.succes && <Succes>{etat.succes}</Succes>}
        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
        <Enregistrer libelle="Enregistrer ma semaine type" />
      </form>
    </Carte>
  );
}
