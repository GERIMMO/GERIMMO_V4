"use client";

import { useEffect, useState } from "react";
import { Alerte, CLASSE_CARTE, Champ, Chiffre, Choix, Groupe } from "@/components/outils/champs";
import {
  EXEMPLE_IRL,
  URL_SERIE_INSEE_IRL,
  calculerRevisionIrl,
  libelleTrimestre,
  type NumeroTrimestre,
} from "@/lib/outils/irl";
import {
  aujourdhuiIso,
  formaterDateIso,
  formaterEuros,
  formaterNombre,
  formaterPourcent,
  lireNombre,
} from "@/lib/outils/nombres";

const TRIMESTRES: { valeur: string; libelle: string }[] = [1, 2, 3, 4].map((t) => ({
  valeur: String(t),
  libelle: `T${t} — ${["1er", "2e", "3e", "4e"][t - 1]} trimestre`,
}));
const ANNEES: { valeur: string; libelle: string }[] = Array.from({ length: 26 }, (_, i) => {
  const a = String(2010 + i);
  return { valeur: a, libelle: a };
});

const enTexte = (n: number | null) => (n == null ? "" : formaterNombre(n));

/** Un blanc à compléter, visible à l'écran comme sur papier. */
function ACompleter({ quoi }: { quoi: string }) {
  return <span className="italic text-[var(--libelle)]">[{quoi}]</span>;
}

export function CalculateurIrl() {
  const [loyer, setLoyer] = useState(enTexte(EXEMPLE_IRL.loyer));
  const [indiceRef, setIndiceRef] = useState(enTexte(EXEMPLE_IRL.indiceReference));
  const [trimRef, setTrimRef] = useState(String(EXEMPLE_IRL.trimestreReference.trimestre));
  const [anneeRef, setAnneeRef] = useState(String(EXEMPLE_IRL.trimestreReference.annee));
  const [indiceNouv, setIndiceNouv] = useState(enTexte(EXEMPLE_IRL.indiceNouveau));
  const [trimNouv, setTrimNouv] = useState(String(EXEMPLE_IRL.trimestreNouveau.trimestre));
  const [anneeNouv, setAnneeNouv] = useState(String(EXEMPLE_IRL.trimestreNouveau.annee));

  const [bailleurNom, setBailleurNom] = useState("");
  const [bailleurAdresse, setBailleurAdresse] = useState("");
  const [locataireNom, setLocataireNom] = useState("");
  const [logementAdresse, setLogementAdresse] = useState("");
  const [dateLettre, setDateLettre] = useState("");
  const [dateEffet, setDateEffet] = useState("");

  // La date du jour est celle du navigateur : posée après le montage, pour
  // que le rendu du serveur et celui du navigateur restent identiques.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setDateLettre(aujourdhuiIso());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const tRef = { trimestre: Number(trimRef) as NumeroTrimestre, annee: Number(anneeRef) };
  const tNouv = { trimestre: Number(trimNouv) as NumeroTrimestre, annee: Number(anneeNouv) };
  const r = calculerRevisionIrl({
    loyer: lireNombre(loyer),
    indiceReference: lireNombre(indiceRef),
    trimestreReference: tRef,
    indiceNouveau: lireNombre(indiceNouv),
    trimestreNouveau: tNouv,
  });
  const loyerActuel = lireNombre(loyer);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] print:hidden">
        <section className={`${CLASSE_CARTE} space-y-5`} aria-labelledby="irl-saisie">
          <h2 id="irl-saisie" className="text-[length:var(--pas-section)]">
            Vos chiffres
          </h2>
          <Champ id="irl-loyer" libelle="Loyer actuel hors charges" valeur={loyer} onChange={setLoyer} suffixe="€" decimal />
          <Groupe legende="Indice de référence (celui du bail ou de la dernière révision)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Choix id="irl-trim-ref" libelle="Trimestre" valeur={trimRef} onChange={setTrimRef} options={TRIMESTRES} />
              <Choix id="irl-annee-ref" libelle="Année" valeur={anneeRef} onChange={setAnneeRef} options={ANNEES} />
              <Champ id="irl-indice-ref" libelle="Valeur de l'indice" valeur={indiceRef} onChange={setIndiceRef} decimal />
            </div>
          </Groupe>
          <Groupe legende="Nouvel indice (même trimestre, un an plus tard)">
            <div className="grid gap-3 sm:grid-cols-3">
              <Choix id="irl-trim-nouv" libelle="Trimestre" valeur={trimNouv} onChange={setTrimNouv} options={TRIMESTRES} />
              <Choix id="irl-annee-nouv" libelle="Année" valeur={anneeNouv} onChange={setAnneeNouv} options={ANNEES} />
              <Champ id="irl-indice-nouv" libelle="Valeur de l'indice" valeur={indiceNouv} onChange={setIndiceNouv} decimal />
            </div>
          </Groupe>
          <p className="text-[13px] text-[var(--texte-secondaire)]">
            Les valeurs pré-remplies sont un exemple. Relevez les indices officiels sur{" "}
            <a href={URL_SERIE_INSEE_IRL} target="_blank" rel="noopener noreferrer" className="lien-texte">
              la série de l&apos;IRL publiée par l&apos;Insee
            </a>
            .
          </p>
        </section>

        <section className={`${CLASSE_CARTE} space-y-4`} aria-labelledby="irl-resultat" aria-live="polite">
          <h2 id="irl-resultat" className="text-[length:var(--pas-section)]">
            Résultat
          </h2>
          {r.ok ? (
            <>
              <Chiffre libelle="Nouveau loyer hors charges" valeur={formaterEuros(r.nouveauLoyer)} testId="irl-nouveau-loyer" accent />
              <div className="grid grid-cols-2 gap-4">
                <Chiffre libelle="Écart mensuel" valeur={`${r.ecart >= 0 ? "+" : ""}${formaterEuros(r.ecart)}`} />
                <Chiffre libelle="Variation de l'indice" valeur={`${r.variation >= 0 ? "+" : ""}${formaterPourcent(r.variation)}`} />
              </div>
              <p className="montant text-[13px] text-[var(--texte-secondaire)]">
                {formaterEuros(loyerActuel ?? 0)} × {indiceNouv} ÷ {indiceRef} = {formaterEuros(r.nouveauLoyer)}, arrondi au centime.
              </p>
            </>
          ) : (
            <p className="text-[14px] text-[var(--texte-secondaire)]">Renseignez {r.manque.join(", ")}.</p>
          )}
          {r.alertes.length > 0 && (
            <div className="space-y-2" data-testid="irl-alertes">
              {r.alertes.map((a) => (
                <Alerte key={a.code} gravite={a.gravite}>
                  {a.message}
                </Alerte>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={`${CLASSE_CARTE} space-y-4 print:hidden`} aria-labelledby="irl-lettre-saisie">
        <h2 id="irl-lettre-saisie" className="text-[length:var(--pas-section)]">
          La lettre au locataire
        </h2>
        <p className="text-[14px] text-[var(--texte-secondaire)]">
          Complétez ces champs : la lettre ci-dessous se met à jour, puis imprimez-la ou enregistrez-la en PDF. Rien
          n&apos;est envoyé ni conservé.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ id="irl-bailleur-nom" libelle="Nom du bailleur" valeur={bailleurNom} onChange={setBailleurNom} autoComplete="name" />
          <Champ id="irl-bailleur-adresse" libelle="Adresse du bailleur" valeur={bailleurAdresse} onChange={setBailleurAdresse} />
          <Champ id="irl-locataire-nom" libelle="Nom du locataire" valeur={locataireNom} onChange={setLocataireNom} />
          <Champ id="irl-logement" libelle="Adresse du logement loué" valeur={logementAdresse} onChange={setLogementAdresse} />
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
        <button type="button" onClick={() => window.print()} className="btn-or" disabled={!r.ok}>
          Imprimer la lettre
        </button>
      </section>

      <article
        id="lettre"
        aria-label="Lettre de révision du loyer"
        className="loc-carte space-y-4 text-[14.5px] leading-relaxed text-[var(--corps)] print:border-0 print:p-0 print:shadow-none"
      >
        <div>
          <p className="font-semibold">{bailleurNom || <ACompleter quoi="Nom du bailleur" />}</p>
          <p>{bailleurAdresse || <ACompleter quoi="Adresse du bailleur" />}</p>
        </div>
        <div className="sm:ml-auto sm:w-1/2">
          <p className="font-semibold">{locataireNom || <ACompleter quoi="Nom du locataire" />}</p>
          <p>{logementAdresse || <ACompleter quoi="Adresse du logement" />}</p>
          <p className="mt-3">Le {formaterDateIso(dateLettre) || <ACompleter quoi="date" />}</p>
        </div>
        <p className="font-semibold">Objet : révision annuelle du loyer</p>
        <p>Madame, Monsieur,</p>
        <p>
          Conformément à la clause de révision de votre bail et à l&apos;article 17-1 de la loi n° 89-462 du 6 juillet 1989,
          le loyer hors charges du logement situé {logementAdresse || <ACompleter quoi="adresse du logement" />} est révisé
          selon la variation de l&apos;indice de référence des loyers (IRL) publié par l&apos;Insee.
        </p>
        <ul className="montant list-disc space-y-1 pl-5">
          <li>Loyer hors charges actuel : {loyerActuel != null ? formaterEuros(loyerActuel) : <ACompleter quoi="loyer" />}</li>
          <li>
            Indice de référence ({libelleTrimestre(tRef)}) : {indiceRef || <ACompleter quoi="indice" />}
          </li>
          <li>
            Nouvel indice ({libelleTrimestre(tNouv)}) : {indiceNouv || <ACompleter quoi="indice" />}
          </li>
          {r.ok && (
            <li>
              Calcul : {formaterEuros(loyerActuel ?? 0)} × {indiceNouv} ÷ {indiceRef} = {formaterEuros(r.nouveauLoyer)}
              {" "}(arrondi au centime)
            </li>
          )}
        </ul>
        <p>
          À compter du {formaterDateIso(dateEffet) || <ACompleter quoi="date d'effet" />}, votre loyer mensuel hors
          charges s&apos;élève donc à{" "}
          <b className="montant">{r.ok ? formaterEuros(r.nouveauLoyer) : <ACompleter quoi="nouveau loyer" />}</b>. Le
          montant des charges n&apos;est pas modifié par la présente révision.
        </p>
        <p>Je vous prie d&apos;agréer, Madame, Monsieur, l&apos;expression de mes salutations distinguées.</p>
        <p className="pt-6 font-semibold">{bailleurNom || <ACompleter quoi="Nom et signature du bailleur" />}</p>
      </article>
    </div>
  );
}
