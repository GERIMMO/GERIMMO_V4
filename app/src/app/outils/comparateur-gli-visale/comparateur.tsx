"use client";

import { useState } from "react";
import { Alerte, CLASSE_CARTE, Case, Champ, Chiffre, Choix, Groupe } from "@/components/outils/champs";
import {
  COUVERTURE_VISALE,
  SITUATIONS_TRENTE_PLUS,
  TAUX_GLI_PAR_DEFAUT,
  TRANCHES_TMI,
  ZONES_VISALE,
  coutGli,
  evaluerVisale,
  type SituationTrentePlus,
  type ZoneVisale,
} from "@/lib/outils/gli-visale";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";

const AGES = [
  { valeur: "moins-30", libelle: "Moins de 30 ans" },
  { valeur: "30-plus", libelle: "30 ans ou plus" },
] as const;

const TMI = TRANCHES_TMI.map((t) => ({ valeur: String(t), libelle: formaterPourcent(t) }));

export function ComparateurGliVisale() {
  const [loyerCc, setLoyerCc] = useState("970");
  const [zone, setZone] = useState<ZoneVisale>("reste");
  const [age, setAge] = useState<(typeof AGES)[number]["valeur"]>("moins-30");
  const [situation, setSituation] = useState<SituationTrentePlus>("salarie-recent");
  const [etudiant, setEtudiant] = useState(false);
  const [taux, setTaux] = useState(formaterNombre(TAUX_GLI_PAR_DEFAUT * 100));
  const [tmi, setTmi] = useState("0.3");

  const loyer = lireNombre(loyerCc);
  const tauxSaisi = lireNombre(taux);
  const visale = evaluerVisale({
    zone,
    moinsDe30Ans: age === "moins-30",
    situation,
    etudiantSansRevenus: etudiant,
    loyerCc: loyer,
  });
  const gli = coutGli({ loyerCc: loyer, taux: tauxSaisi == null ? null : tauxSaisi / 100, tmi: Number(tmi) });

  return (
    <div className="space-y-5">
      <section className={`${CLASSE_CARTE} space-y-5`} aria-labelledby="cmp-saisie">
        <h2 id="cmp-saisie" className="text-[length:var(--pas-section)]">
          Le logement et le locataire
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ id="cmp-loyer" libelle="Loyer mensuel charges comprises" valeur={loyerCc} onChange={setLoyerCc} suffixe="€" decimal />
          <Choix id="cmp-zone" libelle="Situation du logement" valeur={zone} onChange={setZone} options={ZONES_VISALE} />
          <Choix id="cmp-age" libelle="Âge du locataire" valeur={age} onChange={setAge} options={[...AGES]} />
          {age === "30-plus" && (
            <Choix
              id="cmp-situation"
              libelle="Situation du locataire"
              valeur={situation}
              onChange={setSituation}
              options={SITUATIONS_TRENTE_PLUS}
            />
          )}
        </div>
        <Case id="cmp-etudiant" coche={etudiant} onChange={setEtudiant} libelle="Le locataire est étudiant, sans revenus" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="cmp-visale" aria-live="polite">
          <h2 id="cmp-visale" className="text-[length:var(--pas-section)]">
            Visale (Action Logement)
          </h2>
          <p
            data-testid="cmp-visale-verdict"
            className={`font-heading text-[20px] font-bold ${visale.eligible ? "text-[var(--success)]" : "text-[var(--destructive)]"}`}
          >
            {visale.eligible ? "Visale est possible" : "Visale est exclue"}
          </p>
          {visale.motifs.map((m) => (
            <Alerte key={m} gravite="erreur">
              {m}
            </Alerte>
          ))}
          <p className="text-[14px] text-[var(--texte-secondaire)]">
            Plafond de loyer charges comprises retenu :{" "}
            <b className="montant text-[var(--encre)]">{formaterEuros(visale.plafond)}</b>. Coût pour le bailleur : aucun.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[14px]">
            {COUVERTURE_VISALE.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>

        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="cmp-gli" aria-live="polite">
          <h2 id="cmp-gli" className="text-[length:var(--pas-section)]">
            Assurance loyers impayés (GLI)
          </h2>
          <Groupe legende="Votre contrat et votre imposition">
            <div className="grid gap-3 sm:grid-cols-2">
              <Champ
                id="cmp-taux"
                libelle="Taux de la prime"
                valeur={taux}
                onChange={setTaux}
                suffixe="%"
                decimal
                aide="Du loyer charges comprises annuel ; selon le contrat de l'assureur."
              />
              <Choix id="cmp-tmi" libelle="Tranche marginale d'imposition" valeur={tmi} onChange={setTmi} options={TMI} />
            </div>
          </Groupe>
          {gli ? (
            <div className="grid grid-cols-2 gap-4">
              <Chiffre libelle="Coût brut par an" valeur={formaterEuros(gli.brutAnnuel)} testId="cmp-gli-brut" />
              <Chiffre libelle="Coût net d'impôt par an" valeur={formaterEuros(gli.netAnnuel)} testId="cmp-gli-net" accent />
            </div>
          ) : (
            <p className="text-[14px] text-[var(--texte-secondaire)]">Renseignez le loyer et le taux.</p>
          )}
          <p className="text-[13px] text-[var(--texte-secondaire)]">
            Net = brut × (1 − (tranche marginale + 17,2 % de prélèvements sociaux)) : la prime se déduit des revenus
            fonciers au régime réel. Au micro-foncier, elle ne se déduit pas : le coût net est le coût brut.
          </p>
        </section>
      </div>
    </div>
  );
}
