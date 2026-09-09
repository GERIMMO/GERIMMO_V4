"use client";

import { useActionState, useRef } from "react";
import { envoyerMessageLocataire, type EtatMessage } from "@/app/actions/messages";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export type MessageFil = {
  id: string;
  auteur: "locataire" | "gerant";
  texte: string;
  cree_le: string;
};

const SUGGESTIONS = [
  "Pouvez-vous me détailler ma provision de charges ?",
  "Je vous envoie mon attestation d'assurance cette semaine.",
  "J'aurai quelques jours de retard sur le loyer de ce mois — je vous tiens au courant.",
];

// Fil de messages avec le gestionnaire (maquette v10) : bulles, suggestions
// qui pré-remplissent, envoi qui recharge le fil.
export function FilMessages({
  orgId,
  messages,
  agence,
  lectureSeule = false,
}: {
  orgId: string;
  messages: MessageFil[];
  agence: string;
  // Bail terminé : l'historique reste lisible, l'envoi est fermé
  lectureSeule?: boolean;
}) {
  const [etat, action] = useActionState<EtatMessage, FormData>(
    envoyerMessageLocataire.bind(null, orgId),
    {}
  );
  const champ = useRef<HTMLTextAreaElement>(null);

  const quand = (ts: string) =>
    new Date(ts).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });

  return (
    <div className="loc-carte">
      <h3 className="text-base font-medium">Écrire à {agence}</h3>
      {messages.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Posez votre question ici : elle arrive directement chez votre
          gestionnaire, et sa réponse restera conservée dans ce fil.
        </p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.auteur === "locataire"
                  ? "ml-auto rounded-br-sm bg-[var(--encre)] text-[var(--sur-encre)]"
                  : "rounded-bl-sm bg-[var(--ardoise)]"
              }`}
            >
              <p
                className={`mb-0.5 text-[11px] ${
                  m.auteur === "locataire"
                    ? "text-[var(--sur-encre)]/60"
                    : "text-muted-foreground"
                }`}
              >
                {m.auteur === "locataire" ? "Vous" : agence} · {quand(m.cree_le)}
              </p>
              {m.texte}
            </div>
          ))}
        </div>
      )}

      {lectureSeule ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Votre bail est terminé : le fil reste consultable, mais l&apos;envoi de
          nouveaux messages est fermé. Besoin de joindre votre ancien
          gestionnaire ? Ses coordonnées sont à droite.
        </p>
      ) : (
      <>
      <div className="mt-4 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="rounded-full border border-border bg-[var(--creme)] px-3 py-1.5 text-xs text-[var(--encre)] hover:bg-[var(--ardoise)]"
            onClick={() => {
              if (champ.current) {
                champ.current.value = s;
                champ.current.focus();
              }
            }}
          >
            {s.length > 44 ? `${s.slice(0, 42).replace(/\s+\S*$/, "")}…` : s}
          </button>
        ))}
      </div>

      <form action={action} className="mt-3">
        <label htmlFor="msg-texte" className="text-xs text-muted-foreground">
          Votre message
        </label>
        {/* Non contrôlé, re-monté à chaque nouveau message : le champ se vide
            quand l'envoi aboutit, sans état React. En erreur, la saisie est
            reposée via etat.valeurs (audit vie du bail 09/09). */}
        <textarea
          id="msg-texte"
          name="texte"
          ref={champ}
          key={messages.length}
          defaultValue={etat.valeurs?.texte}
          rows={3}
          maxLength={4000}
          className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
          placeholder="Écrire à votre gestionnaire…"
        />
        <div className="mt-2 flex items-center gap-3">
          <BoutonEnvoi enCoursTexte="Envoi…" size="sm">
            Envoyer le message
          </BoutonEnvoi>
          {etat.succes && (
            <span className="text-sm text-success-soft-foreground">{etat.succes}</span>
          )}
          {etat.erreur && <span className="text-sm text-destructive">{etat.erreur}</span>}
        </div>
        <p className="mt-2.5 text-xs text-muted-foreground">
          Tout le fil est conservé ici — vous retrouverez toujours ce qui a été
          dit.
        </p>
      </form>
      </>
      )}
    </div>
  );
}
