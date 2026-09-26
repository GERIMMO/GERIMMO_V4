"use client";
import { InputDateJour } from "@/components/input-date-jour";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import {
  genererAppels,
  ajouterEncaissement,
  supprimerEncaissement,
  emettreQuittances,
  envoyerQuittance,
  reviserLoyer,
  ajouterRelance,
  supprimerRelance,
  regulariserCharges,
  type EtatLoyers,
} from "@/app/actions/loyers";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { eur, formaterDate } from "@/lib/ged";
import { STATUTS_APPEL_LOYER, COULEURS_STATUT_APPEL_LOYER } from "@/lib/baux";
import { ChampFichier } from "@/components/champ-fichier";

// Les modes de règlement qu'une agence rencontre vraiment. « autre » évite de
// bloquer quelqu'un sur un cas rare.
export const MODES_PAIEMENT: Record<string, string> = {
  virement: "Virement",
  cheque: "Chèque",
  prelevement: "Prélèvement",
  especes: "Espèces",
  caf: "CAF / APL",
  autre: "Autre",
};

export type LigneEcheance = {
  prorata?: boolean;
  appel_id: string;
  periode: string;
  date_echeance: string;
  montant_du: number;
  montant_couvert: number;
  statut: string;
};
export type Encaissement = {
  id: string;
  montant: number;
  date_paiement: string;
  mode: string | null;
  note: string | null;
};
export type Quittance = {
  id: string;
  appel_id: string;
  montant: number;
  date_emission: string;
  email_envoye_at: string | null;
  // Paiement intégral → quittance ; paiement partiel → simple reçu (RM-3.4.2)
  est_quittance: boolean;
};
export type Revision = {
  id: string;
  date_effet: string;
  ancien_loyer: number;
  nouveau_loyer: number;
  irl_reference: number;
  irl_nouveau: number;
};
export type RelanceLigne = {
  id: string;
  niveau: string;
  date_envoi: string;
  date_premiere_presentation: string | null;
  numero_recommande: string | null;
  /** « gerant » (saisie ici) ou « automatique » (tâche du matin, e-mail). */
  origine?: string | null;
};
export type RegulLigne = {
  id: string;
  annee: number;
  provisions: number;
  charges_reelles: number;
  ecart: number;
};

const NIVEAU_RELANCE: Record<string, string> = {
  relance_1: "Relance 1",
  relance_2: "Relance 2",
  mise_en_demeure: "Mise en demeure",
};

function BoutonEnvoiQuittance({
  orgId,
  bailId,
  quittanceId,
  estQuittance,
}: {
  orgId: string;
  bailId: string;
  quittanceId: string;
  // Le bouton nomme ce qu'il envoie : « Envoyer » seul, en fin de rang, ne
  // disait pas quoi (24/09).
  estQuittance: boolean;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    // Un email parti reste un envoi réussi même si sa mémorisation échoue.
    // Un second geste déjà en file ne doit pas le renvoyer dans cette vue.
    async (precedent) => precedent.succes ? precedent : envoyerQuittance(orgId, bailId, quittanceId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <BoutonEnvoi variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={Boolean(etat.succes)}>
        {etat.succes
          ? estQuittance ? "Envoyée" : "Envoyé"
          : estQuittance ? "Envoyer la quittance" : "Envoyer le reçu"}
      </BoutonEnvoi>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-sm text-success-soft-foreground" role="status">{etat.succes}</span>}
    </form>
  );
}

const mois = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

// Les suppressions passent aussi par useActionState : un refus du serveur
// (mois clôturé, quittance émise…) doit se lire, pas se perdre.
function BoutonRetirerEncaissement({
  orgId,
  bailId,
  encaissementId,
}: {
  orgId: string;
  bailId: string;
  encaissementId: string;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async (_etat, formData) => supprimerEncaissement(orgId, bailId, encaissementId, formData),
    {}
  );
  // Retirer un encaissement contre-passe le journal : la correction porte le
  // motif de son auteur (RM-A6.6). Même patron que l'annulation d'une
  // écriture en comptabilité, EN DEUX TEMPS (24/09) : au repos, le rang ne
  // porte que « Retirer l'encaissement » — un champ « motif » vide sur chaque
  // ligne d'argent passait pour une note modifiable.
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert && !etat.erreur)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(true)}>
        Retirer l&apos;encaissement
      </Button>
    );
  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <Input
        name="motif"
        placeholder="Motif du retrait"
        aria-label="Motif du retrait"
        autoFocus
        required
        className="h-7 w-40 text-xs"
      />
      <BoutonEnvoi variant="outline" size="sm">
        Confirmer
      </BoutonEnvoi>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
        Renoncer
      </Button>
      {etat.erreur && <span className="w-full text-sm text-destructive">{etat.erreur}</span>}
    </form>
  );
}

function BoutonRetirerRelance({
  orgId,
  bailId,
  relanceId,
}: {
  orgId: string;
  bailId: string;
  relanceId: string;
}) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async () => supprimerRelance(orgId, bailId, relanceId),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-1">
      <BoutonEnvoi variant="ghost" size="sm">
        Retirer
      </BoutonEnvoi>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
    </form>
  );
}

export function FormulaireLoyers({
  orgId,
  bailId,
  echeancier,
  encaissements,
  quittances,
  revisionIrl,
  irlReference,
  irlTrimestre,
  revisions,
  relances,
  regularisations,
  chargesForfait,
}: {
  orgId: string;
  bailId: string;
  echeancier: LigneEcheance[];
  encaissements: Encaissement[];
  quittances: Quittance[];
  revisionIrl: boolean;
  // Indice de référence figé au bail à sa signature (RM-3.8.2) : affiché, jamais saisi ici
  irlReference: number | null;
  irlTrimestre: string | null;
  revisions: Revision[];
  relances: RelanceLigne[];
  regularisations: RegulLigne[];
  chargesForfait: boolean;
}) {
  const [etatEnc, formEnc] = useActionState<EtatLoyers, FormData>(
    ajouterEncaissement.bind(null, orgId, bailId),
    {}
  );
  const [etatRev, formRev] = useActionState<EtatLoyers, FormData>(
    reviserLoyer.bind(null, orgId, bailId),
    {}
  );
  const [etatRel, formRel] = useActionState<EtatLoyers, FormData>(
    ajouterRelance.bind(null, orgId, bailId),
    {}
  );
  const [etatReg, formReg] = useActionState<EtatLoyers, FormData>(
    regulariserCharges.bind(null, orgId, bailId),
    {}
  );
  const idNumeroRecommande = useId();
  const impaye = echeancier.some((l) => l.statut === "impaye");
  const anneeDefaut = new Date().getUTCFullYear() - 1;

  const totalDu = echeancier.reduce((s, l) => s + Number(l.montant_du), 0);
  const totalEncaisse = encaissements.reduce((s, e) => s + Number(e.montant), 0);
  const solde = totalDu - totalEncaisse;
  const quittanceParAppel = new Map(quittances.map((q) => [q.appel_id, q]));

  return (
    <div className="space-y-5">
      {/* Résumé + actions */}
      {/* TROIS CHIFFRES, PAS UNE PHRASE. « Dû 1 859,76 € · Encaissé 920,00 € ·
          Solde 939,76 € » se lisait d'un bout à l'autre pour trouver le seul
          nombre qui compte — le solde. Les trois prennent la forme des tuiles
          de la charte, et le solde porte sa couleur : rouge s'il reste dû,
          vert si le bail est à jour (relevé du 19/09). */}
      <div className="grille-kpi">
        <div className="kpi">
          <span className="eyebrow">Dû</span>
          <span className="chiffre block">{eur(totalDu)}</span>
          <span className="block text-xs text-muted-foreground">
            {echeancier.length} terme{echeancier.length > 1 ? "s" : ""} appelé
            {echeancier.length > 1 ? "s" : ""}
          </span>
        </div>
        <div className="kpi vert">
          <span className="eyebrow">Encaissé</span>
          <span className="chiffre block">{eur(totalEncaisse)}</span>
          <span className="block text-xs text-muted-foreground">
            {encaissements.length} encaissement{encaissements.length > 1 ? "s" : ""}
          </span>
        </div>
        {/* « Reste dû », le mot de la carte du dépôt de garantie et de
            l'écran Loyers & charges ; « En avance » quand le locataire a
            versé plus que dû (24/09). */}
        <div className={`kpi ${solde > 0 ? "rouge" : "vert"}`}>
          <span className="eyebrow">{solde < 0 ? "En avance" : "Reste dû"}</span>
          <span className="chiffre block">{eur(Math.abs(solde))}</span>
          <span className="block text-xs text-muted-foreground">
            {solde > 0
              ? "à régler par le locataire"
              : solde < 0
                ? "versé d'avance par le locataire"
                : "à jour"}
          </span>
        </div>
      </div>

      {/* LE GESTE DU QUOTIDIEN D'ABORD (24/09) : saisir un encaissement,
          juste sous les tuiles. « Générer l'échéancier » ne s'affiche ici que
          si l'échéancier est vide ; sinon, avec « Régénérer les
          reçus/quittances », il rejoint les outils de rattrapage en pied de
          carte — deux actions de maintenance ne passent plus devant.
          Les deux boutons gardent leur propre retour : une erreur avalée ici
          a déjà caché un vrai blocage (« Le bail n'a pas de date de début »)
          pendant la recette. */}
      {echeancier.length === 0 && (
        <div className="space-y-2">
          <BoutonEcheancier orgId={orgId} bailId={bailId} />
          <p className="text-sm text-muted-foreground">
            Aucun appel pour l&apos;instant : générez l&apos;échéancier du bail.
          </p>
        </div>
      )}

      {/* Saisir un encaissement.
          En erreur, la saisie est reposée via etatEnc.valeurs (recette 22/08) */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Saisir un encaissement</p>
        <form action={formEnc} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="enc-montant" className="text-sm">Montant (€)</Label>
            <Input id="enc-montant" name="montant" type="number" step="0.01" min="0.01" defaultValue={etatEnc.valeurs?.montant} className="h-9 w-28" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="enc-date" className="text-sm">Date</Label>
            {/* La date lue sur le relevé revient après un refus : la banque fait
                foi sur les montants ET les dates (RM-A6.7), et un champ vide se
                fait dater du jour par la base. */}
            <InputDateJour
              id="enc-date"
              className="h-9"
              name="date_paiement"
              valeurSoumise={etatEnc.valeurs?.date_paiement}
            />
          </div>
          {/* Champ libre auparavant : chacun écrivait « cheque », « Chèque »,
              « CHQ ». Une liste courte suffit et rend le journal lisible. */}
          <div className="space-y-1">
            <Label htmlFor="enc-mode" className="text-sm">Payé par</Label>
            <select
              id="enc-mode"
              name="mode"
              defaultValue={etatEnc.valeurs?.mode ?? "virement"}
              className="h-9 w-36 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {Object.entries(MODES_PAIEMENT).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          </div>
          {/* L'action principale de la carte, en plein — comme « Encaisser »
              dans la carte du dépôt de garantie (24/09). */}
          <BoutonEnvoi size="sm">
            Encaisser
          </BoutonEnvoi>
          {etatEnc.erreur && <p className="w-full text-sm text-destructive">{etatEnc.erreur}</p>}
          {/* Le compte rendu : sur quel terme l'argent est allé (le plus ancien
              d'abord, RM-3.3.2) et ce que chacun a produit — quittance au solde,
              reçu sur un partiel (RM-3.4.1/3.4.2). */}
          {!etatEnc.erreur && etatEnc.succes && (
            <p className="w-full text-sm text-success-soft-foreground">{etatEnc.succes}</p>
          )}
        </form>
      </div>

      {/* Échéancier */}
      {echeancier.length > 0 && (
        <ul className="echeancier">
          {echeancier.map((l) => {
            return (
              <li
                key={l.appel_id}
                className={`rang-echeance text-sm ${
                  l.statut === "paye"
                    ? "terme-paye"
                    : l.statut === "impaye"
                      ? "terme-impaye"
                      : l.statut === "partiel"
                        ? "terme-partiel"
                        : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="periode">{mois(l.periode)}</span>
                  <span className="detail-terme">
                    échéance {formaterDate(l.date_echeance)} · couvert{" "}
                    {eur(l.montant_couvert)}
                  </span>
                </span>
                <span className="montant-terme">{eur(l.montant_du)}</span>
                <span
                  className={`shrink-0 ${COULEURS_STATUT_APPEL_LOYER[l.statut] ?? COULEURS_STATUT_APPEL_LOYER.attendu}`}
                >
                  {STATUTS_APPEL_LOYER[l.statut] ?? "État du paiement à vérifier"}
                </span>
                {(() => {
                  const q = quittanceParAppel.get(l.appel_id);
                  return (
                    <span className="actions-terme">
                      {q && (
                        <>
                          {/* Au tactile, le lien texte garde une cible ~40px
                              (le socle ne couvre que boutons/inputs/selects) */}
                          <Link
                            href={`/quittance/${q.id}`}
                            target="_blank"
                            className={`text-xs underline-offset-2 hover:underline pointer-coarse:py-3 ${
                              q.est_quittance ? "text-success" : "text-muted-foreground"
                            }`}
                          >
                            {/* Chaque libellé dit de quel document il s'agit :
                                « reçu (partiel) · Envoyer · PDF · Avis PDF » se
                                lisait comme une phrase sans sens (24/09). */}
                            {q.est_quittance ? "Quittance" : "Reçu partiel"}
                          </Link>
                          {q.email_envoye_at ? (
                            <span className="text-xs text-muted-foreground">
                              ✉ {q.est_quittance ? "envoyée" : "envoyé"}
                            </span>
                          ) : (
                            <BoutonEnvoiQuittance
                              orgId={orgId}
                              bailId={bailId}
                              quittanceId={q.id}
                              estQuittance={q.est_quittance}
                            />
                          )}
                          {/* Documents-0 : le PDF (18/19), rangé en GED */}
                          <BoutonGenererDocument
                            orgId={orgId}
                            code="quittance"
                            cibleId={q.id}
                            cheminRetour={`/agence/${orgId}/baux/${bailId}`}
                            libelle={q.est_quittance ? "Quittance (PDF)" : "Reçu (PDF)"}
                            variant="ghost"
                          />
                        </>
                      )}
                      {/* Documents-0 : avis d'échéance (17), prorata (21) */}
                      <BoutonGenererDocument
                        orgId={orgId}
                        code="avis_echeance"
                        cibleId={l.appel_id}
                        cheminRetour={`/agence/${orgId}/baux/${bailId}`}
                        libelle="Avis d'échéance (PDF)"
                        variant="ghost"
                      />
                      {Number(l.montant_du) > 0 && l.prorata && (
                        <BoutonGenererDocument
                          orgId={orgId}
                          code="prorata"
                          cibleId={l.appel_id}
                          cheminRetour={`/agence/${orgId}/baux/${bailId}`}
                          libelle="Prorata (PDF)"
                          variant="ghost"
                        />
                      )}
                    </span>
                  );
                })()}
              </li>
            );
          })}
        </ul>
      )}

      {/* Encaissements — la règle d'imputation est dite une fois, dans la
          description de la carte (24/09). */}
      {encaissements.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Encaissements</p>
          <ul className="divide-y divide-border">
            {encaissements.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <span className="w-24 shrink-0 font-medium">{eur(e.montant)}</span>
                <span className="text-xs text-muted-foreground">{formaterDate(e.date_paiement)}</span>
                {/* En étroit, mode + note passent en pleine largeur, À LEUR
                    PLACE : montant · date, puis la note, puis le retrait
                    (24/09 — rejetée sous les commandes, la note semblait
                    commenter le retrait). */}
                <span className="w-full text-xs text-muted-foreground sm:w-auto sm:min-w-0 sm:flex-1 sm:truncate">
                  {[e.mode ? (MODES_PAIEMENT[e.mode] ?? e.mode) : null, e.note]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <BoutonRetirerEncaissement orgId={orgId} bailId={bailId} encaissementId={e.id} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Révision IRL */}
      {revisionIrl && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Révision annuelle du loyer (IRL)</p>
          {revisions.length > 0 && (
            <ul className="text-xs text-muted-foreground">
              {revisions.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  {formaterDate(r.date_effet)} : {eur(r.ancien_loyer)} → {eur(r.nouveau_loyer)} (IRL{" "}
                  {r.irl_reference} → {r.irl_nouveau})
                  {/* Documents-0 : la lettre de révision (23) */}
                  <BoutonGenererDocument
                    orgId={orgId}
                    code="revision_irl"
                    cibleId={r.id}
                    cheminRetour={`/agence/${orgId}/baux/${bailId}`}
                    libelle="Lettre PDF"
                    variant="ghost"
                  />
                </li>
              ))}
            </ul>
          )}
          {/* En erreur, la saisie est reposée via etatRev.valeurs (recette 22/08) */}
          <form action={formRev} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <p className="text-xs">IRL de référence (figé au bail)</p>
              <p className="flex h-9 items-center text-sm font-medium">
                {irlReference ?? "à renseigner sur le bail"}
                {irlTrimestre && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({irlTrimestre})
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="irl-nouv" className="text-sm">IRL nouveau</Label>
              <Input id="irl-nouv" name="irl_nouveau" type="number" step="0.01" defaultValue={etatRev.valeurs?.irl_nouveau} className="h-9 w-28" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="irl-date" className="text-sm">Date d&apos;effet</Label>
              <Input id="irl-date" name="date_effet" type="date" defaultValue={etatRev.valeurs?.date_effet} className="h-9" />
            </div>
            <BoutonEnvoi size="sm" variant="outline">
              Réviser le loyer
            </BoutonEnvoi>
            {etatRev.erreur && <p className="w-full text-sm text-destructive">{etatRev.erreur}</p>}
            {etatRev.succes && <p className="w-full text-sm text-success-soft-foreground">{etatRev.succes}</p>}
          </form>
          <p className="text-sm text-muted-foreground">
            Nouveau loyer = loyer × IRL nouveau / IRL de référence. L&apos;indice de
            référence est celui figé au bail à sa signature {/* RM-3.8.2 */} et ne se saisit
            pas ici. Une seule révision par année de bail ; interdit si DPE F/G ; le
            dépôt et les provisions ne changent pas.
          </p>
        </div>
      )}

      {/* Impayés & relances */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">
          Relances{impaye && <span className="ml-2 text-sm text-destructive">impayé en cours</span>}
        </p>
        {relances.length > 0 && (
          <ul className="divide-y divide-border">
            {relances.map((r) => (
              <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="w-32 shrink-0">{NIVEAU_RELANCE[r.niveau] ?? r.niveau}</span>
                <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                  envoyée {formaterDate(r.date_envoi)}
                  {r.origine === "automatique" && " · automatique (e-mail)"}
                  {r.date_premiere_presentation && ` · 1re prés. ${formaterDate(r.date_premiere_presentation)}`}
                  {r.numero_recommande && ` · R${r.numero_recommande}`}
                </span>
                <BoutonRetirerRelance orgId={orgId} bailId={bailId} relanceId={r.id} />
              </li>
            ))}
          </ul>
        )}
        {/* En erreur, la saisie est reposée via etatRel.valeurs (recette 22/08) */}
        <form action={formRel} className="flex flex-wrap items-end gap-2">
          <select name="niveau" aria-label="Niveau de relance" defaultValue={etatRel.valeurs?.niveau ?? "relance_1"} className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
            <option value="relance_1">Relance 1</option>
            <option value="relance_2">Relance 2</option>
            <option value="mise_en_demeure">Mise en demeure (recommandé)</option>
          </select>
          <div className="space-y-1">
            <Label htmlFor="rel-date" className="text-sm">Envoyée le</Label>
            <InputDateJour id="rel-date" className="h-9" name="date_envoi" valeurSoumise={etatRel.valeurs?.date_envoi} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rel-pres" className="text-sm">1re présentation (si recommandé)</Label>
            {/* La date de présentation se relève sur le suivi postal : elle
                reste vide tant que la présentation n'est pas confirmée. */}
            <Input id="rel-pres" type="date" className="h-9" name="date_premiere_presentation" defaultValue={etatRel.valeurs?.date_premiere_presentation} />
          </div>
          {/* En étroit, le champ prend sa ligne et le bouton passe dessous :
              comprimé à côté, son placeholder se coupait (« N° recommanc »,
              24/09). */}
          <div className="w-full space-y-1 sm:w-auto">
            <Label htmlFor={idNumeroRecommande} className="text-sm">Numéro de suivi</Label>
            <Input id={idNumeroRecommande} name="numero_recommande" placeholder="N° recommandé" defaultValue={etatRel.valeurs?.numero_recommande} className="h-9 w-full sm:w-32" />
          </div>
          <BoutonEnvoi size="sm" variant="outline">
            Enregistrer la relance
          </BoutonEnvoi>
          {etatRel.erreur && <p className="w-full text-sm text-destructive">{etatRel.erreur}</p>}
          {etatRel.succes && <p className="w-full text-sm text-success-soft-foreground" role="status">{etatRel.succes}</p>}
        </form>
        <p className="text-sm text-muted-foreground">
          La mise en demeure part en lettre recommandée avec accusé de réception, hors de la plateforme ; saisissez la date de première présentation
          (le délai court de là).
        </p>
      </div>

      {/* Régularisation des charges — impossible au forfait (RM-3.9.8) */}
      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Régularisation annuelle des charges</p>
        {chargesForfait && (
          <p className="text-sm text-muted-foreground">
            Charges au forfait : aucune régularisation n&apos;est possible, le forfait est
            définitif (loi 89-462, art. 23-1).
          </p>
        )}
        {regularisations.length > 0 && (
          <ul className="text-xs text-muted-foreground">
            {regularisations.map((r) => (
              <li key={r.id}>
                {r.annee} : provisions {eur(r.provisions)} vs réel {eur(r.charges_reelles)} ={" "}
                <span className={r.ecart >= 0 ? "text-success-soft-foreground" : "text-destructive"}>
                  {r.ecart >= 0 ? `trop-perçu ${eur(r.ecart)}` : `complément ${eur(-r.ecart)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!chargesForfait && (
        <form action={formReg} className="flex flex-wrap items-end gap-2">
          {/* En erreur, la saisie est reposée via etatReg.valeurs (recette 22/08) */}
          <div className="space-y-1">
            <Label htmlFor="reg-annee" className="text-sm">Année</Label>
            <Input id="reg-annee" name="annee" type="number" required defaultValue={etatReg.valeurs?.annee ?? anneeDefaut} className="h-9 w-24" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reg-reel" className="text-sm">Charges réelles (€)</Label>
            <Input id="reg-reel" name="charges_reelles" type="number" step="0.01" min="0" required defaultValue={etatReg.valeurs?.charges_reelles} className="h-9 w-32" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="reg-just" className="text-sm">Justificatif</Label>
            <ChampFichier id="reg-just" name="justificatif" accept=".pdf,.jpg,.jpeg,.png" required />
          </div>
          <BoutonEnvoi size="sm" variant="outline">
            Régulariser
          </BoutonEnvoi>
          {etatReg.erreur && <p className="w-full text-sm text-destructive">{etatReg.erreur}</p>}
          {etatReg.succes && <p className="w-full text-sm text-success-soft-foreground">{etatReg.succes}</p>}
        </form>
        )}
        {!chargesForfait && (
          <p className="text-sm text-muted-foreground">
            Provisions calculées depuis les appels de l&apos;année (prorata inclus) ; justificatif
            obligatoire, joint au décompte du locataire.
          </p>
        )}
      </div>

      {/* Outils de rattrapage (24/09) : utiles pour resynchroniser un bail
          dont l'historique a dérivé, jamais au quotidien — l'encaissement
          émet lui-même reçus et quittances. Repliés en pied de carte. */}
      {echeancier.length > 0 && (
        <details className="information-depliable border-t border-border pt-2">
          <summary className="justify-start gap-1.5 text-sm">
            Outils de rattrapage
            <span aria-hidden className="information-chevron">⌄</span>
          </summary>
          <div className="mt-1 space-y-2">
            <p className="text-sm text-muted-foreground">
              À n&apos;utiliser que si l&apos;échéancier ou les documents ne
              reflètent plus les encaissements du bail.
            </p>
            <div className="flex flex-wrap gap-2">
              <BoutonEcheancier orgId={orgId} bailId={bailId} />
              <BoutonQuittances orgId={orgId} bailId={bailId} />
            </div>
          </div>
        </details>
      )}
    </div>
  );
}


function BoutonEcheancier({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async () => genererAppels(orgId, bailId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <BoutonEnvoi size="sm" variant="outline">
        {"Générer l'échéancier"}
      </BoutonEnvoi>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-sm text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}

// Rattrapage manuel : l'encaissement émet normalement les documents tout seul,
// ce bouton ne sert qu'à resynchroniser un bail dont l'historique a dérivé.
function BoutonQuittances({ orgId, bailId }: { orgId: string; bailId: string }) {
  const [etat, action] = useActionState<EtatLoyers, FormData>(
    async () => emettreQuittances(orgId, bailId),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <BoutonEnvoi size="sm" variant="outline">
        Régénérer les reçus/quittances
      </BoutonEnvoi>
      {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
      {etat.succes && <span className="text-sm text-success-soft-foreground">{etat.succes}</span>}
    </form>
  );
}
