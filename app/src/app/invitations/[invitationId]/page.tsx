import { AideInvitation } from "@/components/aide-invitation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estUuid } from "@/lib/identifiants";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card, CardContent } from "@/components/ui/card";
import { LIBELLES_INVITATION } from "@/lib/invitations-locataire";
import { ReponseInvitation } from "./reponse";
export const metadata = { title: "Invitation locataire - Gerimmo" };
export default async function PageInvitation({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!estUuid(invitationId)) return <CoquilleAuth promesse="Votre location, dans un espace à vous." sousPromesse="Vos documents et vos échanges avec le bailleur." mention="Invitation personnelle" titre="Ce lien n’est pas valable"><Card><CardContent className="space-y-4 pt-6"><p>Ouvrez le lien complet reçu par e-mail.</p><AideInvitation connecte={!!user}/></CardContent></Card></CoquilleAuth>;
  if (!user) redirect(`/connexion?suite=${encodeURIComponent(`/invitations/${invitationId}`)}`);
  const { data, error } = await db.rpc("mes_invitations_locataire", { p_id: invitationId });
  const invitation = data?.[0];
  return <CoquilleAuth promesse="Votre location, dans un espace à vous." sousPromesse="Retrouvez vos documents, vos loyers et le suivi de vos demandes." mention="Invitation personnelle" titre="Votre invitation locataire" chapo={invitation ? `Proposée par ${invitation.organisation}` : "Connectez-vous avec l’adresse qui a reçu cette invitation."}>
    <Card><CardContent className="space-y-4 pt-6">
      <p className="break-all text-sm text-muted-foreground">Connecté avec {user.email}</p>
      {error ? <p role="alert">L’invitation n’a pas pu être chargée. Réessayez dans un instant.</p> : !invitation ? <><p>Cette invitation n’est pas accessible avec ce compte. Utilisez l’adresse qui l’a reçue.</p><AideInvitation connecte={!!user}/></> : <>
        <p className="font-semibold">{LIBELLES_INVITATION[invitation.etat] ?? invitation.etat}</p>
        {invitation.etat === "en_attente" ? <><p className="text-sm">Valable jusqu’au {new Date(invitation.expire_le).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"})}.</p><p>Acceptez pour retrouver votre logement, vos documents et vos échanges avec le bailleur.</p><ReponseInvitation id={invitationId}/></> : invitation.etat === "acceptee" ? <Link className="lien-discret" href={`/locataire/${invitation.organization_id}`}>Ouvrir mon espace locataire</Link> : <><p className="text-sm text-muted-foreground">Ce lien ne peut plus être utilisé. Votre bailleur peut vous envoyer une nouvelle invitation.</p><AideInvitation connecte={!!user}/></>}
      </>}
      <Link href="/espaces" className="lien-discret block text-sm">Retour à mes espaces</Link>
    </CardContent></Card>
  </CoquilleAuth>;
}
