"use client";
import { useId, useState } from "react";
import Link from "next/link";

/** Préparer une réponse à l'expéditeur, sans révéler d'adresse ni envoyer de courriel.
 *  `marque` : le nom de la plateforme dans le message type et le lien d'assistance. L'écran qui reçoit l'invité d'un
 *  bailleur ou d'une agence (signature du garant, invitation du locataire) passe `null` : l'invité d'une agence en
 *  marque blanche ne doit jamais lire « Gerimmo », et un lien clos ne dit rien de l'expéditeur. */
export function AideInvitation({ suivi = false, connecte = false, marque = "Gerimmo" }: { suivi?: boolean; connecte?: boolean; marque?: string | null }) {
  const id = useId();
  const [retour, setRetour] = useState("");
  const nom = marque ? ` ${marque}` : "";
  const message = suivi
    ? `Bonjour, j’ai ouvert votre lien${nom}. Pouvez-vous m’indiquer la prochaine étape de mon dossier ? Merci.`
    : `Bonjour, je ne parviens plus à ouvrir votre invitation${nom}. Pouvez-vous m’envoyer un nouveau lien à cette adresse ? Merci.`;
  return <div className="space-y-3 rounded-[var(--rayon-carte)] border border-[var(--filet)] bg-[var(--creme)] p-4">
    <p className="font-medium">{suivi ? "Besoin de connaître la suite ?" : "Demander un nouveau lien"}</p>
    <p className="text-sm text-muted-foreground">Répondez à l’e-mail de la personne qui vous a invité. Vous pouvez reprendre ce message :</p>
    <label htmlFor={id} className="sr-only">Message à l’expéditeur</label>
    <textarea id={id} readOnly value={message} rows={4} className="w-full rounded-[var(--rayon-champ)] border border-[var(--filet-champ)] bg-[var(--carte)] p-3 text-sm" onFocus={e=>e.target.select()} />
    <button type="button" className="btn-secondaire w-full" onClick={async()=>{
      try { await navigator.clipboard.writeText(message); setRetour("Message copié. Collez-le dans votre réponse à l’expéditeur. Aucun message n’a été envoyé."); }
      catch { setRetour("Sélectionnez le message ci-dessus et copiez-le dans votre réponse à l’expéditeur."); }
    }}>Copier mon message</button>
    {retour && <p role="status" className="text-sm">{retour}</p>}
    <Link href={connecte ? "/assistance?type=probleme#nouvelle" : "/#contact"} className="lien-discret inline-flex min-h-11 items-center text-sm">{`Contacter l’assistance${nom}`}</Link>
  </div>;
}
