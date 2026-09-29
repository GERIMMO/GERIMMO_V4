"use client";

import { useEffect, useRef, useState } from "react";
import { CLASSE_CARTE, Case, Champ, Chiffre, Choix, Groupe } from "@/components/outils/champs";
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
  return <span className="italic text-[var(--libelle)]">[{quoi}]</span>;
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

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] print:hidden">
        <section className={`${CLASSE_CARTE} space-y-5`} aria-labelledby="q-saisie">
          <h2 id="q-saisie" className="text-[length:var(--pas-section)]">
            Le terme
          </h2>
          <Groupe legende="Période et paiement">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ id="q-periode" type="month" libelle="Mois" valeur={periode} onChange={setPeriode} />
              <Champ id="q-date" type="date" libelle="Date du paiement" valeur={datePaiement} onChange={setDatePaiement} />
            </div>
            <button type="button" onClick={moisSuivantClic} className="btn-secondaire">
              Mois suivant
            </button>
          </Groupe>
          <Groupe legende="Montants">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ id="q-loyer" libelle="Loyer hors charges" valeur={loyerHc} onChange={setLoyerHc} suffixe="€" decimal />
              <Champ id="q-charges" libelle="Provision pour charges" valeur={charges} onChange={setCharges} suffixe="€" decimal />
              <Champ
                id="q-recu"
                libelle="Montant reçu"
                valeur={recuTexte}
                onChange={setRecuSaisi}
                suffixe="€"
                decimal
                aide={recuSaisi == null ? "Suit le total tant que vous ne le modifiez pas." : undefined}
              />
              <Choix id="q-mode" libelle="Mode de paiement" valeur={mode} onChange={setMode} options={MODES} />
            </div>
            {recuSaisi != null && (
              <button type="button" onClick={() => setRecuSaisi(null)} className="lien-discret text-[13.5px]">
                Reprendre le total du terme
              </button>
            )}
          </Groupe>
          <Groupe legende="Bailleur, locataire, logement">
            <div className="grid gap-3 sm:grid-cols-2">
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
            />
          </Groupe>
        </section>

        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="q-resultat" aria-live="polite">
          <h2 id="q-resultat" className="text-[length:var(--pas-section)]">
            Document produit
          </h2>
          <p data-testid="q-type" className="font-heading text-[20px] font-bold text-[var(--encre)]">
            {r.titre}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Chiffre libelle="Total du terme" valeur={formaterEuros(r.total)} testId="q-total" />
            <Chiffre libelle="Reste dû" valeur={formaterEuros(r.resteDu)} testId="q-reste" accent={!r.estQuittance} />
          </div>
          {!r.estQuittance && (
            <p className="text-[14px] text-[var(--texte-secondaire)]">
              Le terme n&apos;est pas soldé : le document est un reçu de paiement partiel, qui ne vaut pas quittance.
            </p>
          )}
          <button type="button" onClick={() => window.print()} className="btn-or">
            Imprimer {r.estQuittance ? "la quittance" : "le reçu"}
          </button>
        </section>
      </div>

      <article
        id="quittance"
        aria-label={r.titre}
        className="loc-carte space-y-4 text-[14.5px] leading-relaxed text-[var(--corps)] print:border-0 print:p-0 print:shadow-none"
      >
        <header className="border-b border-[var(--filet)] pb-3">
          <h2 className="font-heading text-[22px] font-bold text-[var(--encre)]">{r.titre}</h2>
          <p className="text-[13.5px] text-[var(--texte-secondaire)]">
            Période du {du} au {au}
            {periode && ` (${libellePeriode(periode)})`} — article 21 de la loi n° 89-462 du 6 juillet 1989
          </p>
        </header>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div>
            <dt className="eyebrow">Bailleur</dt>
            <dd>
              {nomBailleur}
              <br />
              {bailleurAdresse || <ACompleter quoi="Adresse du bailleur" />}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Locataire</dt>
            <dd>{nomLocataire}</dd>
          </div>
          <div>
            <dt className="eyebrow">Logement loué</dt>
            <dd>{logementAdresse || <ACompleter quoi="Adresse du logement" />}</dd>
          </div>
        </dl>
        <p>
          Je soussigné(e) {nomBailleur}, bailleur du logement désigné ci-dessus, déclare avoir reçu de {nomLocataire} la
          somme de <b className="montant">{formaterEuros(r.recu)}</b>, au titre du loyer et des charges pour la période du{" "}
          {du} au {au}
          {r.estQuittance ? (
            <>
              , et lui en donne <b>quittance</b>, sous réserve de tous mes droits.
            </>
          ) : (
            ", à valoir sur le terme désigné ci-dessous."
          )}
        </p>
        <div className="tableau-defilant">
          <table className="tableau">
            <thead>
              <tr>
                <th>Nature</th>
                <th className="nombre">Montant</th>
              </tr>
            </thead>
            <tbody>
              {r.estQuittance ? (
                <>
                  <tr>
                    <td>Loyer hors charges</td>
                    <td className="nombre">{formaterEuros(loyer ?? 0)}</td>
                  </tr>
                  <tr>
                    <td>Provision pour charges</td>
                    <td className="nombre">{formaterEuros(provision ?? 0)}</td>
                  </tr>
                  <tr className="total">
                    <td>Total du terme</td>
                    <td className="nombre">{formaterEuros(r.total)}</td>
                  </tr>
                </>
              ) : (
                <>
                  <tr>
                    <td>Total du terme</td>
                    <td className="nombre">{formaterEuros(r.total)}</td>
                  </tr>
                  <tr>
                    <td>Montant encaissé</td>
                    <td className="nombre">{formaterEuros(r.recu)}</td>
                  </tr>
                  <tr className="total">
                    <td>Solde restant dû</td>
                    <td className="nombre">{formaterEuros(r.resteDu)}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
        <p>
          Règlement reçu le {formaterDateIso(datePaiement) || <ACompleter quoi="date" />} par{" "}
          {mode}.
        </p>
        <div className="space-y-2 border-t border-[var(--filet)] pt-3 text-[13px] text-[var(--texte-secondaire)]">
          {(r.estQuittance ? MENTIONS_QUITTANCE : MENTIONS_RECU_PARTIEL).map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
        <p>Fait le {formaterDateIso(datePaiement) || <ACompleter quoi="date" />}.</p>
        <p className="pt-6 font-semibold">
          {nomBailleur}
          <span className="block text-[13px] font-normal text-[var(--texte-secondaire)]">Signature</span>
        </p>
      </article>
    </div>
  );
}
