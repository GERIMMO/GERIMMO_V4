import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CoquilleAuth } from "@/components/coquille-auth";
import { AccepterInvitation, CreerCompteInvite } from "./formulaire-invitation";

export const metadata={title:"Votre invitation propriétaire — Gerimmo",referrer:"no-referrer" as const};
export default async function PageInvitation(props:{searchParams:Promise<{invitation?:string}>}) {
 const {invitation}=await props.searchParams;
 const valide=typeof invitation==='string'&&/^[0-9a-f]{64}$/.test(invitation);
 const db=await createClient();const {data:{user}}=await db.auth.getUser();
 const suite=`/proprietaire-invite/accepter?invitation=${encodeURIComponent(invitation??'')}`;
 return <CoquilleAuth titre="Votre accès propriétaire" promesse="Vos biens confiés, en toute clarté." sousPromesse="Consultez les logements gérés par votre agence et vos comptes rendus mensuels. Un accès distinct de votre gestion personnelle." mention="Inclus dans l’abonnement de votre agence" chapo="Le lien s’ouvre uniquement avec l’adresse e-mail vérifiée du destinataire. Aucun abonnement personnel ni carte bancaire.">
  {!valide?<p role="alert" className="err">Ce lien est incomplet. Demandez un nouveau lien à votre agence.</p>:user?<div className="space-y-4"><p className="text-sm text-muted-foreground">Compte connecté : {user.email}</p><AccepterInvitation jeton={invitation!}/><Link href="/compte" className="lien-discret">Gérer mon compte ou me déconnecter</Link></div>:<div className="space-y-4"><Link className="btn-or inline-flex" href={`/connexion?suite=${encodeURIComponent(suite)}`}>Me connecter avec l’adresse invitée</Link><CreerCompteInvite jeton={invitation!}/></div>}
 </CoquilleAuth>;
}
