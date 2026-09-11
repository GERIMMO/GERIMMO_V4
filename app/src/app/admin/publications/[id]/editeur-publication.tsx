"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  enregistrerPublication,
  publierPublication,
  refuserPublication,
  retirerPublication,
  type EtatPublication,
} from "@/app/actions/publications";

type Props = {
  id: string;
  titre: string;
  slug: string | null;
  chapo: string | null;
  corps: string | null;
  seoDescription: string | null;
  statut: string;
  sources: string[];
};

const MARQUE = /\[\[à compléter\s*:?\s*([^\]]*)\]\]/g;

function listerTrous(corps: string): string[] {
  return [...corps.matchAll(MARQUE)].map((m) => m[1].trim());
}

export function EditeurPublication(p: Props) {
  const [corps, setCorps] = useState(p.corps ?? "");
  const [etat, action] = useActionState<EtatPublication, FormData>(
    async (e, fd) => enregistrerPublication(p.id, e, fd),
    {}
  );
  const [etatParution, actionParution] = useActionState<EtatPublication, FormData>(
    async () => publierPublication(p.id),
    {}
  );
  const [etatRefus, actionRefus] = useActionState<EtatPublication, FormData>(
    async (e, fd) => refuserPublication(p.id, e, fd),
    {}
  );
  const [etatRetrait, actionRetrait] = useActionState<EtatPublication, FormData>(
    async () => retirerPublication(p.id),
    {}
  );

  const trous = listerTrous(corps);
  const paru = p.statut === "publiee";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
      {/* ------------------------------------------------ Colonne d'écriture */}
      <form action={action} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="titre" className="libelle-champ">Titre</Label>
          <Input id="titre" name="titre" defaultValue={etat.valeurs?.titre ?? p.titre} required />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="chapo" className="libelle-champ">
            Chapô — ce qu&apos;on lit avant de cliquer
          </Label>
          <textarea
            id="chapo"
            name="chapo"
            rows={3}
            defaultValue={etat.valeurs?.chapo ?? p.chapo ?? ""}
            className="w-full rounded-[3px] border border-[var(--filet)] bg-[var(--ivoire)] p-2.5 text-base leading-relaxed sm:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corps" className="libelle-champ">Corps de l&apos;article (markdown)</Label>
          <textarea
            id="corps"
            name="corps"
            rows={26}
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            className="w-full rounded-[3px] border border-[var(--filet)] bg-[var(--ivoire)] p-3 font-mono text-base leading-relaxed sm:text-[13px]"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="slug" className="libelle-champ">Adresse</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={p.slug ?? ""}
              placeholder="déduite du titre si vide"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo_description" className="libelle-champ">
              Description pour les moteurs
            </Label>
            <Input
              id="seo_description"
              name="seo_description"
              defaultValue={p.seoDescription ?? ""}
              maxLength={160}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <BoutonEnvoi>Enregistrer</BoutonEnvoi>
          {etat.succes && <span className="text-[13px] text-[var(--success)]">{etat.succes}</span>}
          {etat.erreur && <span className="text-[13px] text-[var(--destructive)]">{etat.erreur}</span>}
        </div>
      </form>

      {/* ------------------------------------------------- Colonne de contrôle */}
      <aside className="space-y-4">
        {/* Ce qui reste à fournir : le vrai travail de l'article */}
        <div
          className={`border p-3.5 ${
            trous.length > 0
              ? "border-[var(--warning)] bg-[var(--warning-soft)]"
              : "border-[var(--filet)] bg-[var(--ivoire)]"
          }`}
        >
          <p className="libelle-champ">
            {trous.length > 0 ? "Faits à fournir" : "Rien ne manque"}
          </p>
          {trous.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
              Aucun passage n&apos;attend plus de fait daté. L&apos;article peut paraître.
            </p>
          ) : (
            <>
              <ul className="mt-2 space-y-2">
                {trous.map((t, i) => (
                  <li
                    key={i}
                    className="text-[12.5px] leading-snug text-[var(--warning-soft-foreground)]"
                  >
                    {t || "(passage à compléter)"}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11.5px] leading-snug text-[var(--warning-soft-foreground)]">
                Remplacez chaque passage par le fait vérifié, source à l&apos;appui.
                Tant qu&apos;il en reste un, la parution est refusée — le journal
                n&apos;affirme rien qu&apos;on n&apos;ait vérifié.
              </p>
            </>
          )}
        </div>

        {/* Parution */}
        {!paru ? (
          <form action={actionParution} className="space-y-2">
            <BoutonEnvoi className="w-full justify-center" disabled={trous.length > 0}>
              Faire paraître
            </BoutonEnvoi>
            {etatParution.erreur && (
              <p className="text-[12.5px] leading-snug text-[var(--destructive)]">
                {etatParution.erreur}
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-2">
            {p.slug && (
              <Link href={`/journal/${p.slug}`} className="btn-or w-full justify-center">
                Voir dans le journal
              </Link>
            )}
            <form action={actionRetrait}>
              <BoutonEnvoi variant="outline" className="w-full justify-center">
                Retirer du journal
              </BoutonEnvoi>
            </form>
            {etatRetrait.succes && (
              <p className="text-[12.5px] text-[var(--success)]">{etatRetrait.succes}</p>
            )}
          </div>
        )}

        {/* Sources : d'où vient la règle */}
        {p.sources.length > 0 && (
          <div className="border border-[var(--filet)] bg-[var(--ivoire)] p-3.5">
            <p className="libelle-champ">Appuyé sur</p>
            <ul className="mt-1.5 space-y-1">
              {p.sources.map((s) => (
                <li key={s} className="text-[12px] text-[var(--texte-secondaire)]">
                  {s.replace(/^wiki\//, "").replace(/\.md$/, "")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Écarter */}
        {!paru && (
          <details className="border border-[var(--filet)] bg-[var(--ivoire)] p-3.5">
            <summary className="libelle-champ cursor-pointer">Écarter ce sujet</summary>
            <form action={actionRefus} className="mt-2.5 space-y-2">
              <Input name="motif" placeholder="Pourquoi ?" aria-label="Motif du refus" />
              <BoutonEnvoi variant="outline" size="sm" className="w-full justify-center">
                Écarter
              </BoutonEnvoi>
              {etatRefus.erreur && (
                <p className="text-[12px] text-[var(--destructive)]">{etatRefus.erreur}</p>
              )}
            </form>
          </details>
        )}
      </aside>
    </div>
  );
}
