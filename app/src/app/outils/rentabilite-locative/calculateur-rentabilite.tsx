"use client";

import Link from "next/link";
import { useState } from "react";
import { CLASSE_CARTE, Champ, Chiffre, Choix, Groupe } from "@/components/outils/champs";
import { EXEMPLE_RENTABILITE, calculerRentabilite, type Credit } from "@/lib/outils/rentabilite";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";

const MODES_CREDIT: { valeur: Credit["mode"]; libelle: string }[] = [
  { valeur: "aucun", libelle: "Pas de crédit" },
  { valeur: "calcul", libelle: "Calculer la mensualité" },
  { valeur: "mensualite", libelle: "Saisir ma mensualité" },
];

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

  return (
    <div className="space-y-5">
      <section className={`${CLASSE_CARTE} space-y-5`} aria-labelledby="rt-saisie">
        <h2 id="rt-saisie" className="text-[length:var(--pas-section)]">
          L&apos;investissement
        </h2>
        <Groupe legende="L'achat">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ id="rt-prix" libelle="Prix d'achat" valeur={prix} onChange={setPrix} suffixe="€" decimal />
            <Champ id="rt-frais" libelle="Frais d'acquisition" valeur={frais} onChange={setFrais} suffixe="€" decimal />
            <Champ id="rt-travaux" libelle="Travaux" valeur={travaux} onChange={setTravaux} suffixe="€" decimal />
          </div>
        </Groupe>
        <Groupe legende="Les loyers et les charges, par an">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ id="rt-loyer" libelle="Loyer mensuel hors charges" valeur={loyer} onChange={setLoyer} suffixe="€" decimal />
            <Champ id="rt-charges" libelle="Charges non récupérables" valeur={charges} onChange={setCharges} suffixe="€" decimal />
            <Champ id="rt-taxe" libelle="Taxe foncière" valeur={taxe} onChange={setTaxe} suffixe="€" decimal />
            <Champ id="rt-pno" libelle="Assurance propriétaire non occupant" valeur={pno} onChange={setPno} suffixe="€" decimal />
            <Champ id="rt-gestion" libelle="Frais de gestion" valeur={gestion} onChange={setGestion} suffixe="€" decimal />
            <Champ
              id="rt-vacance"
              libelle="Vacance locative"
              valeur={vacance}
              onChange={setVacance}
              suffixe="mois"
              decimal
              aide="En mois de loyer perdus par an."
            />
          </div>
        </Groupe>
        <Groupe legende="Le crédit (facultatif)">
          <div className="grid gap-3 sm:grid-cols-3">
            <Choix id="rt-credit" libelle="Financement" valeur={modeCredit} onChange={setModeCredit} options={MODES_CREDIT} />
            {modeCredit === "calcul" && (
              <>
                <Champ id="rt-montant" libelle="Montant emprunté" valeur={montant} onChange={setMontant} suffixe="€" decimal />
                <Champ id="rt-taux" libelle="Taux annuel" valeur={taux} onChange={setTaux} suffixe="%" decimal />
                <Champ id="rt-duree" libelle="Durée" valeur={duree} onChange={setDuree} suffixe="ans" decimal />
              </>
            )}
            {modeCredit === "mensualite" && (
              <Champ id="rt-mensualite" libelle="Mensualité" valeur={mensualite} onChange={setMensualite} suffixe="€" decimal />
            )}
          </div>
        </Groupe>
      </section>

      <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="rt-resultat" aria-live="polite">
        <h2 id="rt-resultat" className="text-[length:var(--pas-section)]">
          Résultat
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Chiffre
            libelle="Rentabilité brute"
            valeur={r.rentabiliteBrute == null ? "—" : formaterPourcent(r.rentabiliteBrute)}
            testId="rt-brute"
            accent
          />
          <Chiffre
            libelle="Rentabilité nette de charges"
            valeur={r.rentabiliteNette == null ? "—" : formaterPourcent(r.rentabiliteNette)}
            testId="rt-nette"
          />
          <Chiffre libelle="Prix total" valeur={formaterEuros(r.prixTotal)} />
          {r.cashFlowMensuel != null && (
            <Chiffre libelle="Cash-flow mensuel" valeur={formaterEuros(r.cashFlowMensuel)} testId="rt-cashflow" />
          )}
        </div>
        <p className="text-[13.5px] text-[var(--texte-secondaire)]">
          Revenu net de charges et de vacance : <b className="montant text-[var(--encre)]">{formaterEuros(r.revenuNet)}</b>{" "}
          par an.
          {r.mensualite != null && (
            <>
              {" "}
              Mensualité de crédit retenue : <b className="montant text-[var(--encre)]">{formaterEuros(r.mensualite)}</b>
              {modeCredit === "calcul" && " (formule d'annuité, hors assurance emprunteur)"}.
            </>
          )}
        </p>
        <p className="text-[13px] text-[var(--texte-secondaire)]">
          Avant impôt : la fiscalité dépend du régime (location nue ou meublée, micro ou réel). Pour un meublé,{" "}
          <Link href="/outils/simulateur-lmnp" className="lien-texte">
            le simulateur LMNP
          </Link>{" "}
          prend le relais.
        </p>
      </section>
    </div>
  );
}
