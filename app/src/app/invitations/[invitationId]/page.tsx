import { AideInvitation } from "@/components/aide-invitation";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estUuid } from "@/lib/identifiants";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card, CardContent } from "@/components/ui/card";
import { LIBELLES_INVITATION } from "@/lib/invitations-locataire";
import { ReponseInvitation } from "./reponse";
export const metadata = { title: "Invitation locataire — Gerimmo" };
// Présentation seule (Design System « Maison », 20/11) : l'état de l'invitation se lit dans une pastille de statut.
const PASTILLE_INVITATION: Record<string, string> = { en_attente: "puce puce-prep", acceptee: "puce puce-loue" };
export default async function PageInvitation({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!estUuid(invitationId)) return <CoquilleAuth promesse="Votre location, dans un espace à vous." sousPromesse="Vos documents et vos échanges avec le bailleur." mention="Invitation personnelle" titre="Ce lien n’est pas valable"><Card><CardContent className="space-y-4 pt-6"><p>Ouvrez le lien complet reçu par e-mail.</p><AideInvitation connecte={!!user} marque={null}/></CardContent></Card></CoquilleAuth>;
  if (!user) redirect(`/connexion?suite=${encodeURIComponent(`/invitations/${invitationId}`)}`);
  const { data, error } = await db.rpc("mes_invitations_locataire", { p_id: invitationId });
  const invitation = data?.[0];
  return <CoquilleAuth promesse="Votre location, dans un espace à vous." sousPromesse="Retrouvez vos documents, vos loyers et le suivi de vos demandes." mention="Invitation personnelle" titre="Votre invitation locataire" chapo={invitation ? `Proposée par ${invitation.organisation}` : "Connectez-vous avec l’adresse qui a reçu cette invitation."}>
    <Card><CardContent className="space-y-4 pt-6">
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">Connecté avec {user.email}</p>
      {error ? <p role="alert" className="err !mb-0">L’invitation n’a pas pu être chargée. Réessayez dans un instant.</p> : !invitation ? <><p>Cette invitation n’est pas accessible avec ce compte. Utilisez l’adresse qui l’a reçue.</p><AideInvitation connecte={!!user} marque={null}/></> : <>
        <p><span className={PASTILLE_INVITATION[invitation.etat] ?? "puce puce-grise"}>{LIBELLES_INVITATION[invitation.etat] ?? invitation.etat}</span></p>
        {invitation.etat === "en_attente" ? <><p className="text-sm">Valable jusqu’au {new Date(invitation.expire_le).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"})}.</p><p>Acceptez pour retrouver votre logement, vos documents et vos échanges avec le bailleur.</p><ReponseInvitation id={invitationId}/></> : invitation.etat === "acceptee" ? <Link className="btn-or" href={`/locataire/${invitation.organization_id}`}>Ouvrir mon espace locataire</Link> : <><p className="text-sm text-muted-foreground">Ce lien ne peut plus être utilisé. Votre bailleur peut vous envoyer une nouvelle invitation.</p><AideInvitation connecte={!!user} marque={null}/></>}
      </>}
      <Link href="/espaces" className="lien-discret flex min-h-11 items-center text-sm">← Mes espaces</Link>
    </CardContent></Card>
  </CoquilleAuth>;
}
