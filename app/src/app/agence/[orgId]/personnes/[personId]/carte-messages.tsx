"use client";

import { useActionState } from "react";
import { repondreMessagePersonne, type EtatMessage } from "@/app/actions/messages";
import { Button } from "@/components/ui/button";

export type MessagePersonne = {
  id: string;
  auteur: "locataire" | "gerant";
  texte: string;
  cree_le: string;
};

// Fil de messages avec le locataire, sur sa fiche (espace locataire v10).
// Ouvrir la fiche marque ses messages comme lus ; la réponse part dans son
// espace et s'affiche en badge non lu chez lui.
export function CarteMessages({
  orgId,
  personId,
  prenom,
  messages,
}: {
  orgId: string;
  personId: string;
  prenom: string | null;
  messages: MessagePersonne[];
}) {
  const [etat, action, enCours] = useActionState<EtatMessage, FormData>(
    repondreMessagePersonne.bind(null, orgId, personId),
    {}
  );
  const quand = (ts: string) =>
    new Date(ts).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });

  return (
    <div className="space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun échange pour l&apos;instant. Votre message s&apos;affichera dans son
          espace, avec un badge tant qu&apos;il ne l&apos;a pas lu.
        </p>
      ) : (
        <div className="space-y-2">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                m.auteur === "gerant"
                  ? "ml-auto rounded-br-sm bg-[var(--encre)] text-[var(--sur-encre)]"
                  : "rounded-bl-sm bg-[var(--ardoise)]"
              }`}
            >
              <p
                className={`mb-0.5 text-[11px] ${
                  m.auteur === "gerant" ? "text-[var(--sur-encre)]/60" : "text-muted-foreground"
                }`}
              >
                {m.auteur === "gerant" ? "Vous" : (prenom ?? "Locataire")} · {quand(m.cree_le)}
              </p>
              {m.texte}
            </div>
          ))}
        </div>
      )}
      <form action={action} className="flex flex-wrap items-end gap-2">
        <textarea
          name="texte"
          rows={2}
          maxLength={4000}
          placeholder={`Répondre${prenom ? ` à ${prenom}` : ""}…`}
          className="min-w-52 flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={enCours}>
          {enCours ? "Envoi…" : "Envoyer"}
        </Button>
        {etat.succes && (
          <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>
        )}
        {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      </form>
    </div>
  );
}
