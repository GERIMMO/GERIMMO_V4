import { lireIdentiteContact } from "../identite-contact";
import { AssistantPrive } from "@/components/assistant-prive";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import type { Metadata } from "next";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { Interlocuteur, type Gestionnaire } from "../cartes-laterales";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { FilMessages, type MessageFil } from "./fil-messages";

// Le layout ajoute « — <agence> » (24/09 : plus « — Gerimmo » dans un espace
// à la marque de l'agence). L'onglet porte le nom de l'écran, celui du menu et
// du titre — « Mon gestionnaire » ou « Mon bailleur » (20/11 : il disait
// « Contact », un troisième nom). Même lecture, mise en cache, que le layout.
export async function generateMetadata(
  props: Pick<PageProps<"/locataire/[orgId]/contact">, "params">
): Promise<Metadata> {
  const { orgId } = await props.params;
  return { title: (await lireIdentiteContact(orgId)).titre };
}

// « Mon gestionnaire » (maquette v10) : le fil de messages avec l'agence —
// conservé, lu/non lu — et ses coordonnées à côté. Ouvrir la page marque les
// réponses comme lues (le badge du menu s'éteint).
export default async function PageContactLocataire(
  props: PageProps<"/locataire/[orgId]/contact">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive, user } = await verifierAccesEspaceLocataire(orgId);

  const identiteContact = await lireIdentiteContact(orgId);
  const [
    { data: gestionnaires, error: eGestionnaire },
    { data: fil, error: eFil },
  ] = await Promise.all([
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    // Lire marque lu : les réponses du gérant cessent de compter au badge
    supabase.rpc("mes_messages_locataire", { p_org: orgId }),
  ]);
  const g = ((gestionnaires ?? []) as Gestionnaire[])[0];
  const messages = (fil ?? []) as MessageFil[];
  const libelleBailleur = identiteContact.agence ? "Votre agence de gestion" : "Votre bailleur";

  return (
    <div className="space-y-4">
      {/* L'en-tête standard de l'espace (24/09) : le titre était posé nu sur
          le fond, seule page avec « Nouveau signalement » à s'en passer. */}
      <div className="entete-page">
        <TitreEcran rubrique="messages">{identiteContact.titre}</TitreEcran>
        {/* La puce ne redit pas l'état vide (25/09, D26) : un chiffre, ou rien */}
        {!aEchoue(eFil) && messages.length > 0 && (
          <span className="mono-discret">
            {messages.length} message{messages.length > 1 ? "s" : ""} dans ce fil
          </span>
        )}
      </div>

      {aEchoue(eGestionnaire, eFil) && (
        <PanneLecture quoi="votre fil de messages" />
      )}

      <div className="loc-grille">
        <FilMessages
          orgId={orgId}
          messages={messages}
          agence={identiteContact.nom ?? (identiteContact.agence ? "votre gestionnaire" : "votre bailleur")}
          lectureSeule={!adhesionActive}
          lectureEnEchec={aEchoue(eFil)}
        />
        <div className="space-y-4">
          {g && (
            <div className="loc-carte">
              <h2 className="titre-carte text-base font-medium">{identiteContact.nom ?? "Identité à confirmer"}</h2>
              <p className="mt-1 text-[13px] text-muted-foreground">{libelleBailleur}</p>
              <div className="mt-2">
                <Interlocuteur gestionnaire={g} />
              </div>
              <div className="mt-2">
                {g.email_contact && (
                  <div className="ligne-info">
                    <span className="shrink-0 whitespace-nowrap">E-mail</span>
                    <a href={`mailto:${g.email_contact}`} className="lien-discret min-w-0 wrap-anywhere">
                      {g.email_contact}
                    </a>
                  </div>
                )}
                {g.telephone && (
                  <div className="ligne-info">
                    <span className="shrink-0 whitespace-nowrap">Téléphone</span>
                    <a
                      href={`tel:${g.telephone.replace(/\s/g, "")}`}
                      className="lien-discret min-w-0 wrap-anywhere"
                    >
                      {g.telephone}
                    </a>
                  </div>
                )}
              </div>
              {/* Le nom de l'action devient l'action (24/09) : le locataire
                  devait deviner où la trouver. Bail terminé, le formulaire
                  est fermé : la phrase n'a plus lieu d'être. */}
              {adhesionActive && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Pour un problème dans le logement, préférez{" "}
                  <Link href={`/locataire/${orgId}/incident`} className="lien-discret">
                    Signaler un problème
                  </Link>{" "}
                  : votre demande est suivie étape par étape.
                </p>
              )}
            </div>
          )}

        </div>
      </div>
      <AssistantPrive key={`${orgId}:${user.id}`} orgId={orgId} compteId={user.id} lectureSeule={!adhesionActive} />
    </div>
  );
}
