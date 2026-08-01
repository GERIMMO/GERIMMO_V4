"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  deposerBailSigne,
  activerBail,
  enregistrerConge,
  type EtatBail,
} from "@/app/actions/baux";
import { creerEdl, type EtatEdl } from "@/app/actions/edl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireBailSigne({ orgId, bailId }: { orgId: string; bailId: string }) {
  const action = deposerBailSigne.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div className="space-y-1.5">
        <Label htmlFor="bail-signe" className="text-xs">
          Bail signé (PDF/JPG/PNG)
        </Label>
        <Input id="bail-signe" name="fichier" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Dépôt…" : "Déposer le bail signé"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}

export function BoutonActiverBail({ orgId, bailId }: { orgId: string; bailId: string }) {
  const action = activerBail.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  return (
    <form action={formAction}>
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Activation…" : "Activer le bail"}
      </Button>
      {etat.erreur && <p className="mt-1 text-sm text-destructive">{etat.erreur}</p>}
      {etat.blocages && etat.blocages.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {etat.blocages.map((b) => (
            <li
              key={b.message}
              className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 text-muted-foreground">{b.message}</span>
              <Link
                href={b.href}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {b.libelle} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function FormulaireConge({ orgId, bailId }: { orgId: string; bailId: string }) {
  const action = enregistrerConge.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="conge-par" className="text-xs">
            Donné par
          </Label>
          <select
            id="conge-par"
            name="par"
            defaultValue="locataire"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="locataire">Locataire</option>
            <option value="bailleur">Bailleur</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conge-date" className="text-xs">
            1ʳᵉ présentation (LRAR)
          </Label>
          <Input id="conge-date" name="date_presentation" type="date" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conge-preavis" className="text-xs">
            Préavis (mois)
          </Label>
          <select
            id="conge-preavis"
            name="preavis_mois"
            defaultValue="3"
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="3">3 mois</option>
            <option value="1">1 mois (réduit)</option>
          </select>
        </div>
      </div>
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
