"use client";

import { useState, type ReactNode } from "react";
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
  formaterDateIso,
  formaterEuros,
  formaterNombre,
  formaterPourcent,
  lireNombre,
} from "@/lib/outils/nombres";
import { enumerer } from "@/lib/outils/saisie";

// 30/09 : parcours « moindre effort ». Quand la série officielle de l'Insee a
// pu être lue (côté serveur, lib/outils/irl-insee.ts), le bailleur ne saisit
// que l'adresse, le DPE, le loyer et la date du bail (ou de la dernière
// révision) : l'outil retient l'indice de référence (trimestre du bail, année
// de cette date) et le nouvel indice (même trimestre, dernière année
// publiée). Tout reste modifiable (« Saisir les indices moi-même »). Série
// indisponible, ou logement en Corse ou outre-mer (indices spécifiques) :
// saisie manuelle des indices.
//
// Décision du dirigeant du 25/11/2026 : AUCUN champ n'est prérempli avec une valeur (ni le loyer, ni la date du bail,
// ni les trimestres et années, ni la classe énergétique, ni la date de la lettre). Un exemple ne s'affiche qu'en
// texte indicatif (placeholder ou aide) dans un champ vide. Le calcul part de ce que l'utilisateur a saisi, et des
// indices que l'Insee publie pour SA date ; le trimestre de référence se coche d'après cette date (dernier indice
// publié à la signature, à défaut de clause) et reste modifiable. Le résultat et la lettre restent impossibles tant
// qu'un champ requis est vide, et un message dit lequel.

const TRIMESTRES: { valeur: CodeTrimestre; libelle: string }[] = (["T1", "T2", "T3", "T4"] as const).map((t) => ({
  valeur: t,
  libelle: t,
}));
const ANNEES: { valeur: string; libelle: string }[] = Array.from({ length: 26 }, (_, i) => {
  const a = String(2010 + i);
  return { valeur: a, libelle: a };
});

const codeDe = (n: number) => `T${n}` as CodeTrimestre;
const versTrimestre = (o: { trimestre: CodeTrimestre; annee: number }): Trimestre => ({
  trimestre: numeroTrimestre(o.trimestre) as NumeroTrimestre,
  annee: o.annee,
});

/** Un blanc à compléter, visible à l'écran comme sur papier. */
function ACompleter({ quoi }: { quoi: string }) {
  return <span className="a-completer">[{quoi}]</span>;
}

/** Le trimestre d'un indice, ou un blanc à compléter tant qu'il n'est pas choisi. */
function trimestreEcrit(t: Trimestre | null): ReactNode {
  return t ? libelleTrimestre(t) : <ACompleter quoi="trimestre" />;
}

export function CalculateurIrl({ serie }: { serie: ObservationIrl[] | null }) {
  // Tous les champs démarrent VIDES (décision du 25/11/2026) : le loyer de 850 €, la date « un an avant le dernier
  // indice », les trimestres T2 2025 → T2 2026, la classe « Je ne sais pas » et la date du jour de la lettre étaient
  // préremplis, et le calcul en partait sans que l'utilisateur les ait saisis.
  const [loyer, setLoyer] = useState("");
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [dpe, setDpe] = useState<ClasseDpe | null>(null);

  // Parcours automatique
  const [dateBail, setDateBail] = useState("");
  const [trimBail, setTrimBail] = useState<CodeTrimestre | null>(null);
  const [saisieManuelle, setSaisieManuelle] = useState(false);

  // Saisie manuelle. Les deux indices démarrent VIDES (défauts d'écran E054 = E167) : préremplis avec un exemple
  // écrit dans le code, ils donnaient, quand la série de l'Insee n'était pas lue, un « Indices cohérents », un nouveau
  // loyer et une lettre fondés sur des indices que l'utilisateur n'avait pas relevés. Ils ne se remplissent que par
  // sa saisie, ou par « Saisir les indices moi-même », qui reprend ceux lus chez l'Insee pour la date saisie.
  // Trimestres et années aussi (décision du 25/11/2026) : aucun segment coché, aucune année choisie.
  const [indiceRef, setIndiceRef] = useState("");
  const [trimRef, setTrimRef] = useState<CodeTrimestre | null>(null);
  const [anneeRef, setAnneeRef] = useState("");
  const [indiceNouv, setIndiceNouv] = useState("");
  const [trimNouv, setTrimNouv] = useState<CodeTrimestre | null>(null);
  const [anneeNouv, setAnneeNouv] = useState("");

  // La lettre. Sa date n'est plus posée au montage (date du jour) : l'utilisateur la saisit, comme les autres.
  const [bailleurNom, setBailleurNom] = useState("");
  const [bailleurAdresse, setBailleurAdresse] = useState("");
  const [locataireNom, setLocataireNom] = useState("");
  const [dateLettre, setDateLettre] = useState("");
  const [dateEffet, setDateEffet] = useState("");

  const zone = zoneIrlDuCodePostal(codePostal || codePostalDeAdresse(adresse));
  const zoneSpecifique = zone === "corse" || zone === "outre-mer" ? zone : null;
  const auto = serie != null && !saisieManuelle && zoneSpecifique == null;
  const gel = dpe != null && revisionInterditeDpe(dpe);

  // Les indices retenus, selon le parcours.
  // Référence : la dernière occurrence du trimestre retenu déjà publiée à la
  // signature (art. 17-1), pas le trimestre de la date elle-même. Sans date
  // saisie, rien n'est retenu.
  const choixAuto = referencePublieeA(dateBail, trimBail ?? undefined);
  const selection = auto && choixAuto ? choisirIndices(serie, choixAuto) : null;
  const dernier = serie?.[serie.length - 1] ?? null;

  // Un trimestre n'existe que choisi (trimestre ET année), ou déduit de la date saisie.
  const tRef: Trimestre | null = auto
    ? choixAuto
      ? versTrimestre(choixAuto)
      : null
    : trimRef && anneeRef
      ? { trimestre: numeroTrimestre(trimRef) as NumeroTrimestre, annee: Number(anneeRef) }
      : null;
  const tNouv: Trimestre | null =
    auto && selection?.nouveau
      ? versTrimestre(selection.nouveau)
      : auto
        ? tRef
          ? { trimestre: tRef.trimestre, annee: tRef.annee + 1 }
          : null
        : trimNouv && anneeNouv
          ? { trimestre: numeroTrimestre(trimNouv) as NumeroTrimestre, annee: Number(anneeNouv) }
          : null;
  const libRef = tRef ? libelleTrimestre(tRef) : "";
  const libNouv = tNouv ? libelleTrimestre(tNouv) : "";
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
    // Q72 : le garde-fou de saisie de l'application vaut pour les indices tapés, pas pour ceux lus chez l'Insee.
    indicesSaisis: !auto,
  });

  function changerDate(v: string) {
    setDateBail(v);
    const t = referencePublieeA(v);
    if (t) setTrimBail(t.trimestre);
  }

  /**
   * Corse ou outre-mer : l'indice est spécifique. Les indices déjà repris de
   * la série métropolitaine sont effacés en entrant dans la zone, pour
   * qu'aucun indice de la métropole n'y soit appliqué.
   */
  function viderSiZoneSpecifique(cp: string | null) {
    const z = zoneIrlDuCodePostal(cp);
    if ((z === "corse" || z === "outre-mer") && zoneSpecifique == null) {
      setIndiceRef("");
      setIndiceNouv("");
    }
  }

  /**
   * Passe en saisie manuelle, en reprenant les indices retenus pour la date saisie. Sans date saisie, rien n'est
   * repris : trimestres, années et indices restent vides (aucun trimestre d'exemple).
   */
  function saisirMoiMeme() {
    if (auto) {
      setTrimRef(tRef ? codeDe(tRef.trimestre) : null);
      setAnneeRef(tRef ? String(tRef.annee) : "");
      setIndiceRef(texteRef);
      setTrimNouv(tNouv ? codeDe(tNouv.trimestre) : null);
      setAnneeNouv(tNouv ? String(tNouv.annee) : "");
      setIndiceNouv(texteNouv);
    }
    setSaisieManuelle(true);
  }

  // Ce qui manque pour conclure, en clair : tout ce qui reste à saisir, d'un coup.
  let manque: ReactNode = null;
  if (!r.ok) {
    // Rien ne manque : c'est le garde-fou de saisie qui refuse (le détail est dans les alertes).
    if (r.manque.length === 0) manque = "Aucun nouveau loyer n'est calculé avec ces indices.";
    else if (auto && selection && !selection.reference)
      manque = `Aucun indice publié par l'Insee pour le ${libRef} : vérifiez la date saisie.`;
    else if (auto && selection && !selection.nouveau)
      manque = `Le nouvel indice (${libNouv}) n'est pas encore publié par l'Insee.`;
    else {
      const aSaisir = auto
        ? [
            ...r.manque.filter((m) => m === "le loyer hors charges actuel"),
            ...(choixAuto ? [] : ["la date de signature du bail ou de la dernière révision"]),
          ]
        : r.manque;
      manque = `Renseignez ${enumerer(aSaisir.length > 0 ? aSaisir : r.manque)}.`;
    }
  }

  // La lettre ne s'imprime que complète : le calcul fait, et chacun de ses champs saisi (décision du 25/11/2026).
  const manquesLettre = [
    ...(bailleurNom.trim() ? [] : ["le nom du bailleur"]),
    ...(bailleurAdresse.trim() ? [] : ["l'adresse du bailleur"]),
    ...(locataireNom.trim() ? [] : ["le nom du locataire"]),
    ...(adresse.trim() ? [] : ["l'adresse du logement"]),
    ...(formaterDateIso(dateLettre) ? [] : ["la date de la lettre"]),
    ...(formaterDateIso(dateEffet) ? [] : ["la date d'effet de la révision"]),
  ];
  const lettrePrete = r.ok && manquesLettre.length === 0;
  const raisonLettre = lettrePrete
    ? null
    : !r.ok
      ? `Pour imprimer la lettre, complétez d'abord le calcul du nouveau loyer${manquesLettre.length > 0 ? `, puis renseignez ${enumerer(manquesLettre)}` : ""}.`
      : `Pour imprimer la lettre, renseignez ${enumerer(manquesLettre)}.`;

  const erreurs = r.alertes.some((a) => a.gravite === "erreur");
  const pastille = gel ? (
    <Pastille ton="erreur" testId="irl-etat">
      Révision interdite
    </Pastille>
  ) : !r.ok && r.manque.length > 0 ? (
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
        <Champ
          id="irl-loyer"
          libelle="Loyer actuel hors charges"
          valeur={loyer}
          onChange={setLoyer}
          suffixe="€"
          decimal
          placeholder="Ex. 850"
        />
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
          <button type="button" onClick={saisirMoiMeme} className="btn-secondaire">
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
            <p data-testid="irl-serie-indisponible" className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-3.5 py-2.5 text-[13px] text-[var(--texte-secondaire)]">
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
              <Choix id="irl-annee-ref" libelle="Année" valeur={anneeRef} onChange={setAnneeRef} options={ANNEES} vide="Choisir l'année" />
              <Champ id="irl-indice-ref" libelle="Valeur de l'indice" valeur={indiceRef} onChange={setIndiceRef} decimal />
            </div>
          </Groupe>
          <Groupe legende="Nouvel indice" description="Même trimestre, un an plus tard.">
            <Segments nom="irl-trim-nouv" libelle="Trimestre" valeur={trimNouv} onChange={setTrimNouv} options={TRIMESTRES} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Choix id="irl-annee-nouv" libelle="Année" valeur={anneeNouv} onChange={setAnneeNouv} options={ANNEES} vide="Choisir l'année" />
              <Champ id="irl-indice-nouv" libelle="Valeur de l'indice" valeur={indiceNouv} onChange={setIndiceNouv} decimal />
            </div>
            {serie != null && !zoneSpecifique && (
              <button type="button" onClick={() => setSaisieManuelle(false)} className="btn-secondaire">
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
            <LigneDetail libelle={`Indice de référence (${libRef})`} valeur={texteRef} />
            <LigneDetail libelle={`Nouvel indice (${libNouv})`} valeur={texteNouv} />
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
          <p className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-3.5 py-2.5 text-[13px] tabular-nums lining-nums text-[var(--texte-secondaire)]">
            {formaterEuros(loyerActuel ?? 0)} × {texteNouv} ÷ {texteRef} = {formaterEuros(r.nouveauLoyer)}, arrondi au centime.
          </p>
          {auto && (
            <p data-testid="irl-source" className="text-[12.5px] leading-snug text-[var(--texte-secondaire)]">
              Source : Insee, publié au Journal officiel (série{" "}
              <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
                001515333
              </a>
              ). Trimestre utilisé : {tRef ? codeDe(tRef.trimestre) : "—"}. Dernier indice disponible :{" "}
              {dernier ? libelleTrimestre(versTrimestre(dernier)) : "—"}.
            </p>
          )}
        </>
      ) : (
        <p className="rounded-[var(--rayon-bouton)] bg-[var(--filet-leger)] px-4 py-5 text-[14px] text-[var(--texte-secondaire)]">{manque}</p>
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
      {!gel && (dpe == null || dpe === "inconnue") && (
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
                <Champ
                  id="irl-date-lettre"
                  type="date"
                  libelle="Date de la lettre"
                  valeur={dateLettre}
                  onChange={setDateLettre}
                  aide="Par exemple, la date du jour."
                />
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
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-or"
                disabled={!lettrePrete}
                aria-describedby={raisonLettre ? "irl-lettre-manque" : undefined}
              >
                <IconeImprimer />
                Imprimer la lettre
              </button>
              {raisonLettre && (
                <p id="irl-lettre-manque" data-testid="irl-lettre-manque" className="mt-2 text-[13px] leading-snug text-[var(--texte-secondaire)]">
                  {raisonLettre}
                </p>
              )}
            </div>
          </CarteSaisie>

          {/* Incomplète, la lettre ne part pas non plus par l'impression du navigateur : la page imprimée dit pourquoi. */}
          {raisonLettre && <p className="hidden print:block">{raisonLettre}</p>}
          <div className={lettrePrete ? undefined : "print:hidden"}>
            <FeuillePapier
              id="lettre"
              libelle="Lettre de révision du loyer"
              legende={
                <>
                  <p className="eyebrow">Aperçu de la lettre</p>
                  <p className="text-[12.5px] text-[var(--texte-secondaire)]">
                    {lettrePrete ? "Format A4, prête à imprimer" : "Format A4, à compléter avant impression"}
                  </p>
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
                      <td>Indice de référence ({trimestreEcrit(tRef)})</td>
                      <td>{texteRef || <ACompleter quoi="indice" />}</td>
                    </tr>
                    <tr>
                      <td>Nouvel indice ({trimestreEcrit(tNouv)})</td>
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
          </div>
        </>
      )}
    </div>
  );
}
