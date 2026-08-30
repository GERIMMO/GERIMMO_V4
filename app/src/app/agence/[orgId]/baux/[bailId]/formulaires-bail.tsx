"use client";
import { InputDateJour } from "@/components/input-date-jour";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  deposerBailSigne,
  deposerReglementCopropriete,
  enregistrerConge,
  annulerConge,
  type EtatBail,
} from "@/app/actions/baux";
import { creerEdl, type EtatEdl } from "@/app/actions/edl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Une pièce PDF du bail : champ fichier + bouton, même gabarit pour le bail
// signé et le règlement de copropriété.
function FormulairePieceBail({
  id,
  libelle,
  bouton,
  action,
}: {
  id: string;
  libelle: string;
  bouton: string;
  action: (etat: EtatBail, formData: FormData) => Promise<EtatBail>;
}) {
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          {libelle}
        </Label>
        <Input id={id} name="fichier" type="file" accept=".pdf" required />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Dépôt…" : bouton}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.blocages && etat.blocages.length > 0 && (
        <ul className="w-full space-y-1.5">
          {etat.blocages.map((b) => (
            <li
              key={b.message}
              className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 text-muted-foreground">{b.message}</span>
              <Link href={b.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {b.libelle} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function FormulaireBailSigne({ orgId, bailId }: { orgId: string; bailId: string }) {
  return (
    <FormulairePieceBail
      id="bail-signe"
      libelle="Bail signé (PDF uniquement) — son dépôt active le bail et loue le lot"
      bouton="Déposer le bail signé"
      action={deposerBailSigne.bind(null, orgId, bailId)}
    />
  );
}

export function FormulaireReglementCopropriete({ orgId, bailId }: { orgId: string; bailId: string }) {
  return (
    <FormulairePieceBail
      id="reglement-copro"
      libelle="Règlement de copropriété (PDF, facultatif)"
      bouton="Déposer le règlement"
      action={deposerReglementCopropriete.bind(null, orgId, bailId)}
    />
  );
}

export function FormulaireConge({
  orgId,
  bailId,
  type,
}: {
  orgId: string;
  bailId: string;
  type: string;
}) {
  const action = enregistrerConge.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  const [par, setPar] = useState<"locataire" | "bailleur">("locataire");
  const [reduit, setReduit] = useState(false);
  const meuble = type === "meuble";

  // Préavis légal dérivé (le contrôle en base fait autorité)
  const preavis = par === "bailleur" ? (meuble ? 3 : 6) : meuble || reduit ? 1 : 3;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="preavis_mois" value={preavis} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="conge-par" className="text-xs">
            Donné par
          </Label>
          <select
            id="conge-par"
            name="par"
            value={par}
            onChange={(e) => setPar(e.target.value as "locataire" | "bailleur")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="locataire">Locataire</option>
            <option value="bailleur">Bailleur</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conge-date" className="text-xs">
            1ʳᵉ présentation du recommandé
          </Label>
          <InputDateJour id="conge-date"   required name="date_presentation" />
        </div>
      </div>

      {par === "bailleur" ? (
        <div className="space-y-1.5">
          <Label htmlFor="conge-motif" className="text-xs">
            Motif (obligatoire — sinon le congé est nul)
          </Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
          <select
            id="conge-motif"
            name="motif"
            defaultValue={etat.valeurs?.motif ?? ""}
            required
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="" disabled>
              Choisir un motif…
            </option>
            <option value="Reprise (bénéficiaire familial)">Reprise</option>
            <option value="Vente du logement">Vente</option>
            <option value="Motif légitime et sérieux">Motif légitime et sérieux</option>
          </select>
        </div>
      ) : (
        !meuble && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reduit}
                onChange={(e) => setReduit(e.target.checked)}
                className="size-4"
              />
              Préavis réduit à 1 mois (mutation, santé, perte d&apos;emploi, RSA/AAH…)
            </label>
            <p className="text-xs text-muted-foreground">
              En zone tendue, le préavis d&apos;un mois s&apos;applique de plein droit : inutile
              de cocher, aucun justificatif n&apos;est exigible (la zone est portée par le bien).
            </p>
            {reduit && (
              <Input
                name="justificatif"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                required
                className="mt-1"
              />
            )}
          </div>
        )
      )}

      <p className="text-xs text-muted-foreground">
        Préavis appliqué : <span className="font-medium">{preavis} mois</span>
        {par === "bailleur"
          ? meuble
            ? " (bailleur, meublé)"
            : " (bailleur, nu)"
          : meuble
            ? " (locataire, meublé)"
            : reduit
              ? " (locataire, réduit)"
              : " (locataire, nu)"}
        . La date d&apos;effet est calculée depuis la 1ʳᵉ présentation.
      </p>

      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer le congé"}
      </Button>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function FormulaireCreerEdl({ orgId, bailId }: { orgId: string; bailId: string }) {
  const action = creerEdl.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatEdl, FormData>(action, {});
  return (
    <form action={formAction} className="flex items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="edl-type" className="text-xs">
          Nouvel état des lieux
        </Label>
        <select
          id="edl-type"
          name="type"
          defaultValue="entree"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="entree">Entrée</option>
          <option value="sortie">Sortie</option>
        </select>
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Création…" : "Créer + générer la grille"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}

// Le locataire se rétracte. L'annulation n'est possible que tant que le départ
// n'a pas eu lieu — la base refuse sinon, avec la raison.
export function FormulaireAnnulerConge({ orgId, bailId }: { orgId: string; bailId: string }) {
  const action = annulerConge.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="annulation-motif" className="text-xs">
            Pourquoi le congé s&apos;annule (facultatif)
          </Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08) */}
          <Input
            id="annulation-motif"
            name="motif"
            maxLength={200}
            placeholder="Le locataire reste finalement…"
            className="w-64"
            defaultValue={etat.valeurs?.motif}
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "…" : "Annuler le congé"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Le bail redevient actif, le lot reste loué, et le congé annulé reste au
        dossier. Impossible une fois l&apos;état des lieux de sortie signé.
      </p>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}
