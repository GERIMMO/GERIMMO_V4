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
import { enumerer, nombresManquants } from "@/lib/outils/saisie";

const MODES_CREDIT: { valeur: Credit["mode"]; libelle: string }[] = [
  { valeur: "aucun", libelle: "Pas de crédit" },
  { valeur: "calcul", libelle: "Calculer la mensualité" },
  { valeur: "mensualite", libelle: "Saisir ma mensualité" },
];

/** L'échelle des barres de rentabilité : 10 %, ou plus si la brute dépasse. */
const ECHELLE_MIN = 0.1;

/** L'exemple d'un champ, en texte indicatif : « Ex. 150 000 ». */
const ex = (n: number) => `Ex. ${formaterNombre(n)}`;

/**
 * Ce qui manque au crédit à calculer. Un crédit choisi ne se calcule pas sur un montant ou une durée nuls : la mensualité
 * n'existait pas, et le résultat s'affichait « Sans crédit », alors que l'utilisateur avait choisi d'emprunter. Mêmes
 * bornes que `mensualiteCredit` : montant positif, au moins un mois, taux positif ou nul.
 */
function manquesCredit(montant: string, taux: string, duree: string): string[] {
  const m = lireNombre(montant);
  const t = lireNombre(taux);
  const d = lireNombre(duree);
  return [
    ...(m == null ? ["le montant emprunté"] : m > 0 ? [] : ["un montant emprunté supérieur à 0"]),
    ...(t == null ? ["le taux annuel"] : t >= 0 ? [] : ["un taux annuel positif ou nul"]),
    ...(d == null ? ["la durée du crédit"] : Math.round(d * 12) > 0 ? [] : ["une durée du crédit d'au moins un mois"]),
  ];
}

/** Même règle pour une mensualité saisie : nulle, elle donnait aussi « Sans crédit ». */
function manquesMensualite(mensualite: string): string[] {
  const m = lireNombre(mensualite);
  return m == null ? ["la mensualité"] : m > 0 ? [] : ["une mensualité supérieure à 0"];
}

export function CalculateurRentabilite() {
  // Décision du dirigeant du 25/11/2026 pour l'outil IRL (Q100), appliquée ici (Q123) : AUCUN champ ne démarre avec une
  // valeur. L'exemple (prix de 150 000 €, loyer de 750 €, crédit de 160 000 € à 3,5 % sur 20 ans…) était posé dans les
  // champs, et les rentabilités s'affichaient sans rien saisir. Il n'est plus qu'un texte indicatif ; le résultat attend
  // chaque champ (0 pour un montant nul) et le choix du financement, et un message dit ce qui manque.
  const e = EXEMPLE_RENTABILITE;
  const c = e.credit.mode === "calcul" ? e.credit : { montant: 0, tauxAnnuel: 0, dureeAnnees: 0 };
  const [prix, setPrix] = useState("");
  const [frais, setFrais] = useState("");
  const [travaux, setTravaux] = useState("");
  const [loyer, setLoyer] = useState("");
  const [charges, setCharges] = useState("");
  const [taxe, setTaxe] = useState("");
  const [pno, setPno] = useState("");
  const [gestion, setGestion] = useState("");
  const [vacance, setVacance] = useState("");
  const [modeCredit, setModeCredit] = useState<Credit["mode"] | null>(null);
  const [montant, setMontant] = useState("");
  const [taux, setTaux] = useState("");
  const [duree, setDuree] = useState("");
  const [mensualite, setMensualite] = useState("");

  const manques = [
    ...nombresManquants([
      [prix, "le prix d'achat"],
      [frais, "les frais d'acquisition"],
      [travaux, "les travaux"],
      [loyer, "le loyer mensuel"],
      [vacance, "la vacance locative"],
      [charges, "les charges non récupérables"],
      [taxe, "la taxe foncière"],
      [pno, "l'assurance propriétaire non occupant"],
      [gestion, "les frais de gestion"],
    ]),
    ...(modeCredit ? [] : ["le financement"]),
    ...(modeCredit === "calcul" ? manquesCredit(montant, taux, duree) : []),
    ...(modeCredit === "mensualite" ? manquesMensualite(mensualite) : []),
  ];

  const n = (s: string) => lireNombre(s) ?? 0;
  const credit: Credit =
    modeCredit === "mensualite"
      ? { mode: "mensualite", mensualite: n(mensualite) }
      : modeCredit === "calcul"
        ? { mode: "calcul", montant: n(montant), tauxAnnuel: n(taux) / 100, dureeAnnees: n(duree) }
        : { mode: "aucun" };
  const r =
    manques.length === 0
      ? calculerRentabilite({
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
        })
      : null;

  const saisie = (
    <CarteSaisie id="rt-saisie" titre="L'investissement">
      <Groupe legende="L'achat" description="Saisissez 0 s'il n'y a ni frais ni travaux.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ id="rt-prix" libelle="Prix d'achat" valeur={prix} onChange={setPrix} suffixe="€" decimal placeholder={ex(e.prix)} />
          <Champ id="rt-frais" libelle="Frais d'acquisition" valeur={frais} onChange={setFrais} suffixe="€" decimal placeholder={ex(e.frais)} />
          <Champ id="rt-travaux" libelle="Travaux" valeur={travaux} onChange={setTravaux} suffixe="€" decimal placeholder={ex(e.travaux)} />
        </div>
      </Groupe>
      <Groupe legende="Le loyer et les charges" description="Montants annuels, sauf le loyer ; 0 pour une charge que vous n'avez pas.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="rt-loyer" libelle="Loyer mensuel hors charges" valeur={loyer} onChange={setLoyer} suffixe="€" decimal placeholder={ex(e.loyerMensuel)} />
          <Champ
            id="rt-vacance"
            libelle="Vacance locative"
            valeur={vacance}
            onChange={setVacance}
            suffixe="mois"
            decimal
            placeholder={ex(e.vacanceMois)}
            aide="En mois de loyer perdus par an."
          />
          <Champ
            id="rt-charges"
            libelle="Charges non récupérables"
            valeur={charges}
            onChange={setCharges}
            suffixe="€"
            decimal
            placeholder={ex(e.chargesNonRecuperables)}
          />
          <Champ id="rt-taxe" libelle="Taxe foncière" valeur={taxe} onChange={setTaxe} suffixe="€" decimal placeholder={ex(e.taxeFonciere)} />
          <Champ
            id="rt-pno"
            libelle="Assurance propriétaire non occupant"
            valeur={pno}
            onChange={setPno}
            suffixe="€"
            decimal
            placeholder={ex(e.assurancePno)}
          />
          <Champ id="rt-gestion" libelle="Frais de gestion" valeur={gestion} onChange={setGestion} suffixe="€" decimal placeholder={ex(e.fraisGestion)} />
        </div>
      </Groupe>
      <Groupe legende="Le financement" description="Sans emprunt, choisissez « Pas de crédit ».">
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
            <Champ id="rt-montant" libelle="Montant emprunté" valeur={montant} onChange={setMontant} suffixe="€" decimal placeholder={ex(c.montant)} />
            <Champ id="rt-taux" libelle="Taux annuel" valeur={taux} onChange={setTaux} suffixe="%" decimal placeholder={ex(c.tauxAnnuel * 100)} />
            <Champ id="rt-duree" libelle="Durée" valeur={duree} onChange={setDuree} suffixe="ans" decimal placeholder={ex(c.dureeAnnees)} />
          </div>
        )}
        {modeCredit === "mensualite" && (
          <Champ id="rt-mensualite" libelle="Mensualité" valeur={mensualite} onChange={setMensualite} suffixe="€" decimal />
        )}
      </Groupe>
    </CarteSaisie>
  );

  if (!r) {
    return (
      <DispositionOutil
        saisie={saisie}
        resultat={
          <PanneauResultat
            id="rt-resultat"
            pastille={
              <Pastille ton="neutre" testId="rt-etat">
                À compléter
              </Pastille>
            }
          >
            <p data-testid="rt-manque" className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-5 text-[14px] text-[var(--texte-secondaire)]">
              Renseignez {enumerer(manques)}.
            </p>
          </PanneauResultat>
        }
      />
    );
  }

  const echelle = Math.max(ECHELLE_MIN, r.rentabiliteBrute ?? 0);

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
