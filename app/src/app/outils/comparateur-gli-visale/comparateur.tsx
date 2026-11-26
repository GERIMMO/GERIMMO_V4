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
  TAUX_GLI_EXEMPLE,
  TRANCHES_TMI,
  ZONES_VISALE,
  coutGli,
  evaluerVisale,
  type SituationTrentePlus,
  type ZoneVisale,
} from "@/lib/outils/gli-visale";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";
import { enumerer } from "@/lib/outils/saisie";

const AGES = [
  { valeur: "moins-30", libelle: "Moins de 30 ans" },
  { valeur: "30-plus", libelle: "30 ans ou plus" },
] as const;

const TMI = TRANCHES_TMI.map((t) => ({ valeur: String(t), libelle: formaterPourcent(t) }));

const MESSAGE_A_COMPLETER = "rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-4 text-[14px] text-[var(--texte-secondaire)]";

export function ComparateurGliVisale() {
  // Décision du dirigeant du 25/11/2026 pour l'outil IRL (Q100), appliquée ici (Q123) : AUCUN champ ne démarre avec une
  // valeur. Le loyer de 970 €, la zone « Reste du territoire », l'âge « Moins de 30 ans », la situation, le taux de 2,7 %
  // et la tranche de 30 % étaient posés d'office, et le verdict et le coût s'affichaient sans rien saisir. Un exemple ne
  // s'affiche plus qu'en texte indicatif ; verdict et coût attendent leurs champs, et un message dit lesquels.
  const [loyerCc, setLoyerCc] = useState("");
  const [zone, setZone] = useState<ZoneVisale | "">("");
  const [age, setAge] = useState<(typeof AGES)[number]["valeur"] | null>(null);
  const [situation, setSituation] = useState<SituationTrentePlus | "">("");
  const [etudiant, setEtudiant] = useState(false);
  const [taux, setTaux] = useState("");
  const [tmi, setTmi] = useState<string | null>(null);

  const loyer = lireNombre(loyerCc);
  const tauxSaisi = lireNombre(taux);
  const loyerSaisi = loyer != null && loyer > 0;
  const manquesVisale = [
    ...(loyerSaisi ? [] : ["le loyer charges comprises"]),
    ...(zone ? [] : ["la situation du logement"]),
    ...(age ? [] : ["l'âge du locataire"]),
    ...(age === "30-plus" && !situation ? ["la situation du locataire"] : []),
  ];
  const manquesGli = [
    ...(loyerSaisi ? [] : ["le loyer charges comprises"]),
    ...(tauxSaisi != null && tauxSaisi >= 0 ? [] : ["le taux de la prime"]),
    ...(tmi ? [] : ["la tranche marginale d'imposition"]),
  ];
  const visale =
    manquesVisale.length === 0 && zone
      ? evaluerVisale({
          zone,
          moinsDe30Ans: age === "moins-30",
          situation: age === "30-plus" && situation ? situation : null,
          etudiantSansRevenus: etudiant,
          loyerCc: loyer,
        })
      : null;
  const gli =
    manquesGli.length === 0 && tauxSaisi != null && tmi
      ? coutGli({ loyerCc: loyer, taux: tauxSaisi / 100, tmi: Number(tmi) })
      : null;

  const saisie = (
    <CarteSaisie id="cmp-saisie" titre="Le logement et le locataire">
      <Groupe legende="Le logement">
        <Champ
          id="cmp-loyer"
          libelle="Loyer mensuel charges comprises"
          valeur={loyerCc}
          onChange={setLoyerCc}
          suffixe="€"
          decimal
          placeholder="Ex. 970"
        />
        <Choix
          id="cmp-zone"
          libelle="Situation du logement"
          valeur={zone}
          onChange={setZone}
          options={ZONES_VISALE}
          vide="Choisir la situation"
        />
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
            vide="Choisir la situation"
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
          placeholder={`Ex. ${formaterNombre(TAUX_GLI_EXEMPLE * 100)}`}
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
        !visale ? (
          <Pastille ton="neutre" testId="cmp-etat">
            À compléter
          </Pastille>
        ) : visale.eligible ? (
          <Pastille ton="succes">Visale possible</Pastille>
        ) : (
          <Pastille ton="erreur">Visale exclue</Pastille>
        )
      }
    >
      <section aria-labelledby="cmp-visale" className="space-y-3">
        <h3 id="cmp-visale" className="text-[13.5px] font-medium text-[var(--texte-secondaire)]">
          Visale (Action Logement)
        </h3>
        {visale ? (
          <>
            <p
              data-testid="cmp-visale-verdict"
              className={`outil-verdict ${
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
          </>
        ) : (
          <p data-testid="cmp-visale-manque" className={MESSAGE_A_COMPLETER}>
            Renseignez {enumerer(manquesVisale)}.
          </p>
        )}
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
                ...(visale?.eligible
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
          <p data-testid="cmp-gli-manque" className={MESSAGE_A_COMPLETER}>
            Renseignez {enumerer(manquesGli)}.
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
            <li key={c} className="flex gap-3 rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-3 text-[14px] leading-snug text-[var(--corps)]">
              <svg viewBox="0 0 20 20" aria-hidden className="mt-0.5 size-4 shrink-0 fill-none stroke-[var(--prestige-champagne-texte)] stroke-[2.2]">
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
