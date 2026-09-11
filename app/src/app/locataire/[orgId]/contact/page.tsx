import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { CarteUrgence, type Gestionnaire } from "../cartes-laterales";
import { aEchoue, PanneLecture } from "../panne-lecture";
import { FilMessages, type MessageFil } from "./fil-messages";

export const metadata = { title: "Mon gestionnaire — Gerimmo" };

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
      <h1>Mon gestionnaire</h1>

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
              <p className="mt-1 text-[13px] text-muted-foreground">
                {libelleBailleur}
                {g.agent_email ? ` · interlocuteur : ${g.agent_email}` : ""}
              </p>
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
              <p className="mt-3 text-xs text-muted-foreground">
                Pour un problème dans le logement, préférez « Signaler un
                problème » : votre demande est suivie étape par étape.
              </p>
            </div>
          )}
          <CarteUrgence />
        </div>
      </div>
    </div>
  );
}
