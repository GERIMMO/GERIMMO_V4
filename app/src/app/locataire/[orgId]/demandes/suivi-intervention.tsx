"use client";

import { useActionState, useId, useState } from "react";
import {
  choisirMonCreneau,
  noterMonIntervention,
  proposerMesCreneaux,
} from "@/app/actions/incidents-locataire";
import type { EtatIncidentAction } from "@/app/actions/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CRENEAUX_MINIMUM, DEMI_JOURNEES } from "./creneaux";

// ════════════════════════════════════════════════════════════════════════════
// LE SUIVI DE L'INTERVENTION, DANS LA CARTE DE LA DEMANDE
//
// Ce que le locataire vient chercher ici, c'est une réponse à « où ça en
// est ? ». L'état de l'incident seul ne la donne pas : « Un artisan s'en
// occupe » couvre indifféremment la semaine où on cherche encore et le jour où
// le rendez-vous est pris. L'étape réelle vient de mon_suivi_intervention
// (migration 20260911183000).
//
// IL N'APPROUVE RIEN. Pas de devis, pas de montant, pas d'artisan à valider :
// « ni le locataire ni Gerimmo n'approuvent l'intervention » (module 8). Le
// seul geste qu'on lui demande est sa disponibilité — et, une fois le travail
// fait, son avis (RM-11.1, facultatif et jamais bloquant). Chaque mot de cet
// écran est écrit pour ne pas laisser croire l'inverse : on lui dit que son
// gestionnaire compare les devis, pas qu'il attend son accord.
//
// Gabarit de référence : le TÉLÉPHONE, 390 px. Les cibles font 44 px au
// minimum (module 19 : mains sales ou gantées), rien ne déborde en largeur, et
// les trois disponibilités se donnent en date + demi-journée plutôt qu'en six
// sélecteurs date-heure (voir ./creneaux.ts).
// ════════════════════════════════════════════════════════════════════════════

export type SuiviIntervention = {
  incident_id: string;
  etape: string;
  intervention_id: string | null;
  artisan: string | null;
  nb_artisans_consultes: number;
  nb_devis_recus: number;
  rdv_debut: string | null;
  rdv_fin: string | null;
  terminee_le: string | null;
  creneaux_a_choisir: number;
  mes_creneaux_en_attente: number;
  creneaux_refuses: number;
  arbitrage: boolean;
  travaux_realises: string | null;
  nouvelle_intervention_necessaire: boolean;
  photos_apres: string[];
  deja_notee: boolean;
};

export type CreneauPropose = {
  creneau_id: string;
  intervention_id: string;
  debut: string;
  fin: string;
  artisan_raison_sociale: string | null;
};

// « jeudi 24 septembre » — le locataire retient un jour, pas une date au
// format court. La zone est celle de Paris : Vercel tourne en UTC, et sans
// fuseau un rendez-vous de 8 h s'affichait daté de la veille (audit 09/09).
function jourLong(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
}

function heure(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    })
    .replace(":", " h ")
    .replace(/ 00$/, "");
}

function plage(debut: string, fin: string): string {
  return `${jourLong(debut)}, ${heure(debut)} – ${heure(fin)}`;
}

// Les quatre repères du parcours, du signalement au travail fait. Chaque étape
// réelle se range sous l'un d'eux : c'est le fil que le locataire lit d'un
// coup d'œil, avant même de lire la phrase.
const RAILS = ["Artisan recherché", "Artisan retenu", "Rendez-vous", "Réalisée"] as const;

const RAIL_DE_L_ETAPE: Record<string, number> = {
  recherche: 0,
  devis_recus: 0,
  reaffectation: 0,
  artisan_retenu: 1,
  creneaux_attendus: 1,
  creneau_a_choisir: 1,
  ma_proposition: 1,
  planifiee: 2,
  en_cours: 2,
  terminee: 3,
};

/** L'étape réelle, dans les mots du locataire — jamais le vocabulaire interne. */
function enMots(s: SuiviIntervention, peutAgir: boolean): { titre: string; detail: string } {
  const artisan = s.artisan ?? "L'artisan";
  // RM-10.4.1 : passé six créneaux refusés, « le problème n'est plus
  // logistique mais relationnel » — le gérant règle par téléphone et l'artisan
  // ne propose plus. Continuer à écrire « il va vous proposer des créneaux »
  // serait faux : c'est justement ce qui n'arrivera plus.
  if (s.arbitrage && (s.etape === "creneaux_attendus" || s.etape === "ma_proposition")) {
    return {
      titre: "Votre gestionnaire va vous appeler",
      detail:
        "Plusieurs créneaux n'ont pas convenu de part et d'autre : le rendez-vous se fixe désormais avec lui, par téléphone.",
    };
  }
  switch (s.etape) {
    case "recherche":
      return {
        titre: "Nous cherchons un artisan",
        detail:
          s.nb_artisans_consultes > 0
            ? `${s.nb_artisans_consultes} artisan${s.nb_artisans_consultes > 1 ? "s" : ""} consulté${s.nb_artisans_consultes > 1 ? "s" : ""} — votre gestionnaire attend leur devis.`
            : "Votre gestionnaire consulte des artisans pour cette réparation.",
      };
    case "devis_recus":
      return {
        titre: `${s.nb_devis_recus} devis reçu${s.nb_devis_recus > 1 ? "s" : ""}`,
        detail:
          "Votre gestionnaire les compare et choisit l'artisan. Vous n'avez rien à valider.",
      };
    case "reaffectation":
      return {
        titre: "L'artisan retenu s'est désisté",
        detail:
          "Votre demande reste ouverte : votre gestionnaire en cherche un autre. Vous n'avez rien à faire.",
      };
    case "artisan_retenu":
      return {
        titre: "Un artisan est retenu",
        detail:
          "Il confirme sa venue. Vous recevrez ensuite des créneaux de rendez-vous à choisir.",
      };
    case "creneaux_attendus":
      return {
        titre: `${artisan} a accepté la mission`,
        detail: "Il va vous proposer des créneaux de rendez-vous — vous choisirez ici.",
      };
    case "creneau_a_choisir":
      return peutAgir
        ? {
            titre: "Choisissez votre rendez-vous",
            detail: `${artisan} propose ${s.creneaux_a_choisir} créneau${s.creneaux_a_choisir > 1 ? "x" : ""}.`,
          }
        : {
            // Bail terminé : la lecture reste, les gestes non — ne pas lui
            // demander de choisir ce qu'il n'a plus le droit de choisir.
            titre: "Des créneaux ont été proposés",
            detail: `${artisan} propose ${s.creneaux_a_choisir} créneau${s.creneaux_a_choisir > 1 ? "x" : ""} — voyez avec votre gestionnaire.`,
          };
    case "ma_proposition":
      return {
        titre: `Vos ${s.mes_creneaux_en_attente} disponibilités sont transmises`,
        detail: `${artisan} doit confirmer l'une d'elles. Vous n'avez rien à faire d'ici là.`,
      };
    case "planifiee":
      return {
        titre: s.rdv_debut && s.rdv_fin ? `Rendez-vous ${plage(s.rdv_debut, s.rdv_fin)}` : "Rendez-vous fixé",
        detail: `${artisan} intervient chez vous. Prévoyez d'être présent, ou de faire ouvrir.`,
      };
    case "en_cours":
      return {
        titre: "Intervention en cours",
        detail: `${artisan} a démarré. Son compte rendu s'affichera ici dès qu'il l'aura déposé.`,
      };
    case "terminee":
      return {
        titre: s.terminee_le
          ? `Intervention réalisée le ${jourLong(s.terminee_le)}`
          : "Intervention réalisée",
        detail: s.nouvelle_intervention_necessaire
          ? "L'artisan signale qu'un second passage sera nécessaire — votre gestionnaire s'en occupe."
          : "Voici ce que l'artisan a fait.",
      };
    default:
      return { titre: "Votre demande avance", detail: "" };
  }
}

// ── Le fil des quatre repères ───────────────────────────────────────────────
function Fil({ rail }: { rail: number }) {
  return (
    <ol className="mt-1 list-none">
      {RAILS.map((libelle, i) => (
        <li key={libelle} className={`loc-etape ${i <= rail ? "f" : ""}`}>
          <span className="pt" aria-hidden="true" />
          <span>
            {libelle}
            {i === rail && <span className="sr-only"> — étape en cours</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

// ── Choisir l'un des créneaux de l'artisan (RM-10.2.1) ─────────────────────
function ChoixDuCreneau({
  orgId,
  creneaux,
  interventionId,
  arbitrage,
}: {
  orgId: string;
  creneaux: CreneauPropose[];
  interventionId: string | null;
  // RM-10.4.1 : passé six refus, c'est le gérant qui fixe le rendez-vous par
  // téléphone. On cesse alors de réclamer une septième contre-proposition.
  arbitrage: boolean;
}) {
  const idGroupe = useId();
  const [contre, setContre] = useState(false);
  const [etatChoix, actionChoix] = useActionState<EtatIncidentAction, FormData>(
    choisirMonCreneau.bind(null, orgId),
    {}
  );
  const [etatContre, actionContre] = useActionState<EtatIncidentAction, FormData>(
    proposerMesCreneaux.bind(null, orgId, interventionId ?? ""),
    {}
  );

  if (etatChoix.succes) {
    return <p className="mt-2 text-sm text-success-soft-foreground">{etatChoix.succes}</p>;
  }
  if (etatContre.succes) {
    return <p className="mt-2 text-sm text-success-soft-foreground">{etatContre.succes}</p>;
  }

  return (
    <div className="mt-2.5">
      {etatChoix.erreur && (
        <p className="err !mb-2" role="alert">
          {etatChoix.erreur}
        </p>
      )}

      {creneaux.length > 0 && (
        <form action={actionChoix}>
          <fieldset className="border-0 p-0">
            <legend className="mb-1.5 text-sm font-medium">
              Quel créneau vous arrange&nbsp;?
            </legend>
            <div className="space-y-1.5">
              {creneaux.map((c, i) => (
                <div key={c.creneau_id}>
                  <input
                    type="radio"
                    id={`${idGroupe}-c${i}`}
                    name="creneau"
                    value={c.creneau_id}
                    required
                    // Aucun créneau coché d'avance : confirmer un rendez-vous
                    // est un engagement, il se prend d'un geste voulu. Le
                    // navigateur réclame le choix avant d'envoyer.
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`${idGroupe}-c${i}`}
                    className="min-h-11 w-full cursor-pointer rounded-[10px] border border-input px-3 py-2.5 text-sm font-normal peer-checked:border-[var(--or)] peer-checked:bg-[var(--ardoise)] peer-checked:font-medium peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]"
                  >
                    {plage(c.debut, c.fin)}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>
          <BoutonEnvoi enCoursTexte="Confirmation…" size="lg" className="mt-2.5 min-h-11 w-full">
            Confirmer ce rendez-vous
          </BoutonEnvoi>
        </form>
      )}

      {arbitrage ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Plusieurs créneaux n&apos;ont pas convenu&nbsp;: c&apos;est maintenant votre
          gestionnaire qui fixe le rendez-vous avec vous, par téléphone.
        </p>
      ) : !contre ? (
        <button
          type="button"
          onClick={() => setContre(true)}
          // .lien-discret ne pose pas de display : sans inline-flex, la hauteur
          // minimale ne s'applique pas et la cible retombe à la taille du texte.
          className="lien-discret mt-2.5 inline-flex min-h-11 items-center"
        >
          Aucun ne me convient — proposer mes disponibilités
        </button>
      ) : (
        <form action={actionContre} className="mt-2.5">
          {etatContre.erreur && (
            <p className="err !mb-2" role="alert">
              {etatContre.erreur}
            </p>
          )}
          <fieldset className="border-0 p-0">
            <legend className="text-sm font-medium">Vos disponibilités</legend>
            <p className="mb-2 text-xs text-muted-foreground">
              Donnez-en {CRENEAUX_MINIMUM} : l&apos;artisan en retiendra une. Sans cela,
              le rendez-vous ne peut pas avancer.
            </p>
            <div className="space-y-3">
              {Array.from({ length: CRENEAUX_MINIMUM }, (_, i) => (
                <div key={i} className="flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`${idGroupe}-d${i}`} className="mb-1 text-xs">
                      Date {i + 1}
                    </Label>
                    <input
                      type="date"
                      id={`${idGroupe}-d${i}`}
                      name={`date-${i}`}
                      required
                      defaultValue={etatContre.valeurs?.[`date-${i}`]}
                      className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Label htmlFor={`${idGroupe}-m${i}`} className="mb-1 text-xs">
                      Moment {i + 1}
                    </Label>
                    <select
                      id={`${idGroupe}-m${i}`}
                      name={`moment-${i}`}
                      defaultValue={etatContre.valeurs?.[`moment-${i}`] ?? "matin"}
                      className="h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      {DEMI_JOURNEES.map((d) => (
                        <option key={d.valeur} value={d.valeur}>
                          {d.libelle} ({d.plage})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <BoutonEnvoi enCoursTexte="Envoi…" size="lg" className="min-h-11">
              Envoyer mes disponibilités
            </BoutonEnvoi>
            <button
              type="button"
              onClick={() => setContre(false)}
              className="lien-discret inline-flex min-h-11 items-center"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Le compte rendu, la photo, et l'avis (RM-7.5.2 / RM-11.1) ──────────────
function TravailFait({
  orgId,
  suivi,
  peutAgir,
}: {
  orgId: string;
  suivi: SuiviIntervention;
  peutAgir: boolean;
}) {
  const idNote = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(
    noterMonIntervention.bind(null, orgId, suivi.intervention_id ?? ""),
    {}
  );

  return (
    <div className="mt-2.5 space-y-2.5">
      {suivi.travaux_realises && (
        <div className="rounded-[10px] bg-[var(--filet-leger)] p-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Compte rendu de {suivi.artisan ?? "l'artisan"}
          </p>
          <p className="mt-1 whitespace-pre-line">{suivi.travaux_realises}</p>
        </div>
      )}

      {/* RM-7.5.2 : la photo du travail réalisé conditionne la fin de
          l'intervention. Elle est ici parce que c'est sur elle que le
          locataire juge — et parce que c'est son logement.

          UN LIEN, PAS UNE VIGNETTE, pour deux raisons qui vont dans le même
          sens. (1) La route /documents/[id]/fichier TRACE chaque accès avant
          de servir l'octet (RM-0b.7.5) : une vignette chargée d'office
          inscrirait au journal d'opposabilité une « consultation » à chaque
          affichage de la liste, y compris pour une demande simplement
          survolée — un journal où tout est consulté ne prouve plus rien.
          (2) Elle téléchargerait la photo entière (≈ 1600 px après la
          compression de lib/compresser-image) pour l'afficher en 96 px, sur
          le réseau de cage d'escalier que le module 19 prend justement pour
          hypothèse. Au doigt, une photo se regarde en plein écran de toute
          façon. */}
      {suivi.photos_apres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suivi.photos_apres.map((doc, i) => (
            <a
              key={doc}
              href={`/locataire/${orgId}/documents/${doc}/fichier`}
              target="_blank"
              rel="noopener"
              className={`min-h-11 ${buttonVariants({ variant: "outline", size: "lg" })}`}
            >
              {suivi.photos_apres.length > 1
                ? `Voir la photo ${i + 1} du travail réalisé`
                : "Voir la photo du travail réalisé"}
            </a>
          ))}
        </div>
      )}

      {etat.succes ? (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      ) : suivi.deja_notee ? (
        <p className="text-xs text-muted-foreground">
          Merci, votre avis sur cette intervention est enregistré.
        </p>
      ) : peutAgir && suivi.intervention_id ? (
        <form action={action}>
          {etat.erreur && (
            <p className="err !mb-2" role="alert">
              {etat.erreur}
            </p>
          )}
          <fieldset className="border-0 p-0">
            <legend className="text-sm font-medium">
              Votre avis sur l&apos;intervention
            </legend>
            {/* RM-11.1 : il note ce qu'il a vu sur place. Ni le prix, ni la
                technique — on ne lui fait pas juger ce qu'il n'a ni payé ni
                vu faire (la base le lui interdit d'ailleurs). Facultatif :
                rien ici ne bloque son espace (RM-11.1.3/4). */}
            <p className="mb-2 text-xs text-muted-foreground">
              Facultatif — 1 = très insatisfait, 5 = très satisfait.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n}>
                  <input
                    type="radio"
                    id={`${idNote}-n${n}`}
                    name="note"
                    value={n}
                    required
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`${idNote}-n${n}`}
                    className="h-11 w-11 cursor-pointer justify-center rounded-full border border-input text-base font-normal peer-checked:border-[var(--or)] peer-checked:bg-[var(--ardoise)] peer-checked:font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring)]"
                  >
                    {n}
                  </Label>
                </div>
              ))}
            </div>
            <Label htmlFor={`${idNote}-c`} className="mt-2.5 mb-1 text-xs">
              Un mot sur l&apos;intervention (facultatif)
            </Label>
            <textarea
              id={`${idNote}-c`}
              name="commentaire"
              rows={2}
              defaultValue={etat.valeurs?.commentaire}
              className="w-full rounded-md border border-input bg-transparent px-2.5 py-1.5 text-sm"
            />
          </fieldset>
          <BoutonEnvoi enCoursTexte="Envoi…" variant="outline" size="lg" className="mt-2 min-h-11">
            Envoyer mon avis
          </BoutonEnvoi>
        </form>
      ) : null}
    </div>
  );
}

export function SuiviInterventionLocataire({
  orgId,
  suivi,
  creneaux,
  peutAgir,
}: {
  orgId: string;
  suivi: SuiviIntervention;
  /** Les créneaux que l'artisan propose sur CETTE intervention. */
  creneaux: CreneauPropose[];
  /** Adhésion active : bail terminé, la lecture reste, les gestes non. */
  peutAgir: boolean;
}) {
  const rail = RAIL_DE_L_ETAPE[suivi.etape] ?? 0;
  const { titre, detail } = enMots(suivi, peutAgir);

  return (
    <div className="mt-1 border-t border-[var(--filet-leger)] pt-2.5">
      <p className="text-sm font-medium">{titre}</p>
      {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}

      <Fil rail={rail} />

      {suivi.etape === "creneau_a_choisir" && peutAgir && (
        <ChoixDuCreneau
          orgId={orgId}
          creneaux={creneaux}
          interventionId={suivi.intervention_id}
          arbitrage={suivi.arbitrage}
        />
      )}

      {suivi.etape === "terminee" && (
        <TravailFait orgId={orgId} suivi={suivi} peutAgir={peutAgir} />
      )}
    </div>
  );
}
