"use client";

import Link from "next/link";
import { useState } from "react";
import { CarteSaisie, Champ, Groupe, Segments } from "@/components/outils/champs";
import {
  Barres,
  Chiffre,
  ChiffreHero,
  DispositionOutil,
  LigneDetail,
  ListeDetail,
  PanneauResultat,
  Pastille,
} from "@/components/outils/resultats";
import { EXEMPLE_RENTABILITE, calculerRentabilite, type Credit } from "@/lib/outils/rentabilite";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";

const MODES_CREDIT: { valeur: Credit["mode"]; libelle: string }[] = [
  { valeur: "aucun", libelle: "Pas de crédit" },
  { valeur: "calcul", libelle: "Calculer la mensualité" },
  { valeur: "mensualite", libelle: "Saisir ma mensualité" },
];

/** L'échelle des barres de rentabilité : 10 %, ou plus si la brute dépasse. */
const ECHELLE_MIN = 0.1;

export function CalculateurRentabilite() {
  const e = EXEMPLE_RENTABILITE;
  const c = e.credit.mode === "calcul" ? e.credit : { montant: 0, tauxAnnuel: 0, dureeAnnees: 0 };
  const t = (n: number) => formaterNombre(n);
  const [prix, setPrix] = useState(t(e.prix));
  const [frais, setFrais] = useState(t(e.frais));
  const [travaux, setTravaux] = useState(t(e.travaux));
  const [loyer, setLoyer] = useState(t(e.loyerMensuel));
  const [charges, setCharges] = useState(t(e.chargesNonRecuperables));
  const [taxe, setTaxe] = useState(t(e.taxeFonciere));
  const [pno, setPno] = useState(t(e.assurancePno));
  const [gestion, setGestion] = useState(t(e.fraisGestion));
  const [vacance, setVacance] = useState(t(e.vacanceMois));
  const [modeCredit, setModeCredit] = useState<Credit["mode"]>(e.credit.mode);
  const [montant, setMontant] = useState(t(c.montant));
  const [taux, setTaux] = useState(t(c.tauxAnnuel * 100));
  const [duree, setDuree] = useState(t(c.dureeAnnees));
  const [mensualite, setMensualite] = useState("");

  const n = (s: string) => lireNombre(s) ?? 0;
  const credit: Credit =
    modeCredit === "aucun"
      ? { mode: "aucun" }
      : modeCredit === "mensualite"
        ? { mode: "mensualite", mensualite: n(mensualite) }
        : { mode: "calcul", montant: n(montant), tauxAnnuel: n(taux) / 100, dureeAnnees: n(duree) };
  const r = calculerRentabilite({
    prix: n(prix),
    frais: n(frais),
    travaux: n(travaux),
    loyerMensuel: n(loyer),
    chargesNonRecuperables: n(charges),
    taxeFonciere: n(taxe),
    assurancePno: n(pno),
    fraisGestion: n(gestion),
    vacanceMois: n(vacance),
    credit,
  });
  const echelle = Math.max(ECHELLE_MIN, r.rentabiliteBrute ?? 0);

  const saisie = (
    <CarteSaisie id="rt-saisie" titre="L'investissement">
      <Groupe legende="L'achat">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ id="rt-prix" libelle="Prix d'achat" valeur={prix} onChange={setPrix} suffixe="€" decimal />
          <Champ id="rt-frais" libelle="Frais d'acquisition" valeur={frais} onChange={setFrais} suffixe="€" decimal />
          <Champ id="rt-travaux" libelle="Travaux" valeur={travaux} onChange={setTravaux} suffixe="€" decimal />
        </div>
      </Groupe>
      <Groupe legende="Le loyer et les charges" description="Montants annuels, sauf le loyer.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="rt-loyer" libelle="Loyer mensuel hors charges" valeur={loyer} onChange={setLoyer} suffixe="€" decimal />
          <Champ
            id="rt-vacance"
            libelle="Vacance locative"
            valeur={vacance}
            onChange={setVacance}
            suffixe="mois"
            decimal
            aide="En mois de loyer perdus par an."
          />
          <Champ id="rt-charges" libelle="Charges non récupérables" valeur={charges} onChange={setCharges} suffixe="€" decimal />
          <Champ id="rt-taxe" libelle="Taxe foncière" valeur={taxe} onChange={setTaxe} suffixe="€" decimal />
          <Champ id="rt-pno" libelle="Assurance propriétaire non occupant" valeur={pno} onChange={setPno} suffixe="€" decimal />
          <Champ id="rt-gestion" libelle="Frais de gestion" valeur={gestion} onChange={setGestion} suffixe="€" decimal />
        </div>
      </Groupe>
      <Groupe legende="Le crédit (facultatif)">
        <Segments
          nom="rt-credit"
          libelle="Financement"
          valeur={modeCredit}
          onChange={setModeCredit}
          options={MODES_CREDIT}
          colonnes="grid-cols-1 sm:grid-cols-3"
        />
        {modeCredit === "calcul" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Champ id="rt-montant" libelle="Montant emprunté" valeur={montant} onChange={setMontant} suffixe="€" decimal />
            <Champ id="rt-taux" libelle="Taux annuel" valeur={taux} onChange={setTaux} suffixe="%" decimal />
            <Champ id="rt-duree" libelle="Durée" valeur={duree} onChange={setDuree} suffixe="ans" decimal />
          </div>
        )}
        {modeCredit === "mensualite" && (
          <Champ id="rt-mensualite" libelle="Mensualité" valeur={mensualite} onChange={setMensualite} suffixe="€" decimal />
        )}
      </Groupe>
    </CarteSaisie>
  );

  const resultat = (
    <PanneauResultat
      id="rt-resultat"
      pastille={
        r.cashFlowMensuel == null ? (
          <Pastille ton="neutre">Sans crédit</Pastille>
        ) : r.cashFlowMensuel >= 0 ? (
          <Pastille ton="succes">Cash-flow positif</Pastille>
        ) : (
          <Pastille ton="attention">Cash-flow négatif</Pastille>
        )
      }
    >
      <ChiffreHero
        libelle="Rentabilité nette de charges"
        valeur={r.rentabiliteNette == null ? "—" : formaterPourcent(r.rentabiliteNette)}
        testId="rt-nette"
        sous={
          <>
            Revenu net de charges et de vacance :{" "}
            <b className="montant text-[var(--encre)]">{formaterEuros(r.revenuNet)}</b> par an.
          </>
        }
      />
      <Barres
        libelle="Rentabilité brute et nette"
        max={echelle}
        barres={[
          {
            libelle: "Rentabilité brute",
            valeur: r.rentabiliteBrute ?? 0,
            texte: r.rentabiliteBrute == null ? "—" : formaterPourcent(r.rentabiliteBrute),
            ton: "pale",
            testId: "rt-brute",
          },
          {
            libelle: "Rentabilité nette de charges",
            valeur: r.rentabiliteNette ?? 0,
            texte: r.rentabiliteNette == null ? "—" : formaterPourcent(r.rentabiliteNette),
            ton: "marque",
          },
        ]}
      />
      <p className="-mt-2 text-[12px] text-[var(--texte-secondaire)]">Échelle : de 0 à {formaterPourcent(echelle)}.</p>
      {r.cashFlowMensuel != null && (
        <div className="grid grid-cols-2 gap-3">
          <Chiffre libelle="Cash-flow mensuel" valeur={formaterEuros(r.cashFlowMensuel)} testId="rt-cashflow" accent />
          <Chiffre libelle="Mensualité de crédit" valeur={r.mensualite == null ? "—" : formaterEuros(r.mensualite)} />
        </div>
      )}
      <ListeDetail libelle="Détail">
        <LigneDetail libelle="Prix total (achat, frais, travaux)" valeur={formaterEuros(r.prixTotal)} />
        <LigneDetail libelle="Loyers de l'année" valeur={formaterEuros(r.loyerAnnuel)} />
        <LigneDetail libelle="Charges et vacance" valeur={`− ${formaterEuros(r.loyerAnnuel - r.revenuNet)}`} />
        <LigneDetail libelle="Revenu net de l'année" valeur={formaterEuros(r.revenuNet)} fort />
      </ListeDetail>
      <p className="text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
        Avant impôt{modeCredit === "calcul" && " ; mensualité par la formule d'annuité, hors assurance emprunteur"}. Pour
        un meublé,{" "}
        <Link href="/outils/simulateur-lmnp" className="lien-texte">
          le simulateur LMNP
        </Link>{" "}
        prend le relais.
      </p>
    </PanneauResultat>
  );

  return <DispositionOutil saisie={saisie} resultat={resultat} />;
}
