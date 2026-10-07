"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { deciderPostProgramme, type EtatCampagne } from "./actions";

// LA FENÊTRE DE VETO (06/10/2026). Le post du lendemain, préparé la veille à
// 18 h, attend ici jusqu'à son heure : publier maintenant, modifier, reporter
// (motif) ou refuser (motif). Sans geste, il part à l'heure dite, sauf si la
// validation est obligatoire. Les quatre gestes passent par la fonction SQL
// `decider_publication_marketing`, journalisée.

export type PostProgramme = {
  id: string;
  titre: string;
  chapo: string | null;
  facebook_texte: string | null;
  facebook_image_url: string | null;
  programmee_pour: string;
  valide_le: string | null;
  veille_source_id: string | null;
  slug: string | null;
};

const champ = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Geste({ post, action, libelle, classe, motifRequis, enCours, dejaValide }: { post: PostProgramme; action: "valider" | "publier_maintenant" | "reporter" | "refuser"; libelle: string; classe: string; motifRequis?: boolean; enCours: string; dejaValide?: boolean }) {
  const [etat, soumettre, attente] = useActionState(deciderPostProgramme, {} as EtatCampagne);
  const [ouvert, setOuvert] = useState(false);
  if (motifRequis && !ouvert) {
    return <button type="button" className={classe} onClick={() => setOuvert(true)}>{libelle}</button>;
  }
  return (
    <form action={soumettre} className={motifRequis ? "flex w-full flex-wrap items-end gap-2" : "inline"}>
      <input type="hidden" name="id" value={post.id} />
      <input type="hidden" name="action" value={action} />
      {motifRequis && (
        <label className="grid min-w-[16rem] flex-1 gap-1">
          <span className="libelle-champ">Motif ({action === "reporter" ? "report" : "refus"})</span>
          <input name="motif" required minLength={3} maxLength={1000} className={champ} placeholder="Dites pourquoi : le motif reste dans le journal." />
        </label>
      )}
      <button type="submit" className={classe} disabled={attente || dejaValide}>{attente ? enCours : libelle}</button>
      {motifRequis && <button type="button" className="btn-secondaire" onClick={() => setOuvert(false)}>Annuler</button>}
      {etat.erreur && <p role="alert" className="err w-full">{etat.erreur}</p>}
      {etat.succes && <p className="ok w-full">{etat.succes}</p>}
    </form>
  );
}

export function VetoPost({ post, validationObligatoire, quand }: { post: PostProgramme; validationObligatoire: boolean; quand: string }) {
  const texte = post.facebook_texte?.trim() || `${post.titre}\n\n${post.chapo ?? ""}`;
  return (
    <article className="loc-carte border-l-4 border-l-[var(--warning)]">
      <div className="grid gap-5 md:grid-cols-[minmax(0,18rem)_1fr]">
        <div className="min-w-0">
          {post.facebook_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- aperçu d'un visuel public déjà hébergé, pas d'optimisation attendue
            <img src={post.facebook_image_url} alt={post.titre} className="aspect-[3/2] w-full rounded-xl object-cover" loading="lazy" />
          ) : (
            <div className="grid aspect-[3/2] w-full place-items-center rounded-xl bg-[var(--creme)] text-sm text-[var(--texte-secondaire)]">Visuel à créer</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="libelle-champ">{post.veille_source_id ? "Post de veille" : "Post éditorial"} · parution {quand}</p>
          <h3 className="mt-1 font-heading text-lg text-[var(--encre)]">{post.titre}</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--corps)]">{texte}</p>
          <p className="mt-3 text-xs text-[var(--texte-secondaire)]">
            {post.valide_le
              ? "Validé : il partira à l’heure prévue."
              : validationObligatoire
                ? "Validation obligatoire : rien ne part sans « Valider » ou « Publier maintenant »."
                : "Sans geste de votre part, il part automatiquement à l’heure prévue. Un report ou un refus l’empêche définitivement."}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Geste post={post} action="publier_maintenant" libelle="Publier maintenant" classe="btn-or" enCours="Publication…" />
            {validationObligatoire && !post.valide_le && <Geste post={post} action="valider" libelle="Valider pour l’heure prévue" classe="btn-secondaire" enCours="Validation…" />}
            <Link href={`/admin/publications/${post.id}`} className="btn-secondaire">Modifier</Link>
            <Geste post={post} action="reporter" libelle="Reporter" classe="btn-secondaire" motifRequis enCours="Report…" />
            <Geste post={post} action="refuser" libelle="Refuser" classe="btn-secondaire text-[var(--destructive)]" motifRequis enCours="Refus…" />
          </div>
        </div>
      </div>
    </article>
  );
}
