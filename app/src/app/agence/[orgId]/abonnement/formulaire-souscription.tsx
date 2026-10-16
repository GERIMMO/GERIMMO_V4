"use client";

// Le récapitulatif AVANT paiement (grille du 28/09/2026). Ce que le client lit
// ici est recalculé par l'action serveur avec le même module (lib/tarifs.ts) :
// un montant qui aurait changé entre l'affichage et la validation est refusé.

import { useId, useMemo, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import Link from "next/link";
import { Check, LockKeyhole, MessageCircle } from "lucide-react";
import styles from "./abonnement.module.css";
import { demarrerAbonnement, type EtatAbonnementAction } from "@/app/actions/abonnement";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import {
  euros,
  formulesCouvrant,
  montantsOffre,
  offreAgence,
  offreFormule,
  parPeriode,
  type Offre,
  type Periodicite,
  type RegimeTva,
} from "@/lib/tarifs";
import { useRacineEspace } from "@/components/racine-espace-contexte";

export function DetailMontants({ offre, regime }: { offre: Offre; regime: RegimeTva | null }) {
  const m = montantsOffre(offre, regime);
  const periode = parPeriode(offre.periodicite);
  return (
    <div>
      {offre.lignes.map((l) => (
        <div key={l.produit} className="ligne-info">
          <span>
            {l.libelle}
            {l.quantite > 1 && (
              <small className="block">
                {l.quantite} × {euros(l.prixUnitaireCents)}
              </small>
            )}
          </span>
          <span className="montant">{euros(l.totalCents)}</span>
        </div>
      ))}
      {offre.public === "agence" ? (
        <>
          <div className="ligne-info">
            <span>Total HT</span>
            <span className="montant">{euros(offre.montantCents)} {periode}</span>
          </div>
          {m.connu ? (
            <>
              <div className="ligne-info">
                <span>TVA</span>
                <span className="montant">{euros(m.tvaCents)}</span>
              </div>
              <div className="ligne-info font-medium">
                <span className="!text-foreground">Total à payer TTC</span>
                <span className="montant font-heading text-lg">{euros(m.ttcCents)} {periode}</span>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div className="ligne-info font-medium">
          <span className="!text-foreground">Total à payer TTC</span>
          <span className="montant font-heading text-lg">{euros(offre.montantCents)} {periode}</span>
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {m.connu && offre.public === "particulier" && m.tvaCents > 0
          ? `Dont TVA : ${euros(m.tvaCents)}.`
          : m.mention}
      </p>
    </div>
  );
}

export function FormulaireSouscription({
  orgId,
  publicTarif,
  unites,
  regime,
  premierPrelevement,
  ferme,
  motifIndisponible,
}: {
  orgId: string;
  publicTarif: "agence" | "proprietaire_direct";
  /** Biens ou lots sous mandat actuellement en gestion. */
  unites: number;
  regime: RegimeTva | null;
  /** Date (AAAA-MM-JJ) du premier prélèvement si l'essai est préservé, sinon null. */
  premierPrelevement: string | null;
  ferme: boolean;
  /** Pourquoi la souscription en ligne n'est pas possible (configuration), sinon null. */
  motifIndisponible: string | null;
}) {
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const racine = useRacineEspace();
  const base = `${racine}/${orgId}`;
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(
    demarrerAbonnement.bind(null, orgId),
    {}
  );
  const estAgence = publicTarif === "agence";
  const [periodicite, setPeriodicite] = useState<Periodicite>("mensuel");
  const offres = useMemo(() => formulesCouvrant(unites, periodicite), [unites, periodicite]);
  const [code, setCode] = useState<string | null>(null);
  const choisie = estAgence
    ? offreAgence(unites)
    : (offres.find((o) => o.formule.code === code) ?? offres[0]);
  const idConfirmation = useId();
  const [confirme, setConfirme] = useState(false);
  const dateDebit = premierPrelevement
    ? new Date(`${premierPrelevement}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const montantAffiche =
    estAgence && regime ? montantsOffre(choisie, regime) : null;
  const totalLu =
    estAgence
      ? montantAffiche?.connu
        ? `${euros(montantAffiche.ttcCents)} TTC`
        : `${euros(choisie.montantCents)} HT`
      : `${euros(choisie.montantCents)} TTC`;

  return (
    <form data-saisie-confirmee action={action} className={estAgence ? "space-y-4" : styles.formulaire}>
      {!estAgence && (
        <fieldset className={styles.periodicite}>
          <legend>Choisir la périodicité</legend>
          <div className={styles.periodiciteOptions}>
            {(["mensuel", "annuel"] as const).map((p) => (
              <label key={p} className={styles.periode} data-actif={periodicite === p}>
                <input
                  type="radio"
                  name="periodicite"
                  value={p}
                  checked={periodicite === p}
                  onChange={() => {
                    setPeriodicite(p);
                    setConfirme(false);
                  }}
                  className="sr-only"
                />
                {p === "mensuel" ? <>Mensuel <small>Sans engagement</small></> : <>Annuel <small>2 mois offerts</small></>}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {estAgence && <input type="hidden" name="periodicite" value="mensuel" />}

      {!estAgence && (
        <fieldset className={styles.formules}>
          <legend>Les formules adaptées à vos {unites} bien{unites > 1 ? "s" : ""}</legend>
          <div className={styles.grilleFormules}>
            {offres.map((o, i) => {
              const selectionnee = choisie.public === "particulier" && choisie.formule.code === o.formule.code;
              const surcout = o.montantCents - offres[0].montantCents;
              return (
                <label key={o.formule.code} className={styles.formule} data-selectionnee={selectionnee}>
                  <span className={styles.formuleEntete}>
                    <span>{i === 0 ? "Adaptée à votre parc" : "Pour voir plus grand"}</span>
                    <input type="radio" name="formule" value={o.formule.code} checked={selectionnee}
                      onChange={() => { setCode(o.formule.code); setConfirme(false); }} />
                  </span>
                  <strong className={styles.nomFormule}>{o.formule.nom}</strong>
                  <span className={styles.capacite}>{o.capacite > 20 ? `${o.capacite} biens` : `Jusqu’à ${o.formule.biens} bien${o.formule.biens > 1 ? "s" : ""}`}</span>
                  <span className={styles.prix}>{euros(o.montantCents)}<small>TTC {parPeriode(periodicite)}</small></span>
                  <span className={styles.noteFormule}>{i === 0 ? "La formule la plus économique pour votre parc." : `+${euros(surcout)} ${parPeriode(periodicite)} par rapport à la formule adaptée.`}</span>
                  <span className={styles.selectionFormule}>{selectionnee ? <><Check size={15} aria-hidden="true" /> Formule sélectionnée</> : "Choisir cette formule"}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div role="region" aria-label="Récapitulatif avant paiement" className={estAgence ? "rounded-lg border border-border p-3" : styles.recapitulatif}>
        <div className={estAgence ? undefined : styles.total}>
          <p className={estAgence ? "libelle-champ mb-2" : styles.recapTitre}><LockKeyhole size={17} aria-hidden="true" /> Récapitulatif avant paiement</p>
          <DetailMontants offre={choisie} regime={regime} />
        </div>
        <ul className={estAgence ? "mesure-lecture mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground" : styles.conditions}>
          {choisie.public === "particulier" && choisie.periodicite === "annuel" && (
            <li>
              {euros(choisie.montantCents)} prélevés en une fois pour douze mois — soit{" "}
              {euros(
                (offreFormule(choisie.formule, unites, "mensuel")?.montantCents ?? 0) * 12 - choisie.montantCents
              )}{" "}
              de moins que douze mensualités.
            </li>
          )}
          <li>
            {dateDebit
              ? `Premier prélèvement le ${dateDebit}, à la fin de votre essai : les jours restants vous sont conservés.`
              : ferme
                ? "Premier prélèvement à la validation du paiement ; votre compte rouvre aussitôt."
                : "Premier prélèvement à la validation du paiement."}
          </li>
          <li>
            {choisie.periodicite === "annuel"
              ? "Renouvelé chaque année à la même date pour douze mois, au tarif alors en vigueur. Résiliable à tout moment pour la prochaine échéance annuelle : l'accès payé reste ouvert jusqu'à son terme."
              : "Sans engagement : renouvelé chaque mois, résiliable à tout moment pour la prochaine échéance mensuelle. L'accès payé reste ouvert jusqu'au bout du mois en cours."}
          </li>
          <li>
            Au-delà de la capacité de votre {estAgence ? "abonnement" : "formule"}, toute augmentation vous sera présentée
            (nouveau montant, date d&apos;effet, prorata) et ne s&apos;appliquera qu&apos;après votre accord.
          </li>
        </ul>
      </div>

      {motifIndisponible ? (
        <div className={estAgence ? "mesure-lecture text-sm text-muted-foreground" : styles.indisponible}>
          <MessageCircle size={20} aria-hidden="true" />
          <p>{motifIndisponible}</p>
          {!estAgence && <Link href={`/assistance?ecran=${encodeURIComponent(`${racine}/[dossier]/abonnement`)}&action=lien&retour=${encodeURIComponent(`${base}/abonnement`)}`}>Contacter Gerimmo</Link>}
        </div>
      ) : (
        <>
          <input type="hidden" name="montant_attendu_cents" value={choisie.montantCents} />
          <input type="hidden" name="confirmation" value={confirme ? "oui" : "non"} />
          <label htmlFor={idConfirmation} className="flex items-start gap-2 text-sm">
            <input
              id={idConfirmation}
              type="checkbox"
              checked={confirme}
              onChange={(e) => setConfirme(e.target.checked)}
              className="mt-1"
            />
            <span>
              J&apos;ai vérifié le montant de {totalLu} {parPeriode(choisie.periodicite)} et j&apos;accepte qu&apos;il soit prélevé
              {dateDebit ? ` à partir du ${dateDebit}` : ""}, selon les conditions ci-dessus.
            </span>
          </label>
          <BoutonEnvoi enCoursTexte="Ouverture du paiement sécurisé…" disabled={!confirme}>
            Continuer vers le paiement sécurisé
          </BoutonEnvoi>
        </>
      )}
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
