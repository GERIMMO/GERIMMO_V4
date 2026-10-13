import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigerUuids } from "@/lib/identifiants";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card, CardContent } from "@/components/ui/card";
import { LIBELLES_INVITATION } from "@/lib/invitations-locataire";
import { ReponseInvitation } from "./reponse";
export const metadata = { title: "Invitation locataire - Gerimmo" };
export default async function PageInvitation({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params; exigerUuids(invitationId);
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect(`/connexion?suite=${encodeURIComponent(`/invitations/${invitationId}`)}`);
  const { data, error } = await db.rpc("mes_invitations_locataire", { p_id: invitationId });
  const invitation = data?.[0];
  return <CoquilleAuth promesse="Votre location, dans un espace à vous." sousPromesse="Retrouvez vos documents, vos loyers et le suivi de vos demandes." mention="Invitation personnelle" titre="Votre invitation locataire" chapo={invitation ? `Proposée par ${invitation.organisation}` : "Cette invitation est réservée à l’adresse qui l’a reçue."}>
    <Card><CardContent className="space-y-4 pt-6">
      <p className="break-all text-sm text-muted-foreground">Connecté avec {user.email}</p>
      {error ? <p role="alert">L’invitation n’a pas pu être chargée. Réessayez dans un instant.</p> : !invitation ? <p>Invitation introuvable pour ce compte. Reconnectez-vous avec l’adresse qui l’a reçue, ou demandez une nouvelle invitation à votre gestionnaire.</p> : <>
        <p className="font-semibold">{LIBELLES_INVITATION[invitation.etat] ?? invitation.etat}</p>
        {invitation.etat === "en_attente" ? <><p className="text-sm">Valable jusqu’au {new Date(invitation.expire_le).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"})}.</p><ReponseInvitation id={invitationId}/></> : invitation.etat === "acceptee" ? <Link className="lien-discret" href={`/locataire/${invitation.organization_id}`}>Ouvrir mon espace locataire</Link> : <p className="text-sm text-muted-foreground">Cette invitation ne peut plus être acceptée. Votre gestionnaire peut vous en envoyer une nouvelle.</p>}
      </>}
      <Link href="/espaces" className="lien-discret block text-sm">Retour à mes espaces</Link>
    </CardContent></Card>
  </CoquilleAuth>;
}
