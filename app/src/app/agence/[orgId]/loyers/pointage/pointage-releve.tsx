"use client";

import { useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ChampFichier } from "@/components/champ-fichier";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { eur, formaterDate, moisEnFrancais } from "@/lib/ged";
import { useHydrate } from "@/lib/use-hydrate";
import { deElide } from "@/lib/elision";
import { decoderReleve, lireReleve, TAILLE_MAX_RELEVE, type ReleveLu } from "@/lib/releve-bancaire";
import {
  avecCles, LIBELLES_MODE, modeDepuisLibelle, rapprocher, verifierSelection,
  type AppelOuvert, type Candidat, type EncaissementConnu, type LigneAPointer, type LigneAvecCle, type Proposition,
} from "@/lib/pointage-loyers";
import { enregistrerPointage, type ResultatLignePointee } from "@/app/actions/pointage-loyers";

// L'écran du pointage (audit palier 1, P2-05). Tout ce qui touche au fichier se passe ICI, sur l'appareil : lecture,
// rapprochement, proposition. Seules les lignes cochées partent vers le serveur, au moment où le propriétaire appuie
// sur « Enregistrer ».

type Releve = { nom: string; lu: ReleveLu; lignes: LigneAvecCle[] };

const A_CONFIRMER = new Set(["sur", "probable", "partiel", "choix"]);
const ETIQUETTES: Record<string, string> = {
  sur: "Correspondance sûre",
  probable: "À vérifier",
  partiel: "Règlement partiel ?",
  choix: "À choisir",
  deja: "Déjà enregistré",
  superieur: "À saisir sur le bail",
  a_venir: "Loyer pas encore échu",
  aucun: "Sans loyer correspondant",
};

/** « Loyer de novembre 2026 », « Loyer d’avril 2026 » : l'élision passe par la règle commune. */
const loyerDe = (a: AppelOuvert) => `Loyer ${deElide(moisEnFrancais(a.periode.slice(0, 7)))} — ${a.locataire ?? "Locataire non renseigné"} · ${a.lotNom}`;

export function PointageReleve({
  orgId, base, appels, encaissements, aujourdHui,
}: {
  orgId: string;
  base: string;
  appels: AppelOuvert[];
  encaissements: EncaissementConnu[];
  aujourdHui: string;
}) {
  const [releve, setReleve] = useState<Releve | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [coches, setCoches] = useState<Record<number, boolean>>({});
  const [choix, setChoix] = useState<Record<number, string>>({});
  const [resultats, setResultats] = useState<ResultatLignePointee[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [documents, setDocuments] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  // Le champ de fichier n'agit qu'une fois la page prête : l'écran le dit aux parcours automatisés.
  const pret = useHydrate();

  async function lire(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    setResultats([]); setErreur(null); setDocuments(null); setCoches({}); setChoix({}); setErreurFichier(null);
    if (!fichier) { setReleve(null); return; }
    if (/\.pdf$/i.test(fichier.name) || fichier.type === "application/pdf") {
      setReleve(null);
      setErreurFichier("Un relevé en PDF ne peut pas être lu. Sur le site de votre banque, choisissez l’export au format CSV (ou OFX).");
      return;
    }
    if (fichier.size > TAILLE_MAX_RELEVE) {
      setReleve(null);
      setErreurFichier("Ce fichier dépasse 2 Mo. Exportez une période plus courte (un à trois mois).");
      return;
    }
    try {
      const lu = lireReleve(decoderReleve(await fichier.arrayBuffer()));
      if ("erreur" in lu) { setReleve(null); setErreurFichier(lu.erreur); return; }
      setReleve({ nom: fichier.name, lu, lignes: await avecCles(orgId, lu.lignes) });
    } catch {
      setReleve(null);
      setErreurFichier("Ce fichier n’a pas pu être lu sur votre appareil. Réessayez, ou exportez de nouveau le relevé.");
    }
  }

  const propositions = useMemo(
    () => (releve ? rapprocher({ lignes: releve.lignes, appels, encaissements, aujourdHui }) : []),
    [releve, appels, encaissements, aujourdHui],
  );
  const reponses = new Map(resultats.map((r) => [r.position, r]));
  // Une ligne que le serveur vient de traiter ne se recoche pas, même si la page n'a pas encore été relue.
  const faites = new Set(resultats.filter((r) => r.statut !== "refuse").map((r) => r.position));
  /** La ligne est-elle cochée, et pour quel loyer ? */
  const candidatRetenu = (p: Proposition): Candidat | null => {
    if (faites.has(p.ligne.position)) return null;
    if (p.statut === "choix") return p.candidats.find((c) => c.appelId === choix[p.ligne.position]) ?? null;
    if (!A_CONFIRMER.has(p.statut)) return null;
    return (coches[p.ligne.position] ?? p.statut === "sur") ? p.candidats[0] : null;
  };
  const selection = new Map<number, string>();
  for (const p of propositions) {
    const c = candidatRetenu(p);
    if (c) selection.set(p.ligne.position, c.appelId);
  }
  const fautes = verifierSelection(propositions, selection, faites);
  const aConfirmer = propositions.filter((p) => A_CONFIRMER.has(p.statut));
  const deja = propositions.filter((p) => p.statut === "deja");
  const autres = propositions.filter((p) => !A_CONFIRMER.has(p.statut) && p.statut !== "deja");
  const enregistres = resultats.filter((r) => r.statut === "enregistre").length;
  const refuses = resultats.filter((r) => r.statut === "refuse");

  function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enCours || selection.size === 0 || fautes.size > 0) return;
    const lignes: LigneAPointer[] = [];
    for (const p of propositions) {
      const c = candidatRetenu(p);
      if (!c) continue;
      lignes.push({
        position: p.ligne.position, date: p.ligne.date, centimes: p.ligne.centimes, libelle: p.ligne.libelle,
        rang: p.ligne.rang, appelId: c.appelId, resteCentimes: c.resteAttenduCentimes,
      });
    }
    demarrer(async () => {
      setErreur(null); setDocuments(null);
      try {
        const etat = await enregistrerPointage(orgId, lignes);
        if (etat.erreur) { setErreur(etat.erreur); return; }
        setResultats(etat.resultats ?? []);
        setDocuments(etat.documents ?? null);
        // Ce qui vient d'être traité n'est plus « coché » : la page relue le classe désormais « déjà enregistré ».
        setCoches({}); setChoix({});
      } catch {
        setErreur("La réponse n’est pas arrivée. Rechargez la page et relisez le relevé : une ligne déjà enregistrée ne le sera pas deux fois.");
      }
    });
  }

  const ligne = (p: Proposition) => {
    const position = p.ligne.position;
    const reponse = reponses.get(position);
    const retenu = candidatRetenu(p);
    const affiche = retenu ?? (p.candidats.length === 1 ? p.candidats[0] : null);
    const idCase = `pointage-${position}`;
    return (
      <li key={position} data-ligne-releve data-statut={p.statut} className="min-w-0 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-medium">{formaterDate(p.ligne.date)} · {eur(p.ligne.centimes / 100)}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs" data-etiquette>{ETIQUETTES[p.statut]}</span>
        </div>
        <p className="mt-1 min-w-0 text-sm text-muted-foreground [overflow-wrap:anywhere]" data-libelle>
          {p.ligne.libelle || "Sans libellé"}
        </p>
        {affiche && p.statut !== "deja" && (
          <p className="mt-1 min-w-0 text-sm [overflow-wrap:anywhere]" data-loyer>
            {loyerDe(affiche)} · reste dû {eur(affiche.resteAttenduCentimes / 100)}
            {A_CONFIRMER.has(p.statut) && <> · {LIBELLES_MODE[modeDepuisLibelle(p.ligne.libelle)]}</>}
          </p>
        )}
        <p className="mt-1 text-sm text-muted-foreground">{p.motif}</p>
        {(p.statut === "superieur" || p.statut === "a_venir") && affiche && (
          <Link href={`${base}/baux/${affiche.bailId}#loyers`} className="lien-discret mt-1 inline-flex min-h-11 items-center text-sm">
            Ouvrir le bail →
          </Link>
        )}
        {p.statut === "choix" && !faites.has(position) && (
          <label className="mt-2 block text-sm" htmlFor={idCase}>
            Loyer réglé par cette somme
            <select
              id={idCase}
              value={choix[position] ?? ""}
              onChange={(e) => setChoix((c) => ({ ...c, [position]: e.target.value }))}
              disabled={enCours}
              className="mt-1 block min-h-11 w-full max-w-full rounded-lg border border-border bg-background px-3"
            >
              <option value="">Ne pas enregistrer cette ligne</option>
              {p.candidats.map((c) => <option key={c.appelId} value={c.appelId}>{loyerDe(c)}</option>)}
            </select>
          </label>
        )}
        {A_CONFIRMER.has(p.statut) && p.statut !== "choix" && !faites.has(position) && (
          <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 text-sm" htmlFor={idCase}>
            <input
              id={idCase}
              type="checkbox"
              className="size-5 shrink-0"
              checked={Boolean(retenu)}
              disabled={enCours}
              onChange={(e) => setCoches((c) => ({ ...c, [position]: e.target.checked }))}
            />
            <span>{p.statut === "partiel" ? "Enregistrer ce règlement partiel" : "Enregistrer ce règlement"}</span>
          </label>
        )}
        {fautes.has(position) && <p className="err mt-1 mb-0 text-sm" role="alert" data-faute>{fautes.get(position)}</p>}
        {reponse && (
          <p className={reponse.statut === "refuse" ? "err mt-1 mb-0 text-sm" : "mt-1 text-sm font-medium"} role={reponse.statut === "refuse" ? "alert" : "status"} data-reponse={reponse.statut}>
            {reponse.message}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5" data-pointage-releve data-pret={pret ? "oui" : "non"}>
      <section className="loc-carte">
        <div className="entete-carte">
          <h2 className="titre-carte leading-[inherit]">1. Votre relevé</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Sur le site de votre banque, téléchargez les opérations de votre compte au format CSV (ou OFX), puis
          choisissez le fichier ici. <b className="font-semibold text-foreground">Il est lu sur votre appareil : il n’est
          ni envoyé à Gerimmo ni conservé.</b> Seules les lignes que vous confirmez sont enregistrées (leur date, leur
          montant et leur libellé).
        </p>
        <div className="mt-3">
          <ChampFichier
            id="releve-banque"
            name="releve"
            accept=".csv,.txt,.ofx,text/csv,text/plain"
            libelle="Choisir le relevé"
            vide="Aucun relevé choisi"
            aria-label="Relevé de banque (CSV ou OFX)"
            onChange={lire}
          />
        </div>
        {erreurFichier && <p className="err mt-3 mb-0" role="alert" data-erreur-releve>{erreurFichier}</p>}
        {appels.length === 0 && (
          <p className="mt-3 text-sm" role="status" data-rien-a-recevoir>
            Aucun loyer ne reste à recevoir pour le moment : il n’y a rien à pointer.
          </p>
        )}
      </section>

      {releve && (
        // `data-saisie-libre` : rien n'est tapé ici. Les cases se retrouvent en redonnant le relevé, et une ligne déjà
        // enregistrée ne peut pas l'être deux fois : quitter la page ne fait rien perdre.
        <form onSubmit={envoyer} className="space-y-5" data-rapprochement data-saisie-libre>
          <section className="loc-carte">
            <div className="entete-carte">
              <h2 className="titre-carte leading-[inherit]">2. Ce que dit le relevé</h2>
            </div>
            <p className="mt-1 text-sm" role="status" data-resume-releve>
              {releve.lu.lignes.length === 0
                ? "Ce relevé ne contient aucune somme reçue."
                : `${releve.lu.lignes.length} somme${releve.lu.lignes.length > 1 ? "s" : ""} reçue${releve.lu.lignes.length > 1 ? "s" : ""} : ${aConfirmer.length} à confirmer, ${deja.length} déjà enregistrée${deja.length > 1 ? "s" : ""}, ${autres.length} sans loyer à pointer.`}
              {releve.lu.debits > 0 && ` ${releve.lu.debits} sortie${releve.lu.debits > 1 ? "s" : ""} d’argent ignorée${releve.lu.debits > 1 ? "s" : ""}.`}
              {releve.lu.illisibles > 0 && ` ${releve.lu.illisibles} ligne${releve.lu.illisibles > 1 ? "s" : ""} dont la date ou le montant ne se lit pas : ignorée${releve.lu.illisibles > 1 ? "s" : ""}.`}
            </p>
            {releve.lu.tronque && (
              <p className="err mt-2 mb-0 text-sm" role="alert">
                Ce relevé est long : seules ses 3 000 premières opérations ont été lues. Exportez une période plus courte pour le reste.
              </p>
            )}
            {aConfirmer.length > 0 ? (
              <>
                <h3 className="mt-4 text-sm font-semibold">À confirmer</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Seules les correspondances sûres sont cochées d’avance. Rien n’est enregistré tant que vous n’avez pas
                  appuyé sur le bouton.
                </p>
                <ul className="mt-1 divide-y divide-border" data-a-confirmer>{aConfirmer.map(ligne)}</ul>
              </>
            ) : releve.lu.lignes.length > 0 ? (
              <p className="mt-3 text-sm" data-rien-a-confirmer>Aucune somme de ce relevé n’est à confirmer.</p>
            ) : null}
            {erreur && <p className="err mt-3 mb-0" role="alert" data-erreur-pointage>{erreur}</p>}
            {aConfirmer.length > 0 && (
              <div className="mt-4">
                <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" disabled={selection.size === 0 || fautes.size > 0} data-enregistrer-pointage>
                  {selection.size === 0
                    ? "Cochez les règlements à enregistrer"
                    : selection.size === 1 ? "Enregistrer le règlement coché" : `Enregistrer les ${selection.size} règlements cochés`}
                </BoutonEnvoi>
              </div>
            )}
          </section>

          {resultats.length > 0 && (
            <section className="loc-carte" data-bilan-pointage>
              <div className="entete-carte">
                <h2 className="titre-carte leading-[inherit]">3. Ce qui a été enregistré</h2>
              </div>
              <p className="mt-1 text-sm" role="status">
                {enregistres === 0 ? "Aucun nouveau règlement n’a été enregistré." : enregistres === 1 ? "1 règlement enregistré." : `${enregistres} règlements enregistrés.`}
                {enregistres > 0 && " Les reçus et quittances sont créés comme après tout encaissement. Ce pointage n’envoie aucun e-mail : l’envoi suit vos réglages habituels."}
              </p>
              {documents && <p className="err mt-2 mb-0 text-sm" role="alert">{documents}</p>}
              {refuses.length > 0 && (
                <p className="err mt-2 mb-0 text-sm" role="alert" data-refus-pointage>
                  {refuses.length === 1 ? "1 ligne n’a pas été enregistrée" : `${refuses.length} lignes n’ont pas été enregistrées`} : la raison est écrite sous chacune.
                </p>
              )}
              <Link href={`${base}/loyers#loyers`} className="btn-secondaire mt-3">Revenir à mes finances</Link>
            </section>
          )}

          {deja.length > 0 && (
            <section className="loc-carte">
              <details data-deja-enregistres open={resultats.length > 0}>
                <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                  Déjà enregistré dans Gerimmo · {deja.length}
                </summary>
                <ul className="mt-1 divide-y divide-border">{deja.map(ligne)}</ul>
              </details>
            </section>
          )}
          {autres.length > 0 && (
            <section className="loc-carte">
              <details data-sans-loyer>
                <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">
                  Autres sommes reçues, sans loyer à pointer · {autres.length}
                </summary>
                <ul className="mt-1 divide-y divide-border">{autres.map(ligne)}</ul>
              </details>
            </section>
          )}
        </form>
      )}
    </div>
  );
}
