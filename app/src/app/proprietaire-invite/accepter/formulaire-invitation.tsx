"use client";
import Link from "next/link";
import { useActionState } from "react";
import { accepterInvitationProprietaire, creerCompteProprietaireInvite, type EtatInvitationProprietaire } from "@/app/actions/proprietaires-invites";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function AccepterInvitation({jeton}:{jeton:string}) {
 const [etat,action]=useActionState<EtatInvitationProprietaire,FormData>(accepterInvitationProprietaire.bind(null,jeton),{});
 return <form action={action} className="space-y-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmation" required className="mt-1 size-5 shrink-0"/><span>Ouvrir mon accès en consultation aux biens et comptes rendus que mon agence me confie. Aucun abonnement personnel.</span></label><BoutonEnvoi>Accepter l’invitation</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}</form>;
}
export function CreerCompteInvite({jeton}:{jeton:string}) {
 const [etat,action]=useActionState<EtatInvitationProprietaire,FormData>(creerCompteProprietaireInvite.bind(null,jeton),{});
 const champ="mt-1 w-full rounded-lg border border-input bg-background p-3 text-sm";
 return <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-semibold">Je n’ai pas encore de compte</summary><form action={action} className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">Créez seulement votre compte, sans espace de gestion payant. Une confirmation d’adresse pourra vous être envoyée à votre demande.</p><label className="block text-sm">Nom<input className={champ} name="nom" required autoComplete="family-name"/></label><label className="block text-sm">Adresse e-mail invitée<input className={champ} name="email" required type="email" autoComplete="email"/></label><label className="block text-sm">Mot de passe<input className={champ} name="mot_de_passe" required type="password" minLength={12} autoComplete="new-password"/></label><label className="block text-sm">Confirmer le mot de passe<input className={champ} name="confirmation_mot_de_passe" required type="password" minLength={12} autoComplete="new-password"/></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" name="cgu" required className="mt-1 size-5 shrink-0"/><span>J’accepte les <Link href="/conditions" target="_blank" rel="noopener" className="underline">conditions d’utilisation</Link>.</span></label><BoutonEnvoi>Créer mon compte invité</BoutonEnvoi>{etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm">{etat.succes}</p>}</form></details>;
}
