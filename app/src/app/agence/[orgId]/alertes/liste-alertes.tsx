"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cheminFicheAlerte as cheminFiche } from "@/lib/chemin-alerte";
import { estConfieeAMoi } from "@/lib/alertes";
import { afficherEcheance, dateDeReference } from "@/lib/echeances";
import { CRITICITES, formaterDateHeure } from "@/lib/ged";
import { Button, buttonVariants } from "@/components/ui/button";
import { IndicateurLien } from "@/components/ui/indicateur-lien";
import {
  ModaleAlerte,
  nomAssignation,
  type AlerteRang,
  type Membre,
} from "./modale-alerte";

export type { AlerteRang } from "./modale-alerte";

// Liste des alertes ouvertes (revue recette 08/08) : les miennes (nominatives
// ou « tout le monde ») actives en haut ; celles confiées à quelqu'un d'autre
// grisées en bas — on ne peut rien faire dessus. Le responsable garde la main
// partout. Le traitement passe par la modale (maquette) — SAUF les alertes
// incident : un incident se traite dans l'onglet Incidents, « Traiter » y
// emmène, positionné sur le dossier (recette 24/08).

/**
 * Ce qui arrive si personne ne fait rien — QUAND il y a quelque chose à dire.
 *
 * LE GABARIT DU 12/09 écrit une conséquence MÉTIER sous chaque alerte (« sans
 * attestation, le bail peut être résilié »). Il y faudrait une phrase juste par
 * type d'alerte — il y en a vingt-trois, et plusieurs portent des effets de
 * droit. Écrites à la va-vite, elles deviendraient des affirmations fausses sur
 * un écran que des professionnels croient. Elles viendront quand on les aura
 * écrites une par une, avec l'humain.
 *
 * EN ATTENDANT, LA LIGNE NE S'AFFICHE QUE SI ELLE PARLE DE CETTE ALERTE-LÀ.
 * Premier essai : y mettre la règle d'escalade. Au navigateur, elle donnait
 * seize fois « Non traitée sous 15 jours, elle remonte au responsable » — soit
 * exactement le défaut qu'on venait de corriger en retirant le « NORMALE ·
 * CONFIÉE À TOUT LE MONDE » répété. Une phrase identique sur tous les rangs
 * n'informe pas : elle allonge. La règle générale est donc redescendue en note
 * de bas de page, et cette ligne ne sert plus qu'à l'échéance, qui, elle,
 * distingue un rang d'un autre.
 */
function consequence(a: AlerteRang, reference: Date): string | null {
  const echeance = afficherEcheance(a.echeance, reference);
  if (!echeance) return null;
  if (echeance.depassee) {
    return a.criticite === "informative"
      ? `${echeance.texte} — pour information, elle ne remonte jamais.`
      : `${echeance.texte} — elle remonte au responsable de l’agence si elle reste ouverte.`;
  }
  return `${echeance.texte} pour la traiter.`;
}

export function ListeAlertes({
  orgId,
  alertes,
  membres,
  monCompte,
  estResponsable,
  estProprietaire = false,
  ouvrirAlerteId,
  aujourdhui,
  actionsAuDessus = 0,
}: {
  orgId: string;
  alertes: AlerteRang[];
  /** Date de Paris du serveur (« AAAA-MM-JJ ») : voir `dateDeReference`. */
  aujourdhui?: string;
  membres: Membre[];
  monCompte: string;
  estResponsable: boolean;
  estProprietaire?: boolean;
  // « Traiter » une alerte générique depuis un lien : la pop-up s'ouvre
  // d'emblée sur cette alerte.
  ouvrirAlerteId?: string;
  // Les rangs que la page affiche AU-DESSUS de cette table (baux à débloquer,
  // rapports à valider — 24/09) : sans alerte, on ne dit pas « journée
  // dégagée » sous une liste de choses à faire.
  actionsAuDessus?: number;
}) {
  const reference = dateDeReference(aujourdhui);
  const router = useRouter();
  const [filtre, setFiltre] = useState<string>("toutes");
  const [ouverte, setOuverte] = useState<AlerteRang | null>(null);
  // Les incidents étaient résolus ICI, à la main, en doublon de la même règle
  // recopiée dans la synthèse de connexion. `cheminFicheAlerte` les couvre
  // depuis le 19/09, avec les diagnostics et les attestations d'assurance.
  const ficheDe = (a: AlerteRang) => cheminFiche(a, orgId);
  // L'auto-ouverture se consomme UNE fois, puis le paramètre est retiré de
  // l'URL : sans cela, la revalidation qui suit le traitement remontait le
  // composant avec ?traiter= encore présent et rouvrait une modale périmée
  // (recette 23/08, constaté en production). Réinitialisation pilotée par
  // l'URL, pas un état dérivé du rendu — même idiome que l'assistant personnes.
  /* eslint-disable react-hooks/set-state-in-effect */
  const consomme = useRef<string | null>(null);
  useEffect(() => {
    if (!ouvrirAlerteId) {
      consomme.current = null;
      return;
    }
    if (consomme.current === ouvrirAlerteId) return;
    consomme.current = ouvrirAlerteId;
    const cible = alertes.find((a) => a.id === ouvrirAlerteId);
    window.history.replaceState(null, "", window.location.pathname);
    if (!cible) return;
    // Une alerte qui a un lieu de traitement (incident, fiche, bail) y emmène
    // — sinon le lien profond depuis « Mes espaces » ne faisait plus rien
    // (audit de vérification 06/09) ; les autres ouvrent la modale.
    const fiche = cheminFiche(cible, orgId);
    if (fiche) {
      router.push(fiche);
      return;
    }
    if (estConfieeAMoi(cible, monCompte) || estResponsable) {
      setOuverte(cible);
    }
  }, [ouvrirAlerteId, alertes, monCompte, estResponsable, orgId, router]);
  // Le geste abouti solde l'alerte en base et la revalidation arrive dans le
  // MÊME commit React que le succès : la règle sûre est qu'une alerte qui a
  // quitté la liste ferme sa modale (recette 23/08, constaté en production).
  useEffect(() => {
    if (ouverte && !alertes.some((a) => a.id === ouverte.id)) setOuverte(null);
  }, [alertes, ouverte]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filtrees =
    filtre === "toutes" ? alertes : alertes.filter((a) => a.criticite === filtre);
  const miennes = filtrees.filter((a) => estConfieeAMoi(a, monCompte));
  const autres = filtrees.filter((a) => !estConfieeAMoi(a, monCompte));

  // Le compte vit sur la pastille : on n'ouvre pas un filtre pour découvrir
  // qu'il ne contient rien.
  const pastille = (cle: string, libelle: string) => {
    const nb =
      cle === "toutes" ? alertes.length : alertes.filter((a) => a.criticite === cle).length;
    return (
      <button
        type="button"
        className={`filtre inline-flex items-center justify-center gap-1.5 ${filtre === cle ? "actif" : ""}`}
        aria-pressed={filtre === cle}
        onClick={() => setFiltre(cle)}
      >
        {libelle} <span className="mono-discret">{nb}</span>
      </button>
    );
  };

  // TOUT LE RANG EST CLIQUABLE (24/09, « je veux que tout le carré soit
  // cliquable ») : le rang s'éclairait au survol mais seul le petit bouton
  // menait quelque part. Le geste principal du rang — « Traiter », ou
  // « Confier / traiter » pour le responsable sur une alerte grisée — étend
  // sa zone de clic au rang entier par une surcouche (`after:inset-0`, le rang
  // est `relative`) ; le bouton secondaire passe au-dessus (`relative z-10`).
  // `translate-none` n'est pas décoratif : l'enfoncement de 1 px des boutons
  // ferait du bouton le repère de sa propre surcouche pendant l'appui — elle
  // se rétracterait sous le pointeur et le clic, relâché ailleurs, se perdrait.
  const surcouche = "after:absolute after:inset-0 active:not-aria-[haspopup]:translate-none";

  const rang = (a: AlerteRang, grisee: boolean) => {
    const fiche = ficheDe(a);
    // Le contexte (`details.libelle`) est souvent déjà dans le titre — « État
    // des lieux d'entrée — Lot · Locataire » puis « Lot · Locataire » : il ne
    // s'affiche que s'il apprend quelque chose (24/09).
    const libelle =
      typeof a.details?.libelle === "string" && !a.titre.includes(a.details.libelle)
        ? a.details.libelle
        : null;
    return (
      <div
        key={a.id}
        className={`rang-alerte relative flex-wrap gap-y-2 ${grisee ? "grisee" : a.criticite === "critique" ? "critique" : a.criticite === "normale" ? "normale" : ""}`}
      >
        {/* Sous 640 px, le texte prend toute la largeur et les boutons passent
            dessous : à côté d'eux, il s'écrasait sur 150 px (24/09). */}
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          {/* Le niveau en ÉTIQUETTE, et l'objet de l'alerte en premier poids.
              Avant le 12/09, « NORMALE · CONFIÉE À TOUT LE MONDE » s'affichait
              au même poids que le titre, à l'identique sur chaque rang : la
              seule chose qui distinguait deux alertes était la plus discrète. */}
          <span className="etiquette-alerte">
            {CRITICITES[a.criticite] ?? a.criticite}
          </span>
          <div className="mt-1.5 text-[14.5px] font-semibold">{a.titre}</div>
          {/* Le contexte que l'alerte transporte (recette 21/08 : treize
              « État des lieux à réaliser » identiques, illisibles).
              Deux lignes plutôt qu'une coupe nette : sur un téléphone,
              `truncate` réduisait « Doublon possible : un incident du même
              type… » à « Doublon possible : un i… », qui n'apprend rien. */}
          {libelle && (
            <div className="line-clamp-2 text-[13px] text-muted-foreground">
              {libelle}
            </div>
          )}
          {consequence(a, reference) && (
            <div className="consequence-alerte">{consequence(a, reference)}</div>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            créée le {formaterDateHeure(a.created_at)} · confiée à{" "}
            {nomAssignation(a, membres)}
          </div>
          {/* Une rangée grisée sans bouton laissait croire à une panne : on
              dit pourquoi elle est intouchable, et qui peut agir. */}
          {grisee && (
            <p className="mt-1 text-xs text-muted-foreground">
              {estResponsable
                ? "Confiée à un collègue : en tant que responsable, vous pouvez la confier à quelqu’un d’autre ou la traiter à sa place."
                : "Confiée à un collègue : lui seul la traite. Un responsable peut la confier à quelqu’un d’autre si besoin."}
            </p>
          )}
        </div>
        {/* Une alerte grisée est intouchable — seul le responsable peut la
            rouvrir pour la confier à un autre ou la traiter à la place d'un absent.
            Une alerte incident emmène au dossier, dans l'onglet Incidents. */}
        {(!grisee || estResponsable) &&
          (fiche && !grisee ? (
            <span className="flex shrink-0 items-center gap-2.5">
              <Link
                href={fiche}
                // Le nom accessible dit QUELLE alerte : le lien couvre le rang.
                aria-label={`Traiter : ${a.titre}`}
                className={buttonVariants({
                  variant: a.criticite === "critique" ? "destructive" : "outline",
                  size: "sm",
                  // 44 px au doigt, comme le bouton voisin (--cible-tactile) :
                  // min-h-10 écrasait la règle tactile de la charte (24/09).
                  className: `pointer-coarse:min-h-11 ${surcouche}`,
                })}
              >
                Traiter
                <IndicateurLien />
              </Link>
              {/* La modale reste atteignable : confier à quelqu'un, ou clore
                  une alerte dont le geste n'aura jamais lieu (LRAR jamais
                  envoyée, pièce vérifiée hors ligne…) — audit 06/09.
                  Libellé visible : le title ne se découvre pas au tactile.
                  « Confier », le verbe de la modale et du rang (24/09) —
                  « Assigner » en était un second, et taisait « clore ». */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="relative z-10"
                aria-label="Confier ou clore l'alerte"
                title="Confier ou clore l'alerte"
                onClick={() => setOuverte(a)}
              >
                Confier / clore
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant={!grisee && a.criticite === "critique" ? "destructive" : "outline"}
              size="sm"
              className={surcouche}
              onClick={() => setOuverte(a)}
            >
              {grisee ? "Confier / traiter" : "Traiter"}
            </Button>
          ))}
      </div>
    );
  };

  return (
    <div>
      {/* Pas de filtres au-dessus d'une liste vide : quatre pastilles à zéro
          ne filtraient rien et menaient à un second état vide (24/09).
          Deux par rangée sous 640 px : en flux, « Informatives » restait
          seule sur sa ligne — même motif que les filtres d'Incidents. */}
      {alertes.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          {pastille("toutes", "Toutes")}
          {pastille("critique", "Critiques")}
          {pastille("normale", "Normales")}
          {pastille("informative", "Informatives")}
        </div>
      )}

      {miennes.length === 0 && autres.length === 0 ? (
        <div className="vide-guide">
          <p className="titre">
            {filtre !== "toutes"
              ? "Aucune alerte à ce niveau"
              : actionsAuDessus > 0
                ? "Aucune alerte ouverte"
                : "Votre journée est dégagée"}
          </p>
          <p className="explication">
            {filtre !== "toutes"
              ? "Le filtre est peut-être trop étroit — les autres niveaux, eux, ont peut-être de quoi faire."
              : actionsAuDessus > 0
                ? "Ce qui vous attend est listé au-dessus ; Gerimmo posera ici les alertes dès qu’il y aura autre chose à faire."
              : /* Les exemples (« diagnostic périmé, état des lieux… ») et
                   « ce qui ne rentre pas dans ces cases » sont dits par la
                   carte « Créer une alerte », juste à côté (24/09). */
                "Gerimmo pose les alertes tout seul : elles s’afficheront ici dès qu’il y aura quelque chose à faire."}
          </p>
          {filtre !== "toutes" && (
            <span className="geste">
              <Button type="button" variant="outline" size="sm" onClick={() => setFiltre("toutes")}>
                Voir toutes les alertes
              </Button>
            </span>
          )}
        </div>
      ) : (
        <div className="colonne-liste">
          {miennes.map((a) => rang(a, false))}
          {autres.length > 0 && (
            <div className="tete-groupe">
              <span className="libelle-champ">Confiées à d&apos;autres</span>
              <span className="libelle-champ">{autres.length}</span>
            </div>
          )}
          {autres.map((a) => rang(a, true))}
        </div>
      )}

      {!estProprietaire && <p className="mt-3.5 text-xs text-muted-foreground">
        Une alerte critique non traitée sous 7 jours remonte au responsable de
        l&apos;agence, une normale sous 15 jours. Les informatives ne remontent
        jamais.
      </p>}

      {ouverte && (
        <ModaleAlerte
          orgId={orgId}
          alerte={ouverte}
          membres={membres}
          estResponsable={estResponsable}
          aujourdhui={aujourdhui}
          fermer={() => setOuverte(null)}
        />
      )}
    </div>
  );
}
