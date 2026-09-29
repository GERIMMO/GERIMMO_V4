"use client";

import { useState } from "react";
import { Alerte, CLASSE_CARTE, Case, Champ, Chiffre, Choix, Groupe } from "@/components/outils/champs";
import { TRANCHES_TMI } from "@/lib/outils/gli-visale";
import { DEFAUTS_LMNP, PLAFOND_MICRO_BIC, simulerLmnp } from "@/lib/outils/lmnp";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";

const TMI = TRANCHES_TMI.map((t) => ({ valeur: String(t), libelle: formaterPourcent(t) }));
const t = (n: number) => formaterNombre(n);

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <tr className={fort ? "total" : undefined}>
      <td>{libelle}</td>
      <td className="nombre">{valeur}</td>
    </tr>
  );
}

export function SimulateurLmnp() {
  const d = DEFAUTS_LMNP;
  const [recettes, setRecettes] = useState(t(d.recettes));
  const [charges, setCharges] = useState(t(d.charges));
  const [prix, setPrix] = useState(t(d.prix));
  const [frais, setFrais] = useState(t(d.frais));
  const [fraisAmortis, setFraisAmortis] = useState(d.fraisAmortis);
  const [terrain, setTerrain] = useState(t(d.partTerrain * 100));
  const [dureeBati, setDureeBati] = useState(t(d.dureeBati));
  const [mobilier, setMobilier] = useState(t(d.mobilier));
  const [dureeMobilier, setDureeMobilier] = useState(t(d.dureeMobilier));
  const [travaux, setTravaux] = useState(t(d.travaux));
  const [dureeTravaux, setDureeTravaux] = useState(t(d.dureeTravaux));
  const [tmi, setTmi] = useState(String(d.tmi));

  const n = (s: string) => lireNombre(s) ?? 0;
  const r = simulerLmnp({
    recettes: n(recettes),
    charges: n(charges),
    prix: n(prix),
    frais: n(frais),
    fraisAmortis,
    partTerrain: Math.min(100, Math.max(0, n(terrain))) / 100,
    dureeBati: n(dureeBati),
    mobilier: n(mobilier),
    dureeMobilier: n(dureeMobilier),
    travaux: n(travaux),
    dureeTravaux: n(dureeTravaux),
    tmi: Number(tmi),
    prelevementsSociaux: d.prelevementsSociaux,
  });
  const { micro, reel } = r;

  return (
    <div className="space-y-5">
      <section className={`${CLASSE_CARTE} space-y-5`} aria-labelledby="lmnp-saisie">
        <h2 id="lmnp-saisie" className="text-[length:var(--pas-section)]">
          Votre location meublée
        </h2>
        <Groupe legende="L'année">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ id="lmnp-recettes" libelle="Loyers encaissés (recettes)" valeur={recettes} onChange={setRecettes} suffixe="€" decimal />
            <Champ
              id="lmnp-charges"
              libelle="Charges déductibles"
              valeur={charges}
              onChange={setCharges}
              suffixe="€"
              decimal
              aide="Taxe foncière, assurance, intérêts d'emprunt, copropriété, comptabilité…"
            />
            <Choix id="lmnp-tmi" libelle="Tranche marginale d'imposition" valeur={tmi} onChange={setTmi} options={TMI} />
          </div>
        </Groupe>
        <Groupe legende="Le bien">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ id="lmnp-prix" libelle="Prix d'achat" valeur={prix} onChange={setPrix} suffixe="€" decimal />
            <Champ id="lmnp-frais" libelle="Frais d'acquisition" valeur={frais} onChange={setFrais} suffixe="€" decimal />
            <Champ
              id="lmnp-terrain"
              libelle="Part du terrain"
              valeur={terrain}
              onChange={setTerrain}
              suffixe="%"
              decimal
              aide="Le terrain ne s'amortit pas."
            />
          </div>
          <Case id="lmnp-frais-amortis" coche={fraisAmortis} onChange={setFraisAmortis} libelle="Amortir les frais d'acquisition avec le bien" />
        </Groupe>
        <Groupe legende="Durées d'amortissement">
          <div className="grid gap-3 sm:grid-cols-3">
            <Champ id="lmnp-duree-bati" libelle="Bâti" valeur={dureeBati} onChange={setDureeBati} suffixe="ans" decimal />
            <Champ id="lmnp-mobilier" libelle="Mobilier" valeur={mobilier} onChange={setMobilier} suffixe="€" decimal />
            <Champ id="lmnp-duree-mobilier" libelle="Durée du mobilier" valeur={dureeMobilier} onChange={setDureeMobilier} suffixe="ans" decimal />
            <Champ id="lmnp-travaux" libelle="Travaux" valeur={travaux} onChange={setTravaux} suffixe="€" decimal />
            <Champ id="lmnp-duree-travaux" libelle="Durée des travaux" valeur={dureeTravaux} onChange={setDureeTravaux} suffixe="ans" decimal />
          </div>
        </Groupe>
      </section>

      <div className="grid gap-5 lg:grid-cols-2" aria-live="polite">
        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="lmnp-micro">
          <h2 id="lmnp-micro" className="text-[length:var(--pas-section)]">
            Micro-BIC
          </h2>
          {micro.applicable ? (
            <>
              <Chiffre libelle="Impôt et prélèvements sociaux" valeur={formaterEuros(micro.impot)} testId="lmnp-impot-micro" />
              <div className="tableau-defilant">
                <table className="tableau">
                  <tbody>
                    <Ligne libelle="Recettes" valeur={formaterEuros(n(recettes))} />
                    <Ligne libelle="Abattement forfaitaire (50 %, 305 € au minimum)" valeur={`− ${formaterEuros(micro.abattement)}`} />
                    <Ligne libelle="Base imposable" valeur={formaterEuros(micro.base)} fort />
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <Alerte gravite="attention">{micro.motif}</Alerte>
          )}
        </section>

        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="lmnp-reel">
          <h2 id="lmnp-reel" className="text-[length:var(--pas-section)]">
            Régime réel
          </h2>
          <Chiffre libelle="Impôt et prélèvements sociaux" valeur={formaterEuros(reel.impot)} testId="lmnp-impot-reel" accent />
          <div className="tableau-defilant">
            <table className="tableau">
              <tbody>
                <Ligne libelle="Résultat avant amortissement" valeur={formaterEuros(reel.resultatAvantAmortissement)} />
                <Ligne libelle="Amortissement du bâti" valeur={formaterEuros(reel.amortissementBati)} />
                <Ligne libelle="Amortissement du mobilier" valeur={formaterEuros(reel.amortissementMobilier)} />
                <Ligne libelle="Amortissement des travaux" valeur={formaterEuros(reel.amortissementTravaux)} />
                <Ligne libelle="Amortissement déduit cette année" valeur={`− ${formaterEuros(reel.amortissementUtilise)}`} />
                <Ligne libelle="Base imposable" valeur={formaterEuros(reel.base)} fort />
              </tbody>
            </table>
          </div>
          {reel.amortissementReporte > 0 && (
            <p data-testid="lmnp-reporte" className="text-[14px] text-[var(--texte-secondaire)]">
              Amortissement reporté : <b className="montant text-[var(--encre)]">{formaterEuros(reel.amortissementReporte)}</b>.
              L&apos;amortissement ne peut pas créer de déficit (article 39 C du CGI) : la part non déduite se reporte sur
              les années suivantes, sans limite de durée.
            </p>
          )}
          {reel.deficitReportable > 0 && (
            <Alerte gravite="info">
              Déficit de {formaterEuros(reel.deficitReportable)} avant amortissement : il s&apos;impute sur les bénéfices de
              location meublée non professionnelle des 10 années suivantes.
            </Alerte>
          )}
        </section>
      </div>

      {r.economieReel != null && (
        <section className={`${CLASSE_CARTE}`} aria-labelledby="lmnp-bilan">
          <h2 id="lmnp-bilan" className="sr-only">
            Bilan
          </h2>
          <Chiffre
            libelle={r.economieReel >= 0 ? "Économie du régime réel sur l'année" : "Surcoût du régime réel sur l'année"}
            valeur={formaterEuros(Math.abs(r.economieReel))}
            testId="lmnp-economie"
            accent
          />
        </section>
      )}
      <p className="text-[13px] text-[var(--texte-secondaire)]">
        Impôt = base × (tranche marginale + 17,2 % de prélèvements sociaux). Micro-BIC ouvert jusqu&apos;à{" "}
        {formaterEuros(PLAFOND_MICRO_BIC)} de recettes.
      </p>
    </div>
  );
}
