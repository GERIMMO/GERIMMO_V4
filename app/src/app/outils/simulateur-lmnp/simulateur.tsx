"use client";

import { useState } from "react";
import { Alerte, CarteSaisie, Case, Champ, Groupe, Segments } from "@/components/outils/champs";
import {
  Barres,
  ChiffreHero,
  DispositionOutil,
  LigneDetail,
  ListeDetail,
  PanneauResultat,
  Pastille,
} from "@/components/outils/resultats";
import { TRANCHES_TMI } from "@/lib/outils/gli-visale";
import { DEFAUTS_LMNP, simulerLmnp } from "@/lib/outils/lmnp";
import { formaterEuros, formaterNombre, formaterPourcent, lireNombre } from "@/lib/outils/nombres";
import { enumerer, nombresManquants } from "@/lib/outils/saisie";

const TMI = TRANCHES_TMI.map((t) => ({ valeur: String(t), libelle: formaterPourcent(t) }));
/** L'exemple d'un champ, en texte indicatif : « Ex. 9 600 ». */
const ex = (n: number) => `Ex. ${formaterNombre(n)}`;

export function SimulateurLmnp() {
  // Décision du dirigeant du 25/11/2026 pour l'outil IRL (Q100), appliquée ici (Q123) : AUCUN champ ne démarre avec une
  // valeur. Les valeurs de DEFAUTS_LMNP (recettes 9 600 €, prix 160 000 €, durées, tranche de 30 %…) étaient posées dans
  // les champs, et l'impôt s'affichait sans rien saisir. Elles ne sont plus qu'un exemple en texte indicatif ; le
  // résultat attend chaque champ (0 pour un montant nul), et un message dit lesquels manquent. Seule la façon de traiter
  // les frais d'acquisition (amortis avec le bien) reste cochée d'office : c'est une option de calcul, pas une donnée.
  const d = DEFAUTS_LMNP;
  const [recettes, setRecettes] = useState("");
  const [charges, setCharges] = useState("");
  const [prix, setPrix] = useState("");
  const [frais, setFrais] = useState("");
  const [fraisAmortis, setFraisAmortis] = useState(d.fraisAmortis);
  const [terrain, setTerrain] = useState("");
  const [dureeBati, setDureeBati] = useState("");
  const [mobilier, setMobilier] = useState("");
  const [dureeMobilier, setDureeMobilier] = useState("");
  const [travaux, setTravaux] = useState("");
  const [dureeTravaux, setDureeTravaux] = useState("");
  const [tmi, setTmi] = useState<string | null>(null);

  const n = (s: string) => lireNombre(s) ?? 0;
  const partTerrain = Math.min(100, Math.max(0, n(terrain))) / 100;
  // Ce que le bâti amortit : le prix, plus les frais s'ils sont amortis avec lui, hors terrain (comme simulerReel).
  const baseBati = (n(prix) + (fraisAmortis ? n(frais) : 0)) * (1 - partTerrain);
  /**
   * La durée d'un amortissement n'est demandée que pour un montant à amortir (bâti, mobilier, travaux). Pour un montant
   * à amortir, une durée nulle ou négative est refusée : elle donnait un amortissement nul, sans le dire.
   */
  const duree = (saisie: string, montant: number, libelle: string, dureeAuDela: string): string[] => {
    if (!(montant > 0)) return [];
    const d = lireNombre(saisie);
    return d == null ? [libelle] : d > 0 ? [] : [dureeAuDela];
  };
  const manques = [
    ...nombresManquants([
      [recettes, "les loyers encaissés"],
      [charges, "les charges déductibles"],
    ]),
    ...(tmi ? [] : ["la tranche marginale d'imposition"]),
    ...nombresManquants([
      [prix, "le prix d'achat"],
      [frais, "les frais d'acquisition"],
      [terrain, "la part du terrain"],
    ]),
    ...duree(dureeBati, baseBati, "la durée du bâti", "une durée du bâti supérieure à 0"),
    ...nombresManquants([[mobilier, "le mobilier"]]),
    ...duree(dureeMobilier, n(mobilier), "la durée du mobilier", "une durée du mobilier supérieure à 0"),
    ...nombresManquants([[travaux, "les travaux"]]),
    ...duree(dureeTravaux, n(travaux), "la durée des travaux", "une durée des travaux supérieure à 0"),
  ];

  const r =
    manques.length === 0 && tmi
      ? simulerLmnp({
          recettes: n(recettes),
          charges: n(charges),
          prix: n(prix),
          frais: n(frais),
          fraisAmortis,
          partTerrain,
          dureeBati: n(dureeBati),
          mobilier: n(mobilier),
          dureeMobilier: n(dureeMobilier),
          travaux: n(travaux),
          dureeTravaux: n(dureeTravaux),
          tmi: Number(tmi),
          prelevementsSociaux: d.prelevementsSociaux,
        })
      : null;

  const saisie = (
    <CarteSaisie id="lmnp-saisie" titre="Votre location meublée">
      <Groupe legende="L'année">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="lmnp-recettes" libelle="Loyers encaissés (recettes)" valeur={recettes} onChange={setRecettes} suffixe="€" decimal placeholder={ex(d.recettes)} />
          <Champ
            id="lmnp-charges"
            libelle="Charges déductibles"
            valeur={charges}
            onChange={setCharges}
            suffixe="€"
            decimal
            placeholder={ex(d.charges)}
            aide="Taxe foncière, assurance, intérêts d'emprunt, copropriété, comptabilité…"
          />
        </div>
        <Segments nom="lmnp-tmi" libelle="Tranche marginale d'imposition" valeur={tmi} onChange={setTmi} options={TMI} colonnes="grid-cols-5" />
      </Groupe>
      <Groupe legende="Le bien">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ id="lmnp-prix" libelle="Prix d'achat" valeur={prix} onChange={setPrix} suffixe="€" decimal placeholder={ex(d.prix)} />
          <Champ id="lmnp-frais" libelle="Frais d'acquisition" valeur={frais} onChange={setFrais} suffixe="€" decimal placeholder={ex(d.frais)} />
          <Champ
            id="lmnp-terrain"
            libelle="Part du terrain"
            valeur={terrain}
            onChange={setTerrain}
            suffixe="%"
            decimal
            placeholder={ex(d.partTerrain * 100)}
            aide="Le terrain ne s'amortit pas."
          />
        </div>
        <Case id="lmnp-frais-amortis" coche={fraisAmortis} onChange={setFraisAmortis} libelle="Amortir les frais d'acquisition avec le bien" />
      </Groupe>
      <Groupe legende="Amortissements" description="Saisissez 0 s'il n'y a ni mobilier ni travaux.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ id="lmnp-duree-bati" libelle="Durée du bâti" valeur={dureeBati} onChange={setDureeBati} suffixe="ans" decimal placeholder={ex(d.dureeBati)} />
          <div className="hidden sm:block" aria-hidden />
          <Champ id="lmnp-mobilier" libelle="Mobilier" valeur={mobilier} onChange={setMobilier} suffixe="€" decimal placeholder={ex(d.mobilier)} />
          <Champ
            id="lmnp-duree-mobilier"
            libelle="Durée du mobilier"
            valeur={dureeMobilier}
            onChange={setDureeMobilier}
            suffixe="ans"
            decimal
            placeholder={ex(d.dureeMobilier)}
          />
          <Champ id="lmnp-travaux" libelle="Travaux" valeur={travaux} onChange={setTravaux} suffixe="€" decimal placeholder={ex(d.travaux)} />
          <Champ
            id="lmnp-duree-travaux"
            libelle="Durée des travaux"
            valeur={dureeTravaux}
            onChange={setDureeTravaux}
            suffixe="ans"
            decimal
            placeholder={ex(d.dureeTravaux)}
          />
        </div>
      </Groupe>
    </CarteSaisie>
  );

  if (!r) {
    return (
      <div className="space-y-6">
        <DispositionOutil
          saisie={saisie}
          resultat={
            <PanneauResultat
              id="lmnp-resultat"
              titre="Impôt de l'année"
              pastille={
                <Pastille ton="neutre" testId="lmnp-etat">
                  À compléter
                </Pastille>
              }
            >
              <p data-testid="lmnp-manque" className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-5 text-[14px] text-[var(--texte-secondaire)]">
                Renseignez {enumerer(manques)}.
              </p>
            </PanneauResultat>
          }
        />
      </div>
    );
  }

  const { micro, reel } = r;
  const reelGagne = r.economieReel != null && r.economieReel > 0;
  const microGagne = r.economieReel != null && r.economieReel < 0;

  const resultat = (
    <PanneauResultat
      id="lmnp-resultat"
      titre="Impôt de l'année"
      pastille={
        !micro.applicable ? (
          <Pastille ton="attention">Micro-BIC non ouvert</Pastille>
        ) : reelGagne ? (
          <Pastille ton="succes">Réel plus avantageux</Pastille>
        ) : microGagne ? (
          <Pastille ton="succes">Micro-BIC plus avantageux</Pastille>
        ) : (
          <Pastille ton="neutre">Égalité</Pastille>
        )
      }
    >
      {r.economieReel != null ? (
        <ChiffreHero
          libelle={r.economieReel >= 0 ? "Économie du régime réel sur l'année" : "Surcoût du régime réel sur l'année"}
          valeur={formaterEuros(Math.abs(r.economieReel))}
          testId="lmnp-economie"
          ton={r.economieReel > 0 ? "succes" : "marque"}
          sous="Impôt sur le revenu et prélèvements sociaux, micro-BIC comparé au réel."
        />
      ) : (
        <ChiffreHero libelle="Impôt et prélèvements sociaux, régime réel" valeur={formaterEuros(reel.impot)} />
      )}
      <Barres
        libelle="Impôt et prélèvements sociaux, par régime"
        barres={[
          ...(micro.applicable
            ? [
                {
                  libelle: "Micro-BIC",
                  valeur: micro.impot,
                  texte: formaterEuros(micro.impot),
                  ton: (microGagne ? "succes" : "pale") as "succes" | "pale",
                  testId: "lmnp-impot-micro",
                },
              ]
            : []),
          {
            libelle: "Régime réel",
            valeur: reel.impot,
            texte: formaterEuros(reel.impot),
            ton: reelGagne ? "succes" : "marque",
            testId: "lmnp-impot-reel",
          },
        ]}
      />
      {!micro.applicable && <Alerte gravite="attention">{micro.motif}</Alerte>}
      <ListeDetail libelle="Bases imposables">
        {micro.applicable && <LigneDetail libelle="Base imposable au micro-BIC" valeur={formaterEuros(micro.base)} />}
        <LigneDetail libelle="Base imposable au réel" valeur={formaterEuros(reel.base)} />
        {reel.amortissementReporte > 0 && (
          <LigneDetail libelle="Amortissement reporté" valeur={formaterEuros(reel.amortissementReporte)} fort />
        )}
      </ListeDetail>
    </PanneauResultat>
  );

  return (
    <div className="space-y-6">
      <DispositionOutil saisie={saisie} resultat={resultat} />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start print:hidden">
        <section className="outil-saisie space-y-4" aria-labelledby="lmnp-micro">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="lmnp-micro" className="outil-carte-titre">
              Micro-BIC, le détail
            </h2>
            <Pastille ton="neutre">Abattement forfaitaire</Pastille>
          </div>
          {micro.applicable ? (
            <ListeDetail libelle="Détail du micro-BIC">
              <LigneDetail libelle="Recettes" valeur={formaterEuros(n(recettes))} />
              <LigneDetail libelle="Abattement forfaitaire (50 %, 305 € au minimum)" valeur={`− ${formaterEuros(micro.abattement)}`} />
              <LigneDetail libelle="Base imposable" valeur={formaterEuros(micro.base)} />
              <LigneDetail libelle="Impôt et prélèvements sociaux" valeur={formaterEuros(micro.impot)} fort />
            </ListeDetail>
          ) : (
            <Alerte gravite="attention">{micro.motif}</Alerte>
          )}
        </section>

        <section className="outil-saisie space-y-4" aria-labelledby="lmnp-reel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="lmnp-reel" className="outil-carte-titre">
              Régime réel, le détail
            </h2>
            <Pastille ton="neutre">Charges et amortissements</Pastille>
          </div>
          <ListeDetail libelle="Détail du régime réel">
            <LigneDetail libelle="Résultat avant amortissement" valeur={formaterEuros(reel.resultatAvantAmortissement)} />
            <LigneDetail libelle="Amortissement du bâti" valeur={formaterEuros(reel.amortissementBati)} />
            <LigneDetail libelle="Amortissement du mobilier" valeur={formaterEuros(reel.amortissementMobilier)} />
            <LigneDetail libelle="Amortissement des travaux" valeur={formaterEuros(reel.amortissementTravaux)} />
            <LigneDetail libelle="Amortissement déduit cette année" valeur={`− ${formaterEuros(reel.amortissementUtilise)}`} />
            <LigneDetail libelle="Base imposable" valeur={formaterEuros(reel.base)} />
            <LigneDetail libelle="Impôt et prélèvements sociaux" valeur={formaterEuros(reel.impot)} fort />
          </ListeDetail>
          {reel.amortissementReporte > 0 && (
            <p data-testid="lmnp-reporte" className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-3.5 py-3 text-[13.5px] leading-relaxed text-[var(--texte-secondaire)]">
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
    </div>
  );
}
