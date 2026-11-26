"use client";

import { useEffect, useRef, useState } from "react";
import { Alerte, CarteSaisie, Case, Champ, Groupe, Segments } from "@/components/outils/champs";
import {
  Barres,
  ChiffreHero,
  DispositionOutil,
  FeuillePapier,
  IconeImprimer,
  LigneDetail,
  ListeDetail,
  PanneauResultat,
  Pastille,
} from "@/components/outils/resultats";
import {
  CLE_STOCKAGE_QUITTANCE,
  MENTIONS_QUITTANCE,
  MENTIONS_RECU_PARTIEL,
  bornesPeriode,
  calculerQuittance,
  libellePeriode,
  lireQuittanceMemorisee,
  moisSuivant,
  type QuittanceMemorisee,
} from "@/lib/outils/quittance";
import { arrondiCentime, formaterDateIso, formaterEuros, formaterNombre, lireNombre } from "@/lib/outils/nombres";
import { enumerer } from "@/lib/outils/saisie";

const MODES = [
  { valeur: "virement", libelle: "Virement" },
  { valeur: "prélèvement", libelle: "Prélèvement" },
  { valeur: "chèque", libelle: "Chèque" },
  { valeur: "espèces", libelle: "Espèces" },
];

function ACompleter({ quoi }: { quoi: string }) {
  return <span className="a-completer">[{quoi}]</span>;
}

// Le stockage local peut être absent ou refusé (navigation privée, quota) :
// il n'est qu'une commodité, tout échoue en silence.
function lireStockage(): QuittanceMemorisee | null {
  try {
    return lireQuittanceMemorisee(window.localStorage.getItem(CLE_STOCKAGE_QUITTANCE));
  } catch {
    return null;
  }
}
function ecrireStockage(v: QuittanceMemorisee | null) {
  try {
    if (v) window.localStorage.setItem(CLE_STOCKAGE_QUITTANCE, JSON.stringify(v));
    else window.localStorage.removeItem(CLE_STOCKAGE_QUITTANCE);
  } catch {
    // stockage refusé : la saisie en cours reste la référence
  }
}

// Décision du dirigeant du 25/11/2026 pour l'outil IRL (Q100), appliquée ici (Q123) : AUCUN champ ne démarre avec une
// valeur. L'outil s'ouvrait avec un loyer de 850 €, 120 € de charges, 970 € reçus (le montant reçu suivait le total), le
// mois et la date du jour et le mode « virement », et « Imprimer la quittance » était actif : une quittance de 970 €
// s'imprimait sans rien saisir. Un exemple ne s'affiche plus qu'en texte indicatif dans un champ vide ; le document ne
// se prépare qu'avec le terme saisi, et ne s'imprime que complet, avec un message qui dit ce qui manque.

export function GenerateurQuittance() {
  const [bailleurNom, setBailleurNom] = useState("");
  const [bailleurAdresse, setBailleurAdresse] = useState("");
  const [locataireNom, setLocataireNom] = useState("");
  const [logementAdresse, setLogementAdresse] = useState("");
  const [loyerHc, setLoyerHc] = useState("");
  const [charges, setCharges] = useState("");
  // Le montant reçu est celui que le bailleur déclare avoir reçu : il ne suit plus le total du terme. « Reprendre le
  // total du terme » le recopie, à sa demande.
  const [recu, setRecu] = useState("");
  const [periode, setPeriode] = useState("");
  const [datePaiement, setDatePaiement] = useState("");
  const [mode, setMode] = useState<string | null>(null);
  const [memoriser, setMemoriser] = useState(false);
  const pret = useRef(false);

  // Au montage : ce que l'utilisateur a demandé de retenir sur cet appareil, s'il y en a. Plus aucune date posée
  // d'office (décision du 25/11/2026) : le mois et la date du paiement se saisissent, comme le reste.
  useEffect(() => {
    const m = lireStockage();
    if (!m) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setBailleurNom(m.bailleurNom);
    setBailleurAdresse(m.bailleurAdresse);
    setLocataireNom(m.locataireNom);
    setLogementAdresse(m.logementAdresse);
    if (m.loyerHc) setLoyerHc(m.loyerHc);
    if (m.charges) setCharges(m.charges);
    setMemoriser(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Premier passage : rien à écrire (la relecture ci-dessus n'est pas encore
  // appliquée, l'écriture effacerait ce qui a été retenu).
  useEffect(() => {
    if (!pret.current) {
      pret.current = true;
      return;
    }
    ecrireStockage(
      memoriser ? { bailleurNom, bailleurAdresse, locataireNom, logementAdresse, loyerHc, charges } : null
    );
  }, [memoriser, bailleurNom, bailleurAdresse, locataireNom, logementAdresse, loyerHc, charges]);

  const loyer = lireNombre(loyerHc);
  const provision = lireNombre(charges);
  // Le total n'existe que si le loyer ET les charges sont saisis (0 pour des charges nulles).
  const total = loyer != null && provision != null ? arrondiCentime(loyer + provision) : null;
  const r = calculerQuittance({ loyerHc: loyer, charges: provision, montantRecu: lireNombre(recu) });
  const bornes = bornesPeriode(periode);

  // Le mois suivant part du mois saisi. Le paiement de ce nouveau terme reste à saisir : sa date et son montant sont
  // vidés (la date du jour n'est plus posée à la place de l'utilisateur).
  function moisSuivantClic() {
    setPeriode((p) => moisSuivant(p));
    setDatePaiement("");
    setRecu("");
  }

  // Ce qui manque pour préparer le document : le terme et son paiement.
  const manquesTerme = [
    ...(loyerHc.trim() ? [] : ["le loyer hors charges"]),
    ...(charges.trim() ? [] : ["la provision pour charges (0 si aucune)"]),
    ...(recu.trim() ? [] : ["le montant reçu"]),
    ...(bornes ? [] : ["le mois du terme"]),
    ...(formaterDateIso(datePaiement) ? [] : ["la date du paiement"]),
  ];
  // Ce qui manque pour l'imprimer : chaque mention du document.
  const manquesDocument = [
    ...(mode ? [] : ["le mode de paiement"]),
    ...(bailleurNom.trim() ? [] : ["le nom du bailleur"]),
    ...(bailleurAdresse.trim() ? [] : ["l'adresse du bailleur"]),
    ...(locataireNom.trim() ? [] : ["le nom du locataire"]),
    ...(logementAdresse.trim() ? [] : ["l'adresse du logement loué"]),
  ];

  const du = bornes?.du ?? "…";
  const au = bornes?.au ?? "…";
  const nomBailleur = bailleurNom || <ACompleter quoi="Nom du bailleur" />;
  const nomLocataire = locataireNom || <ACompleter quoi="Nom du locataire" />;

  const saisie = (
    <CarteSaisie id="q-saisie" titre="Le terme">
      <Groupe legende="Période et paiement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="q-periode" type="month" libelle="Mois" valeur={periode} onChange={setPeriode} placeholder="Ex. 2026-09" />
          <Champ id="q-date" type="date" libelle="Date du paiement" valeur={datePaiement} onChange={setDatePaiement} />
        </div>
        <button type="button" onClick={moisSuivantClic} className="btn-secondaire" disabled={!bornes}>
          Mois suivant
          <span aria-hidden>→</span>
        </button>
      </Groupe>
      <Groupe legende="Montants">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="q-loyer" libelle="Loyer hors charges" valeur={loyerHc} onChange={setLoyerHc} suffixe="€" decimal placeholder="Ex. 850" />
          <Champ
            id="q-charges"
            libelle="Provision pour charges"
            valeur={charges}
            onChange={setCharges}
            suffixe="€"
            decimal
            placeholder="Ex. 120"
            aide="0 si aucune."
          />
        </div>
        <Champ
          id="q-recu"
          libelle="Montant reçu"
          valeur={recu}
          onChange={setRecu}
          suffixe="€"
          decimal
          placeholder="Ex. 970"
          aide="La somme effectivement reçue pour ce terme."
        />
        {total != null && total > 0 && lireNombre(recu) !== total && (
          <button type="button" onClick={() => setRecu(formaterNombre(total))} className="lien-discret min-h-11 text-[13.5px]">
            Reprendre le total du terme ({formaterEuros(total)})
          </button>
        )}
        <Segments
          nom="q-mode"
          libelle="Mode de paiement"
          valeur={mode}
          onChange={setMode}
          options={MODES}
          colonnes="grid-cols-2 sm:grid-cols-4"
        />
      </Groupe>
      <Groupe legende="Bailleur, locataire, logement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="q-bailleur" libelle="Nom du bailleur" valeur={bailleurNom} onChange={setBailleurNom} autoComplete="name" />
          <Champ id="q-bailleur-adresse" libelle="Adresse du bailleur" valeur={bailleurAdresse} onChange={setBailleurAdresse} />
          <Champ id="q-locataire" libelle="Nom du locataire" valeur={locataireNom} onChange={setLocataireNom} />
          <Champ id="q-logement" libelle="Adresse du logement loué" valeur={logementAdresse} onChange={setLogementAdresse} />
        </div>
        <Case
          id="q-memoriser"
          coche={memoriser}
          onChange={setMemoriser}
          libelle="Retenir le bailleur, le locataire, le logement et les montants sur cet appareil"
          aide="Enregistré dans ce navigateur seulement ; décochez pour tout effacer."
        />
      </Groupe>
    </CarteSaisie>
  );

  if (manquesTerme.length > 0 || !r || !bornes) {
    return (
      <DispositionOutil
        saisie={saisie}
        resultat={
          <PanneauResultat
            id="q-resultat"
            titre="Document à compléter"
            pastille={
              <Pastille ton="neutre" testId="q-etat">
                À compléter
              </Pastille>
            }
          >
            {manquesTerme.length > 0 ? (
              <p data-testid="q-manque" className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-5 text-[14px] text-[var(--texte-secondaire)]">
                Renseignez {enumerer(manquesTerme)} pour préparer le document.
              </p>
            ) : (
              <Alerte gravite="attention">
                Indiquez le loyer, les charges (0 si aucune) et le montant effectivement reçu. Le terme et le paiement
                doivent être supérieurs à zéro. Utilisez des montants non négatifs, en euros et centimes.
              </Alerte>
            )}
          </PanneauResultat>
        }
      />
    );
  }

  // Le document est prêt ; il ne s'imprime que complet (même règle que la lettre de l'outil IRL).
  const pretAImprimer = manquesDocument.length === 0;
  const raisonImpression = pretAImprimer
    ? null
    : `Pour imprimer ${r.estQuittance ? "la quittance" : "le reçu"}, renseignez ${enumerer(manquesDocument)}.`;

  const resultat = (
    <PanneauResultat
      id="q-resultat"
      titre="Document produit"
      pastille={
        r.estQuittance ? (
          <Pastille ton="succes">Terme soldé</Pastille>
        ) : (
          <Pastille ton="attention">Paiement partiel</Pastille>
        )
      }
    >
      <div>
        <p data-testid="q-type" className="outil-verdict text-[var(--encre)]">
          {r.titre}
        </p>
        <p className="mt-1 text-[13.5px] text-[var(--texte-secondaire)]">
          {periode ? libellePeriode(periode) : "Période à choisir"} · du {du} au {au}
        </p>
      </div>
      <ChiffreHero libelle="Total du terme" valeur={formaterEuros(r.total)} testId="q-total" />
      <Barres
        libelle="Part du terme réglée"
        max={r.total}
        barres={[
          {
            libelle: "Montant affecté au terme",
            valeur: r.affecteAuTerme,
            texte: formaterEuros(r.affecteAuTerme),
            ton: r.estQuittance ? "succes" : "attention",
          },
        ]}
      />
      <ListeDetail libelle="Détail du terme">
        <LigneDetail libelle="Loyer hors charges" valeur={formaterEuros(loyer ?? 0)} />
        <LigneDetail libelle="Provision pour charges" valeur={formaterEuros(provision ?? 0)} />
        <LigneDetail libelle="Montant reçu" valeur={formaterEuros(r.recu)} />
        {r.excedent > 0 && <LigneDetail libelle="Excédent hors de ce terme" valeur={formaterEuros(r.excedent)} />}
        <LigneDetail libelle="Reste dû" valeur={formaterEuros(r.resteDu)} testId="q-reste" fort />
      </ListeDetail>
      {!r.estQuittance && (
        <Alerte gravite="attention">
          Le terme n&apos;est pas soldé : le document est un reçu de paiement partiel, qui ne vaut pas quittance.
        </Alerte>
      )}
      <div>
        <button
          type="button"
          onClick={() => window.print()}
          className="btn-or w-full justify-center"
          disabled={!pretAImprimer}
          aria-describedby={raisonImpression ? "q-impression-manque" : undefined}
        >
          <IconeImprimer />
          Imprimer {r.estQuittance ? "la quittance" : "le reçu"}
        </button>
        {raisonImpression && (
          <p id="q-impression-manque" data-testid="q-impression-manque" className="mt-2 text-[13px] leading-snug text-[var(--texte-secondaire)]">
            {raisonImpression}
          </p>
        )}
      </div>
    </PanneauResultat>
  );

  return (
    <div className="space-y-10">
      <DispositionOutil saisie={saisie} resultat={resultat} />

      {/* Incomplet, le document ne part pas non plus par l'impression du navigateur : la page imprimée dit pourquoi. */}
      {raisonImpression && <p className="hidden print:block">{raisonImpression}</p>}
      <div className={pretAImprimer ? undefined : "print:hidden"}>
        <FeuillePapier
          id="quittance"
          libelle={r.titre}
          legende={
            <>
              <p className="eyebrow">Aperçu du document</p>
              <p className="text-[12.5px] text-[var(--texte-secondaire)]">
                {pretAImprimer ? "Format A4, prêt à imprimer ou à enregistrer en PDF" : "Format A4, à compléter avant impression"}
              </p>
            </>
          }
        >
          <div className="space-y-5">
            <header className="space-y-1 border-b border-[color-mix(in_srgb,var(--encre)_18%,transparent)] pb-4">
              <p className="papier-mention">Article 21 de la loi n° 89-462 du 6 juillet 1989</p>
              <h2 className="papier-titre">{r.titre}</h2>
              <p className="text-[14px] text-[var(--texte-secondaire)]">
                Période du {du} au {au}
                {periode && ` (${libellePeriode(periode)})`}
              </p>
            </header>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="papier-mention">Bailleur</dt>
                <dd className="mt-1">
                  {nomBailleur}
                  <br />
                  {bailleurAdresse || <ACompleter quoi="Adresse du bailleur" />}
                </dd>
              </div>
              <div>
                <dt className="papier-mention">Locataire</dt>
                <dd className="mt-1">{nomLocataire}</dd>
              </div>
              <div>
                <dt className="papier-mention">Logement loué</dt>
                <dd className="mt-1">{logementAdresse || <ACompleter quoi="Adresse du logement" />}</dd>
              </div>
            </dl>
            <p>
              Je soussigné(e) {nomBailleur}, bailleur du logement désigné ci-dessus, déclare avoir reçu de {nomLocataire} la
              somme de <b className="montant">{formaterEuros(r.affecteAuTerme)}</b>, au titre du loyer et des charges pour la période
              du {du} au {au}
              {r.estQuittance ? (
                <>
                  , et lui en donne <b>quittance</b>, sous réserve de tous mes droits.
                </>
              ) : (
                ", à valoir sur le terme désigné ci-dessous."
              )}
            </p>
            {r.excedent > 0 && (
              <p>Le versement total est de {formaterEuros(r.recu)}. L’excédent de {formaterEuros(r.excedent)} ne fait pas partie du terme couvert par cette quittance.</p>
            )}
            <table className="papier-montants">
              <tbody>
                {r.estQuittance ? (
                  <>
                    <tr>
                      <td>Loyer hors charges</td>
                      <td>{formaterEuros(loyer ?? 0)}</td>
                    </tr>
                    <tr>
                      <td>Provision pour charges</td>
                      <td>{formaterEuros(provision ?? 0)}</td>
                    </tr>
                    <tr className="total">
                      <td>Total du terme</td>
                      <td>{formaterEuros(r.total)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td>Total du terme</td>
                      <td>{formaterEuros(r.total)}</td>
                    </tr>
                    <tr>
                      <td>Montant encaissé</td>
                      <td>{formaterEuros(r.recu)}</td>
                    </tr>
                    <tr className="total">
                      <td>Solde restant dû</td>
                      <td>{formaterEuros(r.resteDu)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            <p>
              Règlement reçu le {formaterDateIso(datePaiement) || <ACompleter quoi="date" />} par{" "}
              {mode ?? <ACompleter quoi="mode de paiement" />}.
            </p>
            <div className="space-y-2 border-t border-[color-mix(in_srgb,var(--encre)_12%,transparent)] pt-4 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
              {(r.estQuittance ? MENTIONS_QUITTANCE : MENTIONS_RECU_PARTIEL).map((m) => (
                <p key={m}>{m}</p>
              ))}
            </div>
            <div className="flex flex-wrap items-end justify-between gap-6 pt-2">
              <p>Fait le {formaterDateIso(datePaiement) || <ACompleter quoi="date" />}.</p>
              <p className="min-w-[200px] font-bold">
                {nomBailleur}
                <span className="mt-10 block border-t border-[color-mix(in_srgb,var(--encre)_25%,transparent)] pt-1 text-[12.5px] font-normal text-[var(--texte-secondaire)]">
                  Signature
                </span>
              </p>
            </div>
          </div>
        </FeuillePapier>
      </div>
    </div>
  );
}
