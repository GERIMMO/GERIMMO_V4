"use client";
import { useId, useState } from "react";
import Link from "next/link";

/** Préparer une réponse à l'expéditeur, sans révéler d'adresse ni envoyer de courriel. */
export function AideInvitation({ suivi = false, connecte = false }: { suivi?: boolean; connecte?: boolean }) {
  const id = useId();
  const [retour, setRetour] = useState("");
  const message = suivi
    ? "Bonjour, j’ai ouvert votre lien Gerimmo. Pouvez-vous m’indiquer la prochaine étape de mon dossier ? Merci."
    : "Bonjour, je ne parviens plus à ouvrir votre invitation Gerimmo. Pouvez-vous m’envoyer un nouveau lien à cette adresse ? Merci.";
  return <div className="space-y-3 rounded-xl border border-border bg-background p-4">
    <p className="font-medium">{suivi ? "Besoin de connaître la suite ?" : "Demander un nouveau lien"}</p>
    <p className="text-sm text-muted-foreground">Répondez à l’e-mail de la personne qui vous a invité. Vous pouvez reprendre ce message :</p>
    <label htmlFor={id} className="sr-only">Message à l’expéditeur</label>
    <textarea id={id} readOnly value={message} rows={4} className="w-full rounded-lg border border-border bg-background p-3 text-sm" onFocus={e=>e.target.select()} />
    <button type="button" className="btn-secondaire w-full" onClick={async()=>{
      try { await navigator.clipboard.writeText(message); setRetour("Message copié. Collez-le dans votre réponse à l’expéditeur. Aucun message n’a été envoyé."); }
      catch { setRetour("Sélectionnez le message ci-dessus et copiez-le dans votre réponse à l’expéditeur."); }
    }}>Copier mon message</button>
    {retour && <p role="status" className="text-sm">{retour}</p>}
    <Link href={connecte ? "/assistance?type=probleme#nouvelle" : "/#contact"} className="lien-discret inline-flex min-h-11 items-center text-sm">Contacter l’assistance Gerimmo</Link>
  </div>;
}
