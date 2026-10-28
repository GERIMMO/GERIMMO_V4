"use client";

import { useState, type FormEvent } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { ouvrirIncident, type EtatIncidentAction } from "@/app/actions/incidents";
import { compresserChampFichiers } from "@/lib/compresser-image";
import {
  categorieIncident,
  CATEGORIES_INCIDENT,
  IMPUTATIONS_INCIDENT,
  PIECES_INCIDENT, LONGUEUR_MAX_ANCIENNETE_INCIDENT, LONGUEUR_MAX_DESCRIPTION_INCIDENT } from "@/lib/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { ChampFichier } from "@/components/champ-fichier";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LegendeChamps } from "@/components/titre-ecran";

// min-w-0 : en flex, un select natif refuse sinon de descendre sous sa plus
// longue option et fait déborder la ligne (audit mobile 09/09). Même chaîne
// que actions-incident.tsx — un seul sélecteur pour tout l'écran incident.
const classeSelect =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm";

// Repère juridique de la catégorie choisie : une information pour l'agent,
// jamais une pré-sélection (RM-7.2.1)
export function RepereJuridique({ slug, estProprietaire = false }: { slug: string; estProprietaire?: boolean }) {
  const repere = categorieIncident(slug)?.repere;
  if (!repere) return null;
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      Repère : en général{" "}
      <span className="font-medium">
        {IMPUTATIONS_INCIDENT[repere.charge]?.toLowerCase()}
      </span>{" "}
      — {repere.fondement}.{" "}
      {/* « qualification » est un mot d'agence (25/09, D06) */}
      {estProprietaire ? "C'est vous qui décidez qui paie." : "C'est vous qui tranchez à la qualification."}
    </p>
  );
}

/** Un lot du parc et ce que l'on sait déjà de lui (FL-01, audit PR #264). */
export type LotIncident = {
  id: string;
  libelle: string;
  /** Baux en cours du lot : chambre et locataire. */
  baux: { id: string; libelle: string }[];
  /** Pièces proposées : chambres et pièces enregistrées du lot, ou liste générique (`piecesIncidentDuLot`). */
  pieces: string[];
};

export function FormulaireIncident({
  orgId,
  lots,
  lotInitial = "",
  estProprietaire = false,
}: {
  orgId: string;
  lots: LotIncident[];
  lotInitial?: string;
  estProprietaire?: boolean;
}) {
  const actionLiee = ouvrirIncident.bind(null, orgId);
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const [categorie, setCategorie] = useState("");
  // Le lot choisi pilote les champs qui suivent ; après un refus, le select
  // retombe sur la saisie envoyée, qui est ce dernier choix.
  const [lotChoisi, setLotChoisi] = useState(lotInitial);
  const lot = lots.find((l) => l.id === lotChoisi);
  // Plusieurs baux en cours (colocation à baux individuels) : le gérant dit
  // quelle chambre est concernée. Sans ce choix, l'incident était rattaché au
  // bail le plus récent et montré à ce seul colocataire (FL-01).
  const plusieursBaux = (lot?.baux.length ?? 0) > 1;
  const pieces = lot?.pieces ?? [...PIECES_INCIDENT];
  // Audit final (UX-07) : la validation était laissée au navigateur — bulle « Please select an item in the list. » sur
  // un Chromium en anglais, sans message sous le champ ni aria-invalid. Même motif que
  // formulaire-nouveau-mot-de-passe.tsx : le formulaire dit en français ce qui manque, sous le champ, et y pose le focus.
  type ChampObligatoire = "lot" | "bail" | "categorie" | "description";
  const MESSAGES: Record<ChampObligatoire, string> = {
    lot: "Choisissez le lot concerné.",
    bail: "Choisissez la chambre concernée, ou « Espaces partagés ou tout le logement ».",
    categorie: "Choisissez la catégorie la plus proche.",
    description: "Décrivez le problème : où exactement, depuis quand.",
  };
  const [manquants, setManquants] = useState<Partial<Record<ChampObligatoire, string>>>({});
  const marque = (champ: ChampObligatoire, aide?: string) => ({
    "aria-invalid": manquants[champ] ? true : undefined,
    "aria-describedby": [aide, manquants[champ] ? `erreur-${champ}` : undefined].filter(Boolean).join(" ") || undefined,
  });
  const effacer = (champ: ChampObligatoire) => manquants[champ] && setManquants((m) => ({ ...m, [champ]: undefined }));
  const sous = (champ: ChampObligatoire) =>
    manquants[champ] ? <p id={`erreur-${champ}`} role="alert" className="text-sm text-destructive">{manquants[champ]}</p> : null;
  function verifierAvantEnvoi(e: FormEvent<HTMLFormElement>) {
    const champs = e.currentTarget.elements;
    const erreurs: typeof manquants = {};
    for (const nom of ["lot", "bail", "categorie", "description"] as const) {
      const champ = champs.namedItem(nom) as HTMLSelectElement | HTMLTextAreaElement | null;
      if (champ && !champ.value.trim()) erreurs[nom] = MESSAGES[nom];
    }
    setManquants(erreurs);
    const premier = (Object.keys(erreurs) as ChampObligatoire[])[0];
    if (premier) {
      e.preventDefault();
      (champs.namedItem(premier) as HTMLElement | null)?.focus();
    }
  }

  return (
    <form data-saisie-confirmee action={action} noValidate onSubmit={verifierAvantEnvoi} className="formulaire-reperes space-y-4">
      <LegendeChamps />
      {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe
          sur la saisie (recette 22/08 — mécanique commune, lib/formulaires.ts) */}
      <div className="space-y-1.5">
        <Label htmlFor="lot">Lot concerné</Label>
        <select
          id="lot"
          name="lot"
          required
          defaultValue={etat.valeurs?.lot ?? lotInitial}
          onChange={(e) => { setLotChoisi(e.target.value); effacer("lot"); }}
          className={classeSelect}
          {...marque("lot")}
        >
          <option value="" disabled>
            Choisissez le lot…
          </option>
          {lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.libelle}
            </option>
          ))}
        </select>
        {sous("lot")}
      </div>

      {plusieursBaux && lot && (
        <div className="space-y-1.5">
          <Label htmlFor="bail">Chambre concernée</Label>
          {/* key : changer de lot repart d'un choix vide, jamais du bail d'un autre lot */}
          <select
            key={lot.id}
            id="bail"
            name="bail"
            required
            defaultValue={etat.valeurs?.lot === lot.id ? etat.valeurs?.bail ?? "" : ""}
            className={classeSelect}
            onChange={() => effacer("bail")}
            {...marque("bail", "bail-aide")}
          >
            <option value="" disabled>
              Choisissez la chambre…
            </option>
            {lot.baux.map((b) => (
              <option key={b.id} value={b.id}>
                {b.libelle}
              </option>
            ))}
            {/* « Parties communes » désigne celles de l'immeuble, transmises au
                syndic (RM-7.1.4) : ici, les espaces partagés de la colocation. */}
            <option value="aucun">Espaces partagés ou tout le logement</option>
          </select>
          {sous("bail")}
          <p id="bail-aide" className="text-xs text-muted-foreground">
            Seul le locataire de la chambre choisie suivra l&apos;incident depuis son espace. Espaces partagés ou tout
            le logement : aucun colocataire ne le verra.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="categorie">Catégorie</Label>
        <select
          id="categorie"
          name="categorie"
          required
          defaultValue={etat.valeurs?.categorie ?? ""}
          className={classeSelect}
          onChange={(e) => { setCategorie(e.target.value); effacer("categorie"); }}
          {...marque("categorie")}
        >
          <option value="" disabled>
            La catégorie la plus proche…
          </option>
          {CATEGORIES_INCIDENT.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.libelle}
            </option>
          ))}
        </select>
        {sous("categorie")}
        <RepereJuridique slug={categorie} estProprietaire={estProprietaire} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="piece">Pièce concernée — Facultatif</Label>
          {/* Les chambres et pièces du lot quand elles sont enregistrées (FL-01) ;
              key : la liste change avec le lot, la sélection repart de zéro. */}
          <select key={lot?.id ?? ""} id="piece" name="piece" defaultValue={etat.valeurs?.piece ?? ""} className={classeSelect}>
            <option value="">—</option>
            {pieces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="urgence">Urgence</Label>
          {/* Un <select> ne retourne pas à la ligne : à 390 px, « Normal — peut attendre
              quelques jours » (285 px) et « Urgent — dégât en cours ou logement
              inutilisable » (357 px) dépassaient les 270 px utiles et perdaient leur fin
              (relevé du 13/10, DES-A-15). Les libellés tiennent, le détail passe dessous. */}
          <select
            id="urgence"
            name="urgence"
            defaultValue={etat.valeurs?.urgence ?? "normale"}
            className={classeSelect}
            aria-describedby="urgence-aide"
          >
            <option value="normale">Normal — sous quelques jours</option>
            <option value="urgente">Urgent — dégât en cours</option>
          </select>
          <p id="urgence-aide" className="text-xs text-muted-foreground">
            Urgent : un dégât est en cours ou le logement est inutilisable.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          maxLength={LONGUEUR_MAX_DESCRIPTION_INCIDENT}
          required
          rows={3}
          placeholder="Ce que décrit le locataire : où exactement, depuis quand, est-ce que cela s'aggrave…"
          defaultValue={etat.valeurs?.description}
          onChange={() => effacer("description")}
          className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
          {...marque("description")}
        />
        {sous("description")}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="anciennete">Depuis quand ? — Facultatif</Label>
        <Input
          id="anciennete"
          name="anciennete"
          maxLength={LONGUEUR_MAX_ANCIENNETE_INCIDENT}
          placeholder="« Depuis dimanche, ça s'étend »"
          defaultValue={etat.valeurs?.anciennete}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="photos">Photos — Facultatif (5 max, JPEG ou PNG)</Label>
        {/* Champ fichier habillé en français (25/09, D10) : le natif rendait
            « Choose Files / No file chosen » sur un navigateur en anglais. */}
        <ChampFichier depotDirect
          id="photos"
          name="photos"
          accept="image/jpeg,image/png"
          multiple
          vide="Aucune photo choisie"
          onChange={(e) => void compresserChampFichiers(e.currentTarget)}
        />
      </div>

      {etat.erreur && <p className="message-formulaire" role="alert">{etat.erreur}</p>}
      {etat.succes && <p className="message-formulaire" data-succes role="status">{etat.succes}</p>}
      {etat.avertissement && (
        <p className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <BoutonEnvoi enCoursTexte="Envoi…">
          Déclarer l&apos;incident
        </BoutonEnvoi>
      </div>
    </form>
  );
}
