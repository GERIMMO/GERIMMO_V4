"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Alerte, CarteSaisie, Champ, Choix, Groupe, Segments } from "@/components/outils/champs";
import { ChampAdresse } from "@/components/outils/champ-adresse";
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
  EXEMPLE_IRL,
  URL_SERIE_INSEE_IRL,
  calculerRevisionIrl,
  libelleTrimestre,
  type NumeroTrimestre,
  type Trimestre,
} from "@/lib/outils/irl";
import {
  choisirIndices,
  numeroTrimestre,
  referencePublieeA,
  type CodeTrimestre,
  type ObservationIrl,
} from "@/lib/outils/irl-insee";
import {
  CLASSES_DPE,
  MESSAGE_GEL_DPE,
  MESSAGE_ZONE_SPECIFIQUE,
  codePostalDeAdresse,
  revisionInterditeDpe,
  zoneIrlDuCodePostal,
  type ClasseDpe,
} from "@/lib/outils/irl-logement";
import {
  aujourdhuiIso,
  formaterDateIso,
  formaterEuros,
  formaterNombre,
  formaterPourcent,
  lireNombre,
} from "@/lib/outils/nombres";

// 30/09 : parcours « moindre effort ». Quand la série officielle de l'Insee a
// pu être lue (côté serveur, lib/outils/irl-insee.ts), le bailleur ne saisit
// que l'adresse, le DPE, le loyer et la date du bail (ou de la dernière
// révision) : l'outil retient l'indice de référence (trimestre du bail, année
// de cette date) et le nouvel indice (même trimestre, dernière année
// publiée). Tout reste modifiable (« Saisir les indices moi-même »). Série
// indisponible, ou logement en Corse ou outre-mer (indices spécifiques) :
// saisie manuelle des indices.

const TRIMESTRES: { valeur: CodeTrimestre; libelle: string }[] = (["T1", "T2", "T3", "T4"] as const).map((t) => ({
  valeur: t,
  libelle: t,
}));
const ANNEES: { valeur: string; libelle: string }[] = Array.from({ length: 26 }, (_, i) => {
  const a = String(2010 + i);
  return { valeur: a, libelle: a };
});

const enTexte = (n: number | null) => (n == null ? "" : formaterNombre(n));
const codeDe = (n: number) => `T${n}` as CodeTrimestre;
const versTrimestre = (o: { trimestre: CodeTrimestre; annee: number }): Trimestre => ({
  trimestre: numeroTrimestre(o.trimestre) as NumeroTrimestre,
  annee: o.annee,
});

/** Un blanc à compléter, visible à l'écran comme sur papier. */
function ACompleter({ quoi }: { quoi: string }) {
  return <span className="a-completer">[{quoi}]</span>;
}

/** La date d'exemple : le trimestre du dernier indice publié, un an plus tôt. */
function dateExemple(serie: ObservationIrl[] | null): string {
  const dernier = serie?.[serie.length - 1];
  if (!dernier) return "";
  // Signé juste après la publication du même trimestre, un an plus tôt : la
  // référence est ce trimestre-là, le nouvel indice le dernier publié.
  const q = numeroTrimestre(dernier.trimestre);
  const moisPub = q * 3 + 1;
  return moisPub === 13 ? `${dernier.annee}-01-20` : `${dernier.annee - 1}-${String(moisPub).padStart(2, "0")}-20`;
}

export function CalculateurIrl({ serie }: { serie: ObservationIrl[] | null }) {
  const [loyer, setLoyer] = useState(enTexte(EXEMPLE_IRL.loyer));
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [dpe, setDpe] = useState<ClasseDpe>("inconnue");

  // Parcours automatique
  const [dateBail, setDateBail] = useState(() => dateExemple(serie));
  const [trimBail, setTrimBail] = useState<CodeTrimestre>(() => referencePublieeA(dateExemple(serie))?.trimestre ?? "T2");
  const [saisieManuelle, setSaisieManuelle] = useState(false);

  // Saisie manuelle
  const [indiceRef, setIndiceRef] = useState(enTexte(EXEMPLE_IRL.indiceReference));
  const [trimRef, setTrimRef] = useState<CodeTrimestre>(codeDe(EXEMPLE_IRL.trimestreReference.trimestre));
  const [anneeRef, setAnneeRef] = useState(String(EXEMPLE_IRL.trimestreReference.annee));
  const [indiceNouv, setIndiceNouv] = useState(enTexte(EXEMPLE_IRL.indiceNouveau));
  const [trimNouv, setTrimNouv] = useState<CodeTrimestre>(codeDe(EXEMPLE_IRL.trimestreNouveau.trimestre));
  const [anneeNouv, setAnneeNouv] = useState(String(EXEMPLE_IRL.trimestreNouveau.annee));

  // La lettre
  const [bailleurNom, setBailleurNom] = useState("");
  const [bailleurAdresse, setBailleurAdresse] = useState("");
  const [locataireNom, setLocataireNom] = useState("");
  const [dateLettre, setDateLettre] = useState("");
  const [dateEffet, setDateEffet] = useState("");

  // La date du jour est celle du navigateur : posée après le montage, pour
  // que le rendu du serveur et celui du navigateur restent identiques.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDateLettre(aujourdhuiIso());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const zone = zoneIrlDuCodePostal(codePostal || codePostalDeAdresse(adresse));
  const zoneSpecifique = zone === "corse" || zone === "outre-mer" ? zone : null;
  const auto = serie != null && !saisieManuelle && zoneSpecifique == null;
  const gel = revisionInterditeDpe(dpe);

  // Les indices retenus, selon le parcours.
  // Référence : la dernière occurrence du trimestre retenu déjà publiée à la
  // signature (art. 17-1), pas le trimestre de la date elle-même.
  const choixAuto = referencePublieeA(dateBail, trimBail);
  const selection = auto && choixAuto ? choisirIndices(serie, choixAuto) : null;
  const dernier = serie?.[serie.length - 1] ?? null;

  const tRef: Trimestre = auto
    ? { trimestre: numeroTrimestre(trimBail) as NumeroTrimestre, annee: choixAuto?.annee ?? 0 }
    : { trimestre: numeroTrimestre(trimRef) as NumeroTrimestre, annee: Number(anneeRef) };
  const tNouv: Trimestre =
    auto && selection?.nouveau
      ? versTrimestre(selection.nouveau)
      : auto
        ? { trimestre: tRef.trimestre, annee: tRef.annee + 1 }
        : { trimestre: numeroTrimestre(trimNouv) as NumeroTrimestre, annee: Number(anneeNouv) };
  const valeurRef = auto ? (selection?.reference?.valeur ?? null) : lireNombre(indiceRef);
  const valeurNouv = auto ? (selection?.nouveau?.valeur ?? null) : lireNombre(indiceNouv);
  const texteRef = valeurRef != null ? formaterNombre(valeurRef) : "";
  const texteNouv = valeurNouv != null ? formaterNombre(valeurNouv) : "";

  const loyerActuel = lireNombre(loyer);
  const r = calculerRevisionIrl({
    loyer: loyerActuel,
    indiceReference: valeurRef,
    trimestreReference: tRef,
    indiceNouveau: valeurNouv,
    trimestreNouveau: tNouv,
  });

  function changerDate(v: string) {
    setDateBail(v);
    const t = referencePublieeA(v);
    if (t) setTrimBail(t.trimestre);
  }

  /**
   * Corse ou outre-mer : l'indice est spécifique. Les indices pré-remplis
   * (exemple ou série métropolitaine) sont effacés en entrant dans la zone,
   * pour qu'aucun indice de la métropole n'y soit appliqué.
   */
  function viderSiZoneSpecifique(cp: string | null) {
    const z = zoneIrlDuCodePostal(cp);
    if ((z === "corse" || z === "outre-mer") && zoneSpecifique == null) {
      setIndiceRef("");
      setIndiceNouv("");
    }
  }

  /** Passe en saisie manuelle, en reprenant les indices retenus. */
  function saisirMoiMeme() {
    if (auto) {
      setTrimRef(codeDe(tRef.trimestre));
      setAnneeRef(String(tRef.annee));
      setIndiceRef(texteRef);
      setTrimNouv(codeDe(tNouv.trimestre));
      setAnneeNouv(String(tNouv.annee));
      setIndiceNouv(texteNouv);
    }
    setSaisieManuelle(true);
  }

  // Ce qui manque pour conclure, en clair.
  let manque: ReactNode = null;
  if (!r.ok) {
    if (auto && !choixAuto) manque = "Renseignez la date de signature du bail ou de la dernière révision.";
    else if (auto && selection && !selection.reference)
      manque = `Aucun indice publié par l'Insee pour le ${libelleTrimestre(tRef)} : vérifiez la date saisie.`;
    else if (auto && selection && !selection.nouveau)
      manque = `Le nouvel indice (${libelleTrimestre(tNouv)}) n'est pas encore publié par l'Insee.`;
    else manque = `Renseignez ${r.manque.join(", ")}.`;
  }

  const erreurs = r.alertes.some((a) => a.gravite === "erreur");
  const pastille = gel ? (
    <Pastille ton="erreur" testId="irl-etat">
      Révision interdite
    </Pastille>
  ) : !r.ok ? (
    <Pastille ton="neutre" testId="irl-etat">
      À compléter
    </Pastille>
  ) : erreurs ? (
    <Pastille ton="erreur" testId="irl-etat">
      À corriger
    </Pastille>
  ) : r.alertes.length > 0 ? (
    <Pastille ton="attention" testId="irl-etat">
      À vérifier
    </Pastille>
  ) : (
    <Pastille ton="succes" testId="irl-etat">
      Indices cohérents
    </Pastille>
  );

  const saisie = (
    <CarteSaisie id="irl-saisie" titre="Vos informations">
      <Groupe legende="Le logement">
        <ChampAdresse
          id="irl-logement"
          libelle="Adresse du logement loué"
          valeur={adresse}
          onChange={(v) => {
            setAdresse(v);
            setCodePostal("");
            viderSiZoneSpecifique(codePostalDeAdresse(v));
          }}
          onChoix={(s) => {
            setCodePostal(s.postcode);
            viderSiZoneSpecifique(s.postcode);
          }}
          aide="Suggestions de la Base Adresse Nationale. Le code postal désigne l'indice applicable (France métropolitaine, Corse ou outre-mer) ; l'adresse remplit la lettre."
        />
        <Segments
          nom="irl-dpe"
          libelle="Classe énergétique (DPE) du logement"
          valeur={dpe}
          onChange={setDpe}
          options={CLASSES_DPE}
          colonnes="grid-cols-4 sm:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,2.4fr)]"
          aide="Un logement classé F ou G ne peut plus voir son loyer révisé."
        />
      </Groupe>

      <Groupe legende="Le loyer">
        <Champ id="irl-loyer" libelle="Loyer actuel hors charges" valeur={loyer} onChange={setLoyer} suffixe="€" decimal />
      </Groupe>

      {auto ? (
        <Groupe
          legende="Les indices"
          description={
            <>
              L&apos;outil lit la série officielle de l&apos;Insee. Dernier indice disponible :{" "}
              <b className="text-[var(--encre)]">{dernier ? libelleTrimestre(versTrimestre(dernier)) : "—"}</b>.
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ
              id="irl-date-bail"
              type="date"
              libelle="Date de signature du bail ou de la dernière révision"
              valeur={dateBail}
              onChange={changerDate}
              aide="Exemple pré-rempli : remplacez-la par la vôtre."
            />
            <Segments
              nom="irl-trim-bail"
              libelle="Trimestre de référence du bail"
              valeur={trimBail}
              onChange={setTrimBail}
              options={TRIMESTRES}
              aide="Celui de la clause de révision. Par défaut, le trimestre de la date."
            />
          </div>
          <button type="button" onClick={saisirMoiMeme} className="btn-secondaire min-h-11">
            Saisir les indices moi-même
          </button>
        </Groupe>
      ) : (
        <>
          {zoneSpecifique ? (
            <Alerte gravite="attention" titre="Indice spécifique, à saisir">
              {MESSAGE_ZONE_SPECIFIQUE[zoneSpecifique]}
            </Alerte>
          ) : serie == null ? (
            <p data-testid="irl-serie-indisponible" className="rounded-xl bg-[var(--creme)] px-3.5 py-2.5 text-[13px] text-[var(--texte-secondaire)]">
              Les indices de l&apos;Insee n&apos;ont pas pu être chargés : saisissez-les ci-dessous, depuis{" "}
              <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
                la série de l&apos;IRL publiée par l&apos;Insee
              </a>
              .
            </p>
          ) : null}
          <Groupe legende="Indice de référence" description="Celui du bail, ou de la dernière révision appliquée.">
            <Segments nom="irl-trim-ref" libelle="Trimestre" valeur={trimRef} onChange={setTrimRef} options={TRIMESTRES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Choix id="irl-annee-ref" libelle="Année" valeur={anneeRef} onChange={setAnneeRef} options={ANNEES} />
              <Champ id="irl-indice-ref" libelle="Valeur de l'indice" valeur={indiceRef} onChange={setIndiceRef} decimal />
            </div>
          </Groupe>
          <Groupe legende="Nouvel indice" description="Même trimestre, un an plus tard.">
            <Segments nom="irl-trim-nouv" libelle="Trimestre" valeur={trimNouv} onChange={setTrimNouv} options={TRIMESTRES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Choix id="irl-annee-nouv" libelle="Année" valeur={anneeNouv} onChange={setAnneeNouv} options={ANNEES} />
              <Champ id="irl-indice-nouv" libelle="Valeur de l'indice" valeur={indiceNouv} onChange={setIndiceNouv} decimal />
            </div>
            {serie != null && !zoneSpecifique && (
              <button type="button" onClick={() => setSaisieManuelle(false)} className="btn-secondaire min-h-11">
                Reprendre les indices de l&apos;Insee
              </button>
            )}
          </Groupe>
          <p className="text-[12.5px] text-[var(--texte-secondaire)]">
            Relevez les indices officiels sur{" "}
            <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
              la série de l&apos;IRL publiée par l&apos;Insee
            </a>
            .
          </p>
        </>
      )}
    </CarteSaisie>
  );

  const resultat = (
    <PanneauResultat id="irl-resultat" pastille={pastille}>
      {gel ? (
        <>
          <ChiffreHero
            libelle="Loyer hors charges"
            valeur={loyerActuel != null ? formaterEuros(loyerActuel) : "—"}
            ton="encre"
            sous="Inchangé : aucune révision possible."
          />
          <div data-testid="irl-gel-dpe">
            <Alerte gravite="erreur">{MESSAGE_GEL_DPE}</Alerte>
          </div>
        </>
      ) : r.ok ? (
        <>
          <ChiffreHero
            libelle="Nouveau loyer hors charges"
            valeur={formaterEuros(r.nouveauLoyer)}
            testId="irl-nouveau-loyer"
            sous={
              <>
                <b className="montant text-[var(--encre)]">
                  {r.ecart >= 0 ? "+" : ""}
                  {formaterEuros(r.ecart)}
                </b>{" "}
                par mois, soit{" "}
                <b className="montant text-[var(--encre)]">
                  {r.ecart >= 0 ? "+" : ""}
                  {formaterEuros(r.ecart * 12)}
                </b>{" "}
                par an.
              </>
            }
          />
          <Barres
            libelle="Loyer actuel et nouveau loyer"
            barres={[
              { libelle: "Loyer actuel", valeur: loyerActuel ?? 0, texte: formaterEuros(loyerActuel ?? 0), ton: "pale" },
              { libelle: "Nouveau loyer", valeur: r.nouveauLoyer, texte: formaterEuros(r.nouveauLoyer), ton: "marque" },
            ]}
          />
          <ListeDetail libelle="Détail du calcul">
            <LigneDetail libelle={`Indice de référence (${libelleTrimestre(tRef)})`} valeur={texteRef} />
            <LigneDetail libelle={`Nouvel indice (${libelleTrimestre(tNouv)})`} valeur={texteNouv} />
            <LigneDetail
              libelle="Variation de l'indice"
              valeur={`${r.variation >= 0 ? "+" : ""}${formaterPourcent(r.variation)}`}
            />
            <LigneDetail
              libelle="Écart mensuel"
              valeur={`${r.ecart >= 0 ? "+" : ""}${formaterEuros(r.ecart)}`}
              fort
            />
          </ListeDetail>
          <p className="montant rounded-xl bg-[var(--creme)] px-3.5 py-2.5 text-[13px] text-[var(--texte-secondaire)]">
            {formaterEuros(loyerActuel ?? 0)} × {texteNouv} ÷ {texteRef} = {formaterEuros(r.nouveauLoyer)}, arrondi au centime.
          </p>
          {auto && (
            <p data-testid="irl-source" className="text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
              Source : Insee, publié au Journal officiel (série{" "}
              <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
                001515333
              </a>
              ). Trimestre utilisé : {codeDe(tRef.trimestre)}. Dernier indice disponible :{" "}
              {dernier ? libelleTrimestre(versTrimestre(dernier)) : "—"}.
            </p>
          )}
        </>
      ) : (
        <p className="rounded-xl bg-[var(--creme)] px-4 py-5 text-[14px] text-[var(--texte-secondaire)]">{manque}</p>
      )}
      {!gel && r.alertes.length > 0 && (
        <div className="space-y-2" data-testid="irl-alertes">
          {r.alertes.map((a) => (
            <Alerte key={a.code} gravite={a.gravite}>
              {a.message}
            </Alerte>
          ))}
        </div>
      )}
      {!gel && dpe === "inconnue" && (
        <p className="text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
          Vérifiez la classe du diagnostic de performance énergétique : classé F ou G, le logement ne peut pas voir son
          loyer révisé.
        </p>
      )}
    </PanneauResultat>
  );

  return (
    <div className="space-y-10">
      <DispositionOutil saisie={saisie} resultat={resultat} />

      {!gel && (
        <>
          <CarteSaisie id="irl-lettre-saisie" titre="La lettre au locataire" className="print:hidden">
            <p className="mt-1.5 text-[14px] text-[var(--texte-secondaire)]">
              Complétez ces champs : la lettre ci-dessous se met à jour, puis imprimez-la ou enregistrez-la en PDF.
              L&apos;adresse du logement est celle saisie plus haut. Rien n&apos;est envoyé ni conservé.
            </p>
            <Groupe legende="Les parties et les dates">
              <div className="grid gap-4 sm:grid-cols-2">
                <Champ id="irl-bailleur-nom" libelle="Nom du bailleur" valeur={bailleurNom} onChange={setBailleurNom} autoComplete="name" />
                <Champ id="irl-bailleur-adresse" libelle="Adresse du bailleur" valeur={bailleurAdresse} onChange={setBailleurAdresse} />
                <Champ id="irl-locataire-nom" libelle="Nom du locataire" valeur={locataireNom} onChange={setLocataireNom} />
                <Champ id="irl-date-lettre" type="date" libelle="Date de la lettre" valeur={dateLettre} onChange={setDateLettre} />
                <Champ
                  id="irl-date-effet"
                  type="date"
                  libelle="Date d'effet de la révision"
                  valeur={dateEffet}
                  onChange={setDateEffet}
                  aide="La date anniversaire du bail, ou la date de la demande si elle est faite après."
                />
              </div>
            </Groupe>
            <div className="mt-6">
              <button type="button" onClick={() => window.print()} className="btn-or min-h-11 !px-5" disabled={!r.ok}>
                <IconeImprimer />
                Imprimer la lettre
              </button>
            </div>
          </CarteSaisie>

          <FeuillePapier
            id="lettre"
            libelle="Lettre de révision du loyer"
            legende={
              <>
                <p className="eyebrow">Aperçu de la lettre</p>
                <p className="text-[12.5px] text-[var(--texte-secondaire)]">Format A4, prête à imprimer</p>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <p className="font-bold">{bailleurNom || <ACompleter quoi="Nom du bailleur" />}</p>
                <p>{bailleurAdresse || <ACompleter quoi="Adresse du bailleur" />}</p>
              </div>
              <div className="sm:ml-auto sm:w-1/2">
                <p className="font-bold">{locataireNom || <ACompleter quoi="Nom du locataire" />}</p>
                <p>{adresse || <ACompleter quoi="Adresse du logement" />}</p>
                <p className="mt-4">Le {formaterDateIso(dateLettre) || <ACompleter quoi="date" />}</p>
              </div>
              <p className="papier-titre pt-2 !text-[18px]">Objet : révision annuelle du loyer</p>
              <p>Madame, Monsieur,</p>
              <p>
                Conformément à la clause de révision de votre bail et à l&apos;article 17-1 de la loi n° 89-462 du 6 juillet
                1989, le loyer hors charges du logement situé {adresse || <ACompleter quoi="adresse du logement" />} est
                révisé selon la variation de l&apos;indice de référence des loyers (IRL) publié par l&apos;Insee.
              </p>
              <table className="papier-montants">
                <tbody>
                  <tr>
                    <td>Loyer hors charges actuel</td>
                    <td>{loyerActuel != null ? formaterEuros(loyerActuel) : <ACompleter quoi="loyer" />}</td>
                  </tr>
                  <tr>
                    <td>Indice de référence ({libelleTrimestre(tRef)})</td>
                    <td>{texteRef || <ACompleter quoi="indice" />}</td>
                  </tr>
                  <tr>
                    <td>Nouvel indice ({libelleTrimestre(tNouv)})</td>
                    <td>{texteNouv || <ACompleter quoi="indice" />}</td>
                  </tr>
                  {r.ok && (
                    <tr className="total">
                      <td>
                        Nouveau loyer : {formaterEuros(loyerActuel ?? 0)} × {texteNouv} ÷ {texteRef} (arrondi au centime)
                      </td>
                      <td>{formaterEuros(r.nouveauLoyer)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p>
                À compter du {formaterDateIso(dateEffet) || <ACompleter quoi="date d'effet" />}, votre loyer mensuel hors
                charges s&apos;élève donc à{" "}
                <b className="montant">{r.ok ? formaterEuros(r.nouveauLoyer) : <ACompleter quoi="nouveau loyer" />}</b>. Le
                montant des charges n&apos;est pas modifié par la présente révision.
              </p>
              <p>Je vous prie d&apos;agréer, Madame, Monsieur, l&apos;expression de mes salutations distinguées.</p>
              <p className="pt-8 font-bold">{bailleurNom || <ACompleter quoi="Nom et signature du bailleur" />}</p>
            </div>
          </FeuillePapier>
        </>
      )}
    </div>
  );
}
