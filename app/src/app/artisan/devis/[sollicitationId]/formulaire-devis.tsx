"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { EtapesSaisie } from "@/components/etapes-saisie";
import { calculerDevis } from "@/lib/devis-structure";
import { euros } from "../../libelles";
import { useFormStatus } from "react-dom";
import {
  declinerMaSollicitation,
  deposerMonDevis,
  type EtatArtisanAction,
} from "@/app/actions/artisan";
import { LignesDevis } from "../../lignes-devis";
import { ChampFichier } from "@/components/champ-fichier";
import { compresserChampFichiers } from "@/lib/compresser-image";
import {
  CLASSE_AIDE,
  CLASSE_BOUTON_PRINCIPAL,
  CLASSE_BOUTON_REFUS,
  CLASSE_BOUTON_SOBRE,
  CLASSE_CHAMP,
  CLASSE_LIBELLE,
  CLASSE_ZONE_TEXTE,
  Erreur,
} from "../../ui";

/**
 * Répondre à une demande de devis (9.2).
 *
 * Le fichier est FACULTATIF, et c'est un choix : sur un chantier, le montant
 * et deux lignes de description partent en trente secondes, le PDF se prépare
 * le soir au bureau. Exiger le PDF, c'est n'avoir aucun devis avant le soir —
 * et la base ne l'exige pas non plus (`p_storage_path` y est nul par défaut).
 * Quand il est joint, il entre dans la GED de l'agence : c'est une pièce
 * d'agence, elle ne franchit aucune frontière.
 *
 * Une photo est acceptée autant qu'un PDF, et compressée à la prise : un devis
 * manuscrit photographié vaut mieux qu'un devis qui n'arrive pas.
 */

function Envoyer() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_PRINCIPAL} disabled={pending}>
      {pending ? "Envoi du devis…" : "Envoyer mon devis"}
    </button>
  );
}

function Decliner() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={CLASSE_BOUTON_REFUS} disabled={pending}>
      {pending ? "Envoi…" : "Confirmer : je ne chiffre pas"}
    </button>
  );
}

export function FormulaireDevis({
  sollicitationId,
  echeanceParDefaut,
}: {
  sollicitationId: string;
  /** Date de validité pré-remplie : trente jours, la valeur par défaut du module 9. */
  echeanceParDefaut: string;
}) {
  const [etat, action] = useActionState<EtatArtisanAction, FormData>(
    deposerMonDevis.bind(null, sollicitationId),
    {}
  );
  const [etatRefus, actionRefus] = useActionState<EtatArtisanAction, FormData>(
    declinerMaSollicitation.bind(null, sollicitationId),
    {}
  );
  const [refusOuvert, setRefusOuvert] = useState(false);

  const idDiagnostic = useId();
  const idEcheance = useId();
  const idFichier = useId();
  const idMotif = useId();

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-5">
        <EtapesSaisie titre="Préparer mon devis" etapes={[
          {titre:"Prestations", detail:"Expliquez votre diagnostic et chiffrez les travaux."},
          {titre:"Organisation", detail:"Précisez les délais et les conditions de votre intervention."},
          {titre:"Récapitulatif", detail:"Relisez votre proposition avant de l’envoyer."},
        ]} conclusion={<Envoyer />} contenus={[
        <div key="prestations" className="space-y-5">
        <div className="space-y-1.5">
          <label htmlFor={idDiagnostic} className={CLASSE_LIBELLE}>
            Votre diagnostic
          </label>
          <textarea
            id={idDiagnostic}
            name="diagnostic"
            rows={3}
            required
            defaultValue={etat.valeurs?.diagnostic}
            placeholder="Ex. : cartouche du mitigeur usée, joint à remplacer"
            className={CLASSE_ZONE_TEXTE}
          />
        </div>

        {/* Les travaux se disent une seule fois, ligne par ligne : la zone
            « Travaux proposés » redemandait en texte libre ce que le détail
            chiffre juste en dessous (tour du 24/09). */}
        <LignesDevis />

        </div>,
        <div key="organisation" className="space-y-5">
        <ResumeDevis compact />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm"><span className={CLASSE_LIBELLE}>Délai avant intervention</span><input name="delai" required defaultValue={etat.valeurs?.delai} placeholder="Ex. : sous 5 jours" className={CLASSE_CHAMP} /></label>
          <label className="space-y-1.5 text-sm"><span className={CLASSE_LIBELLE}>Durée estimée</span><input name="duree" required defaultValue={etat.valeurs?.duree} placeholder="Ex. : une demi-journée" className={CLASSE_CHAMP} /></label>
        </div>

        <div className="space-y-1.5"><label htmlFor="devis-contraintes" className={CLASSE_LIBELLE}>Contraintes et accès <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span></label><textarea id="devis-contraintes" name="contraintes" rows={2} defaultValue={etat.valeurs?.contraintes} className={CLASSE_ZONE_TEXTE} placeholder="Coupure d’eau, stationnement, présence nécessaire…" /></div>
        <div className="space-y-1.5"><label htmlFor="devis-observations" className={CLASSE_LIBELLE}>Observations <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span></label><textarea id="devis-observations" name="observations" rows={2} defaultValue={etat.valeurs?.observations} className={CLASSE_ZONE_TEXTE} placeholder="Ex. : robinet d’arrêt général à changer prochainement" /></div>

        <div className="space-y-1.5">
          <label htmlFor={idEcheance} className={CLASSE_LIBELLE}>
            Valable jusqu&apos;au
          </label>
          <input
            id={idEcheance}
            name="valide_jusqu_au"
            type="date"
            defaultValue={etat.valeurs?.valide_jusqu_au ?? echeanceParDefaut}
            className={CLASSE_CHAMP}
          />
          <p className={CLASSE_AIDE}>
            Passée cette date, le devis est caduc et ne peut plus être retenu.
          </p>
        </div>

        </div>,
        <div key="recapitulatif" className="space-y-5">
        <ResumeDevis />
        <div className="space-y-1.5">
          <label htmlFor={idFichier} className={CLASSE_LIBELLE}>
            Le devis en pièce jointe{" "}
            <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
          </label>
          {/* 25/09 (A6) : champ maison, libellé en français partout. */}
          <ChampFichier
            id={idFichier}
            name="fichier"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => {
              // Photo d'un devis manuscrit : compressée comme les autres.
              void compresserChampFichiers(e.currentTarget);
            }}
            className={`${CLASSE_CHAMP} min-h-13 py-2`}
          />
          <p className={CLASSE_AIDE}>
            PDF ou photo. Un seul devis par demande, et il ne se remplace pas
            une fois envoyé : joignez le document si vous l&apos;avez déjà.
          </p>
        </div>

        {etat.erreur && <Erreur>{etat.erreur}</Erreur>}

        </div>,
        ]} />
      </form>

      {!refusOuvert ? (
        <button
          type="button"
          className={CLASSE_BOUTON_SOBRE}
          onClick={() => setRefusOuvert(true)}
        >
          Je ne peux pas chiffrer cette demande
        </button>
      ) : (
        <form action={actionRefus} className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotif} className={CLASSE_LIBELLE}>
              Pourquoi{" "}
              <span className="font-normal text-[var(--texte-secondaire)]">(facultatif)</span>
            </label>
            <p className="text-[0.9375rem] text-[var(--texte-secondaire)]">
              Votre interlocuteur sollicitera quelqu&apos;un d&apos;autre. Un mot l&apos;aide à mieux
              vous solliciter la prochaine fois.
            </p>
            <textarea
              id={idMotif}
              name="motif"
              rows={3}
              defaultValue={etatRefus.valeurs?.motif}
              className={CLASSE_ZONE_TEXTE}
            />
          </div>
          {etatRefus.erreur && <Erreur>{etatRefus.erreur}</Erreur>}
          <Decliner />
          <button
            type="button"
            className={CLASSE_BOUTON_SOBRE}
            onClick={() => setRefusOuvert(false)}
          >
            Revenir
          </button>
        </form>
      )}
    </div>
  );
}


function ResumeDevis({compact = false}: {compact?: boolean}) {
  const bloc = useRef<HTMLDivElement>(null);
  const [resume, setResume] = useState({ diagnostic:"", delai:"", duree:"", validite:"", total:null as number | null, prestations:[] as string[] });
  useEffect(() => {
    const form = bloc.current?.closest("form");
    if (!form) return;
    let frame = 0;
    function lire() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const data = new FormData(form!);
        let total: number | null = null; let prestations: string[] = [];
        try {
          const lignes = JSON.parse(String(data.get("lignes_devis") || "[]"));
          total = calculerDevis(lignes).montant_ttc_cents;
          prestations = lignes.map((l: {libelle:string;quantite:number}) => `${l.quantite} × ${l.libelle}`);
        } catch { /* Les validations des lignes restent applicables avant l’envoi. */ }
        setResume({diagnostic:String(data.get("diagnostic") || ""), delai:String(data.get("delai") || ""), duree:String(data.get("duree") || ""), validite:String(data.get("valide_jusqu_au") || ""), total, prestations});
      });
    }
    lire(); form.addEventListener("input", lire); form.addEventListener("change", lire); form.addEventListener("click", lire);
    return () => { cancelAnimationFrame(frame); form.removeEventListener("input", lire); form.removeEventListener("change", lire); form.removeEventListener("click", lire); };
  }, []);
  if (compact) return <div ref={bloc} className="flex items-center justify-between rounded-lg bg-[var(--ivoire)] p-3 text-sm"><span>Total TTC de votre proposition</span><strong>{resume.total === null ? "À compléter" : euros(resume.total)}</strong></div>;
  return <div ref={bloc} className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4">
    <h3 className="text-lg">Votre proposition</h3>
    <p className="my-3 whitespace-pre-wrap text-sm">{resume.diagnostic || "Diagnostic à compléter"}</p>
    <ul className="space-y-1 text-sm">{resume.prestations.map((p,i) => <li key={i}>{p}</li>)}</ul>
    <dl className="my-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Intervention</dt><dd>{resume.delai || "À compléter"}</dd></div><div><dt className="text-muted-foreground">Durée</dt><dd>{resume.duree || "À compléter"}</dd></div><div><dt className="text-muted-foreground">Validité</dt><dd>{resume.validite ? new Date(`${resume.validite}T12:00:00`).toLocaleDateString("fr-FR") : "Non précisée"}</dd></div></dl>
    <p className="border-t border-[var(--filet)] pt-3 text-xl font-semibold">Total TTC : {resume.total === null ? "À compléter" : euros(resume.total)}</p>
    <p className="mt-2 text-xs text-muted-foreground">Un devis envoyé ne peut pas être remplacé. Revenez aux étapes précédentes pour le corriger.</p>
  </div>;
}
