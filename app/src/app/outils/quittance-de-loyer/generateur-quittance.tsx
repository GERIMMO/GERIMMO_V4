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
  periodeDe,
  type QuittanceMemorisee,
} from "@/lib/outils/quittance";
import { aujourdhuiIso, formaterDateIso, formaterEuros, formaterNombre, lireNombre } from "@/lib/outils/nombres";

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

export function GenerateurQuittance() {
  const [bailleurNom, setBailleurNom] = useState("");
  const [bailleurAdresse, setBailleurAdresse] = useState("");
  const [locataireNom, setLocataireNom] = useState("");
  const [logementAdresse, setLogementAdresse] = useState("");
  const [loyerHc, setLoyerHc] = useState("850");
  const [charges, setCharges] = useState("120");
  // Le montant reçu suit le total tant qu'on ne l'a pas saisi soi-même.
  const [recuSaisi, setRecuSaisi] = useState<string | null>(null);
  const [periode, setPeriode] = useState("");
  const [datePaiement, setDatePaiement] = useState("");
  const [mode, setMode] = useState("virement");
  const [memoriser, setMemoriser] = useState(false);
  const pret = useRef(false);

  // Au montage : la date du jour (celle du navigateur) et, s'il y en a, ce que
  // l'utilisateur a demandé de retenir sur cet appareil.
  useEffect(() => {
    const aujourdhui = aujourdhuiIso();
    const m = lireStockage();
    /* eslint-disable react-hooks/set-state-in-effect */
    setPeriode(periodeDe(aujourdhui));
    setDatePaiement(aujourdhui);
    if (m) {
      setBailleurNom(m.bailleurNom);
      setBailleurAdresse(m.bailleurAdresse);
      setLocataireNom(m.locataireNom);
      setLogementAdresse(m.logementAdresse);
      if (m.loyerHc) setLoyerHc(m.loyerHc);
      if (m.charges) setCharges(m.charges);
      setMemoriser(true);
    }
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
  const total = (loyer ?? 0) + (provision ?? 0);
  const recuTexte = recuSaisi ?? formaterNombre(total);
  const r = calculerQuittance({ loyerHc: loyer, charges: provision, montantRecu: lireNombre(recuTexte) });
  const bornes = bornesPeriode(periode);

  function moisSuivantClic() {
    setPeriode((p) => moisSuivant(p || periodeDe(aujourdhuiIso())));
    setDatePaiement(aujourdhuiIso());
    setRecuSaisi(null);
  }

  const du = bornes?.du ?? "…";
  const au = bornes?.au ?? "…";
  const nomBailleur = bailleurNom || <ACompleter quoi="Nom du bailleur" />;
  const nomLocataire = locataireNom || <ACompleter quoi="Nom du locataire" />;

  const saisie = (
    <CarteSaisie id="q-saisie" titre="Le terme">
      <Groupe legende="Période et paiement">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="q-periode" type="month" libelle="Mois" valeur={periode} onChange={setPeriode} />
          <Champ id="q-date" type="date" libelle="Date du paiement" valeur={datePaiement} onChange={setDatePaiement} />
        </div>
        <button type="button" onClick={moisSuivantClic} className="btn-secondaire min-h-11">
          Mois suivant
          <span aria-hidden>→</span>
        </button>
      </Groupe>
      <Groupe legende="Montants">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="q-loyer" libelle="Loyer hors charges" valeur={loyerHc} onChange={setLoyerHc} suffixe="€" decimal />
          <Champ id="q-charges" libelle="Provision pour charges" valeur={charges} onChange={setCharges} suffixe="€" decimal />
        </div>
        <Champ
          id="q-recu"
          libelle="Montant reçu"
          valeur={recuTexte}
          onChange={setRecuSaisi}
          suffixe="€"
          decimal
          aide={recuSaisi == null ? "Suit le total tant que vous ne le modifiez pas." : undefined}
        />
        {recuSaisi != null && (
          <button type="button" onClick={() => setRecuSaisi(null)} className="lien-discret min-h-11 text-[13.5px]">
            Reprendre le total du terme
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
        <p data-testid="q-type" className="font-heading text-[22px] font-extrabold leading-tight tracking-[-0.015em] text-[var(--encre)]">
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
            libelle: "Montant reçu",
            valeur: r.recu,
            texte: formaterEuros(r.recu),
            ton: r.estQuittance ? "succes" : "attention",
          },
        ]}
      />
      <ListeDetail libelle="Détail du terme">
        <LigneDetail libelle="Loyer hors charges" valeur={formaterEuros(loyer ?? 0)} />
        <LigneDetail libelle="Provision pour charges" valeur={formaterEuros(provision ?? 0)} />
        <LigneDetail libelle="Montant reçu" valeur={formaterEuros(r.recu)} />
        <LigneDetail libelle="Reste dû" valeur={formaterEuros(r.resteDu)} testId="q-reste" fort />
      </ListeDetail>
      {!r.estQuittance && (
        <Alerte gravite="attention">
          Le terme n&apos;est pas soldé : le document est un reçu de paiement partiel, qui ne vaut pas quittance.
        </Alerte>
      )}
      <button type="button" onClick={() => window.print()} className="btn-or min-h-11 w-full justify-center !py-3 !text-[14.5px]">
        <IconeImprimer />
        Imprimer {r.estQuittance ? "la quittance" : "le reçu"}
      </button>
    </PanneauResultat>
  );

  return (
    <div className="space-y-10">
      <DispositionOutil saisie={saisie} resultat={resultat} />

      <FeuillePapier
        id="quittance"
        libelle={r.titre}
        legende={
          <>
            <p className="eyebrow">Aperçu du document</p>
            <p className="text-[12.5px] text-[var(--texte-secondaire)]">Format A4, prêt à imprimer ou à enregistrer en PDF</p>
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
            somme de <b className="montant">{formaterEuros(r.recu)}</b>, au titre du loyer et des charges pour la période
            du {du} au {au}
            {r.estQuittance ? (
              <>
                , et lui en donne <b>quittance</b>, sous réserve de tous mes droits.
              </>
            ) : (
              ", à valoir sur le terme désigné ci-dessous."
            )}
          </p>
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
            Règlement reçu le {formaterDateIso(datePaiement) || <ACompleter quoi="date" />} par {mode}.
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
  );
}
