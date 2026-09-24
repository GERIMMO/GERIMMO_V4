"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ExternalLink } from "lucide-react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  enregistrerPublication,
  publierPublication,
  refuserPublication,
  retirerPublication,
  publierPublicationFacebook,
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
  facebookTexte: string | null;
  facebookImageUrl: string | null;
  facebookPostId: string | null;
  facebookPublieLe: string | null;
  facebookErreur: string | null;
};

const MARQUE = /\[\[à compléter\s*:?\s*([^\]]*)\]\]/g;

function listerTrous(corps: string): string[] {
  return [...corps.matchAll(MARQUE)].map((m) => m[1].trim());
}

const ID_FORMULAIRE = "formulaire-article";
// Un bouton désactivé doit en avoir l'air : les classes communes ne le
// disent pas encore (proposition de règle partagée, 24/09).
const DESACTIVE = "disabled:pointer-events-none disabled:opacity-50";

// Les boutons communs de la console (24/09) : `.btn-or` pour l'action
// principale, `.btn-secondaire` pour les autres. Deux habillages différents
// côte à côte (« Voir dans le journal » en .btn-or 13 px, « Enregistrer » en
// bouton plat de 32 px) faisaient deux styles pour des gestes voisins.
function Soumettre({
  classe,
  disabled,
  children,
}: {
  classe: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`${classe} w-full justify-center ${DESACTIVE}`} disabled={pending || disabled}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

export function EditeurPublication(p: Props) {
  const [corps, setCorps] = useState(p.corps ?? "");
  const [chapo, setChapo] = useState(p.chapo ?? "");
  const [modificationsNonEnregistrees, setModificationsNonEnregistrees] = useState(false);
  const [etat, action, enregistrement] = useActionState<EtatPublication, FormData>(
    async (e, fd) => {
      const resultat = await enregistrerPublication(p.id, e, fd);
      if (resultat.succes) setModificationsNonEnregistrees(false);
      return resultat;
    },
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
  const [etatFacebook, actionFacebook] = useActionState<EtatPublication, FormData>(
    async () => publierPublicationFacebook(p.id),
    {}
  );

  const trous = listerTrous(`${corps} ${chapo}`);
  const controles = [
    ...(corps.trim().length < 200 ? ["Le corps doit contenir au moins 200 caractères."] : []),
    ...(!chapo.trim() ? ["Ajoutez un chapô : c’est le résumé visible dans le journal."] : []),
    ...(modificationsNonEnregistrees ? ["Enregistrez vos modifications avant la parution."] : []),
  ];
  const pret = trous.length === 0 && controles.length === 0;
  const paru = p.statut === "publiee";

  // Quitter l'éditeur avec des modifications non enregistrées demande
  // confirmation (24/09) : elles étaient perdues sans avertissement.
  useEffect(() => {
    if (!modificationsNonEnregistrees) return;
    const retenir = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [modificationsNonEnregistrees]);

  // Le bouton d'enregistrement vit dans la colonne d'actions, qui reste
  // visible au défilement sur bureau (24/09) : il fallait descendre tout le
  // formulaire pour l'atteindre. Sur téléphone, les actions passent en tête
  // et le bouton reste aussi au pied du formulaire, là où l'on finit d'écrire.
  const libelleEnregistrer = paru ? "Enregistrer comme brouillon" : "Enregistrer";
  const boutonEnregistrer = (
    <button
      type="submit"
      form={ID_FORMULAIRE}
      className={`${paru ? "btn-or" : "btn-secondaire"} w-full justify-center ${DESACTIVE}`}
      disabled={enregistrement}
    >
      {enregistrement && <Spinner />}
      {enregistrement ? "Enregistrement…" : libelleEnregistrer}
    </button>
  );
  const retourEnregistrement = (
    <>
      {paru && <p className="text-[12.5px] leading-snug text-[var(--texte-secondaire)]">L’enregistrement retire l’article du journal. Vous pourrez le faire paraître à nouveau après relecture.</p>}
      {etat.succes && !paru && <p role="status" className="text-[12.5px] text-[var(--success)]">{etat.succes}</p>}
      {etat.erreur && <p role="alert" className="text-[12.5px] text-[var(--destructive)]">{etat.erreur}</p>}
    </>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px] lg:items-start">
      {/* ------------------------------------------------ Colonne d'écriture */}
      <form
        id={ID_FORMULAIRE}
        action={action}
        onChange={() => setModificationsNonEnregistrees(true)}
        onReset={(event) => event.preventDefault()}
        className="space-y-4"
      >
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
            value={chapo}
            onChange={(event) => setChapo(event.target.value)}
            className="w-full rounded-[10px] border border-[var(--filet)] bg-[var(--ivoire)] p-2.5 text-base leading-relaxed sm:text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="corps" className="libelle-champ">Corps de l&apos;article (markdown)</Label>
          {/* La hauteur suit le texte (24/09) : 26 lignes fixes laissaient
              580 px de blanc sous cinq lignes écrites. */}
          <textarea
            id="corps"
            name="corps"
            value={corps}
            onChange={(e) => setCorps(e.target.value)}
            className="min-h-56 w-full rounded-[10px] border border-[var(--filet)] bg-[var(--ivoire)] p-3 font-mono text-base leading-relaxed [field-sizing:content] sm:text-[13px]"
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

        <section className="space-y-4 rounded-xl border border-[var(--filet)] bg-[var(--filet-leger)] p-4 shadow-[var(--ombre-portee)]">
          <div>
            <p className="libelle-champ">Diffusion Facebook</p>
            <p className="mt-1 text-[12px] text-[var(--texte-secondaire)]">Gerimmo ajoute automatiquement le lien de l’article. Le jeton Meta reste uniquement côté serveur.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facebook_texte" className="libelle-champ">Texte de la publication</Label>
            <textarea id="facebook_texte" name="facebook_texte" rows={5} defaultValue={p.facebookTexte ?? ""}
              placeholder="Texte préparé au nom de Gerimmo"
              className="w-full rounded-[10px] border border-[var(--filet)] bg-[var(--ivoire)] p-3 text-base leading-relaxed sm:text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facebook_image_url" className="libelle-champ">Visuel public (HTTPS)</Label>
            <Input id="facebook_image_url" name="facebook_image_url" type="url" defaultValue={p.facebookImageUrl ?? ""}
              placeholder="https://www.gerimmo.app/marketing/visuel.png" />
          </div>
        </section>

        <div className="space-y-2 sm:max-w-xs lg:hidden">
          {boutonEnregistrer}
          {retourEnregistrement}
        </div>
      </form>

      {/* ------------------------------------------------- Colonne de contrôle */}
      {/* Sous `lg`, l'état et les actions passent en tête (24/09) : il
          fallait défiler 1 600 px pour savoir que l'article était paru. Sur
          bureau, la colonne reste collée sous le bandeau. */}
      <aside className="order-first space-y-4 lg:sticky lg:top-24 lg:order-none lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        {/* Ce qui reste à fournir : le vrai travail de l'article */}
        <div
          className={`rounded-xl border p-3.5 shadow-[var(--ombre-portee)] ${
            !pret
              ? "border-[var(--warning)] bg-[var(--warning-soft)]"
              : "border-[var(--filet)] bg-[var(--ivoire)]"
          }`}
        >
          <p className="libelle-champ">
            {paru ? "Article en ligne" : trous.length > 0 ? "Faits à fournir" : pret ? "Prêt à paraître" : "Avant la parution"}
          </p>
          {trous.length === 0 ? (
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--texte-secondaire)]">
              {paru ? "La version enregistrée est visible dans le journal." : pret ? "Aucun passage à compléter ne subsiste. Le texte enregistré peut paraître après votre relecture." : "Complétez les contrôles ci-dessous avant de faire paraître l’article."}
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
          {controles.length > 0 && (
            <ul className="mt-2 space-y-2 text-[13px] text-[var(--warning-soft-foreground)]">
              {controles.map((controle) => <li key={controle}>{controle}</li>)}
            </ul>
          )}
        </div>

        {/* Parution */}
        <div className="hidden space-y-2 lg:block">
          {boutonEnregistrer}
          {retourEnregistrement}
        </div>
        {!paru ? (
          <form action={actionParution} className="space-y-2">
            <Soumettre classe="btn-or" disabled={!pret}>
              Faire paraître
            </Soumettre>
            {etatParution.erreur && (
              <p className="text-[12.5px] leading-snug text-[var(--destructive)]">
                {etatParution.erreur}
              </p>
            )}
          </form>
        ) : (
          <div className="space-y-2">
            {/* Le journal public s'ouvre dans un nouvel onglet (24/09) :
                l'éditeur reste ouvert, et la saisie en cours avec lui. */}
            {p.slug && (
              <a
                href={`/journal/${p.slug}`}
                target="_blank"
                rel="noopener"
                className="btn-secondaire w-full justify-center"
              >
                Voir dans le journal <ExternalLink className="size-4" aria-hidden />
                <span className="sr-only">(nouvel onglet)</span>
              </a>
            )}
            <form action={actionRetrait}>
              <Soumettre classe="btn-secondaire">Retirer du journal</Soumettre>
            </form>
            {etatRetrait.succes && (
              <p className="text-[12.5px] text-[var(--success)]">{etatRetrait.succes}</p>
            )}
          </div>
        )}

        {!paru && etatRetrait.succes && (
          <p role="status" className="text-[12.5px] text-[var(--success)]">{etatRetrait.succes}</p>
        )}

        {paru && (
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-3.5 shadow-[var(--ombre-portee)]">
            <p className="libelle-champ">Facebook</p>
            {p.facebookPostId ? (
              <p className="mt-1.5 text-[13px] text-[var(--success)]">Publié par Gerimmo{p.facebookPublieLe ? ` le ${new Date(p.facebookPublieLe).toLocaleDateString("fr-FR")}` : ""}.</p>
            ) : (
              <form action={actionFacebook} className="mt-2 space-y-2">
                <Soumettre classe="btn-secondaire">Publier sur Facebook</Soumettre>
                <p className="text-[11.5px] text-[var(--texte-secondaire)]">Enregistrez d’abord le texte et le visuel si vous les modifiez.</p>
              </form>
            )}
            {(etatFacebook.succes || etatFacebook.erreur || p.facebookErreur) && (
              <p role={etatFacebook.erreur || p.facebookErreur ? "alert" : "status"}
                className={`mt-2 text-[12px] ${etatFacebook.erreur || p.facebookErreur ? "text-[var(--destructive)]" : "text-[var(--success)]"}`}>
                {etatFacebook.succes || etatFacebook.erreur || p.facebookErreur}
              </p>
            )}
          </div>
        )}
        {etatRetrait.erreur && (
          <p role="alert" className="text-[12.5px] text-[var(--destructive)]">{etatRetrait.erreur}</p>
        )}

        {/* Sources : d'où vient la règle */}
        {p.sources.length > 0 && (
          <div className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-3.5">
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
          <details className="rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-3.5">
            <summary className="libelle-champ cursor-pointer">Écarter ce sujet</summary>
            <form action={actionRefus} className="mt-2.5 space-y-2">
              <Input name="motif" placeholder="Pourquoi ?" aria-label="Motif du refus" required />
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
