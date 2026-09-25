import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { Interlocuteur, type Gestionnaire } from "../cartes-laterales";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { ReflexesUrgence } from "../reflexes-urgence";
import { FilMessages, type MessageFil } from "./fil-messages";

// Le layout ajoute « — <agence> » (24/09 : plus « — Gerimmo » dans un espace
// à la marque de l'agence).
export const metadata = { title: "Mon gestionnaire" };

// « Mon gestionnaire » (maquette v10) : le fil de messages avec l'agence —
// conservé, lu/non lu — et ses coordonnées à côté. Ouvrir la page marque les
// réponses comme lues (le badge du menu s'éteint).
export default async function PageContactLocataire(
  props: PageProps<"/locataire/[orgId]/contact">
) {
  const { orgId } = await props.params;
  const { supabase, adhesionActive } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: gestionnaires, error: eGestionnaire },
    { data: fil, error: eFil },
    { data: org, error: eOrg },
  ] = await Promise.all([
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    // Lire marque lu : les réponses du gérant cessent de compter au badge
    supabase.rpc("mes_messages_locataire", { p_org: orgId }),
    // Le type de l'organisation ajuste le libellé du bailleur (audit 09/09) :
    // chez un propriétaire direct, il n'y a pas d'« agence de gestion »
    supabase.from("organizations").select("type").eq("id", orgId).maybeSingle(),
  ]);
  const g = ((gestionnaires ?? []) as Gestionnaire[])[0];
  const messages = (fil ?? []) as MessageFil[];
  // Faute d'avoir pu lire le type de l'organisation, on s'en tient au terme
  // générique plutôt que d'affirmer une « agence de gestion » qui n'existe
  // peut-être pas (lecture non consultée jusqu'ici).
  const libelleBailleur =
    eOrg || org?.type === "proprietaire_direct"
      ? "Votre gestionnaire"
      : "Votre agence de gestion";

  return (
    <div className="space-y-4">
      {/* L'en-tête standard de l'espace (24/09) : le titre était posé nu sur
          le fond, seule page avec « Nouveau signalement » à s'en passer. */}
      <div className="entete-page">
        <h1>Mon gestionnaire</h1>
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
          agence={g?.agence ?? "votre gestionnaire"}
          lectureSeule={!adhesionActive}
          lectureEnEchec={aEchoue(eFil)}
        />
        <div className="space-y-4">
          {g && (
            <div className="loc-carte">
              <h3 className="text-base font-medium">{g.agence}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">{libelleBailleur}</p>
              <div className="mt-2">
                <Interlocuteur gestionnaire={g} />
              </div>
              <div className="mt-2">
                {g.email_contact && (
                  <div className="ligne-info">
                    <span>E-mail</span>
                    <a href={`mailto:${g.email_contact}`} className="lien-discret">
                      {g.email_contact}
                    </a>
                  </div>
                )}
                {g.telephone && (
                  <div className="ligne-info">
                    <span>Téléphone</span>
                    <a
                      href={`tel:${g.telephone.replace(/\s/g, "")}`}
                      className="lien-discret"
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
          <ReflexesUrgence
            hrefSignalement={adhesionActive ? `/locataire/${orgId}/incident` : undefined}
          />
        </div>
      </div>
    </div>
  );
}
