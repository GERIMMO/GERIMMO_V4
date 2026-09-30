"use client";

import { useState } from "react";
import { Alerte, CarteSaisie, Case, Champ, Choix, Groupe, Segments } from "@/components/outils/champs";
import {
  Barres,
  DispositionOutil,
  LigneDetail,
  ListeDetail,
  PanneauResultat,
  Pastille,
} from "@/components/outils/resultats";
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

  const saisie = (
    <CarteSaisie id="cmp-saisie" titre="Le logement et le locataire">
      <Groupe legende="Le logement">
        <Champ id="cmp-loyer" libelle="Loyer mensuel charges comprises" valeur={loyerCc} onChange={setLoyerCc} suffixe="€" decimal />
        <Choix id="cmp-zone" libelle="Situation du logement" valeur={zone} onChange={setZone} options={ZONES_VISALE} />
      </Groupe>
      <Groupe legende="Le locataire">
        <Segments nom="cmp-age" libelle="Âge du locataire" valeur={age} onChange={setAge} options={[...AGES]} />
        {age === "30-plus" && (
          <Choix
            id="cmp-situation"
            libelle="Situation du locataire"
            valeur={situation}
            onChange={setSituation}
            options={SITUATIONS_TRENTE_PLUS}
          />
        )}
        <Case id="cmp-etudiant" coche={etudiant} onChange={setEtudiant} libelle="Le locataire est étudiant, sans revenus" />
      </Groupe>
      <Groupe legende="Votre assurance loyers impayés (GLI)">
        <Champ
          id="cmp-taux"
          libelle="Taux de la prime"
          valeur={taux}
          onChange={setTaux}
          suffixe="%"
          decimal
          aide="Du loyer charges comprises annuel ; selon le contrat de l'assureur."
        />
        <Segments
          nom="cmp-tmi"
          libelle="Tranche marginale d'imposition"
          valeur={tmi}
          onChange={setTmi}
          options={TMI}
          colonnes="grid-cols-5"
        />
      </Groupe>
    </CarteSaisie>
  );

  const resultat = (
    <PanneauResultat
      id="cmp-resultat"
      titre="Comparaison"
      pastille={
        visale.eligible ? <Pastille ton="succes">Visale possible</Pastille> : <Pastille ton="erreur">Visale exclue</Pastille>
      }
    >
      <section aria-labelledby="cmp-visale" className="space-y-3">
        <h3 id="cmp-visale" className="text-[13.5px] font-medium text-[var(--texte-secondaire)]">
          Visale (Action Logement)
        </h3>
        <p
          data-testid="cmp-visale-verdict"
          className={`font-heading text-[28px] font-extrabold leading-[1.1] tracking-[-0.02em] ${
            visale.eligible ? "text-[var(--success)]" : "text-[var(--destructive-soft-foreground)]"
          }`}
        >
          {visale.eligible ? "Visale est possible" : "Visale est exclue"}
        </p>
        {visale.motifs.map((m) => (
          <Alerte key={m} gravite="erreur">
            {m}
          </Alerte>
        ))}
        <p className="text-[13.5px] text-[var(--texte-secondaire)]">
          Plafond de loyer charges comprises retenu :{" "}
          <b className="montant text-[var(--encre)]">{formaterEuros(visale.plafond)}</b>. Coût pour le bailleur : aucun.
        </p>
      </section>

      <section aria-labelledby="cmp-gli" className="space-y-4 border-t border-[var(--filet-leger)] pt-5">
        <h3 id="cmp-gli" className="text-[13.5px] font-medium text-[var(--texte-secondaire)]">
          Assurance loyers impayés (GLI)
        </h3>
        {gli ? (
          <>
            <Barres
              libelle="Coût annuel pour le bailleur"
              barres={[
                ...(visale.eligible
                  ? [{ libelle: "Visale", valeur: 0, texte: "Gratuit", ton: "succes" as const }]
                  : []),
                { libelle: "GLI, coût brut", valeur: gli.brutAnnuel, texte: formaterEuros(gli.brutAnnuel), ton: "pale" as const },
                {
                  libelle: "GLI, net d'impôt (régime réel)",
                  valeur: gli.netAnnuel,
                  texte: formaterEuros(gli.netAnnuel),
                  ton: "marque" as const,
                },
              ]}
            />
            <ListeDetail libelle="Coût de la GLI">
              <LigneDetail libelle="Coût brut par an" valeur={formaterEuros(gli.brutAnnuel)} testId="cmp-gli-brut" />
              <LigneDetail libelle="Coût net d'impôt par mois" valeur={formaterEuros(gli.netMensuel)} />
              <LigneDetail libelle="Coût net d'impôt par an" valeur={formaterEuros(gli.netAnnuel)} testId="cmp-gli-net" fort />
            </ListeDetail>
          </>
        ) : (
          <p className="rounded-xl bg-[var(--creme)] px-4 py-4 text-[14px] text-[var(--texte-secondaire)]">
            Renseignez le loyer et le taux.
          </p>
        )}
      </section>
    </PanneauResultat>
  );

  return (
    <div className="space-y-6">
      <DispositionOutil saisie={saisie} resultat={resultat} />
      <section className="outil-saisie print:hidden" aria-labelledby="cmp-couverture">
        <h2 id="cmp-couverture" className="outil-carte-titre">
          Ce que couvre Visale
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {COUVERTURE_VISALE.map((c) => (
            <li key={c} className="flex gap-3 rounded-xl bg-[var(--creme)] px-4 py-3 text-[14px] leading-snug text-[var(--corps)]">
              <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 size-4 shrink-0 fill-none stroke-[var(--success)] stroke-[2.2]">
                <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
