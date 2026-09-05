import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { CarteUrgence, type Gestionnaire } from "../cartes-laterales";
import { FilMessages, type MessageFil } from "./fil-messages";

export const metadata = { title: "Mon gestionnaire — Gerimmo" };

// « Mon gestionnaire » (maquette v10) : le fil de messages avec l'agence —
// conservé, lu/non lu — et ses coordonnées à côté. Ouvrir la page marque les
// réponses comme lues (le badge du menu s'éteint).
export default async function PageContactLocataire(
  props: PageProps<"/locataire/[orgId]/contact">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);

  const [{ data: gestionnaires }, { data: fil }] = await Promise.all([
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
    // Lire marque lu : les réponses du gérant cessent de compter au badge
    supabase.rpc("mes_messages_locataire", { p_org: orgId }),
  ]);
  const g = ((gestionnaires ?? []) as Gestionnaire[])[0];
  const messages = (fil ?? []) as MessageFil[];

  return (
    <div className="space-y-4">
      <h1>Mon gestionnaire</h1>
      <div className="loc-grille">
        <FilMessages orgId={orgId} messages={messages} agence={g?.agence ?? "votre gestionnaire"} />
        <div className="space-y-4">
          {g && (
            <div className="loc-carte">
              <h3 className="text-base font-medium">{g.agence}</h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Votre agence de gestion
                {g.agent_email ? ` · interlocuteur : ${g.agent_email}` : ""}
              </p>
              <div className="mt-2">
                {g.email_contact && (
                  <div className="ligne-info">
                    <span>E-mail</span>
                    <a href={`mailto:${g.email_contact}`} className="lien-discret text-sm">
                      {g.email_contact}
                    </a>
                  </div>
                )}
                {g.telephone && (
                  <div className="ligne-info">
                    <span>Téléphone</span>
                    <a
                      href={`tel:${g.telephone.replace(/\s/g, "")}`}
                      className="lien-discret text-sm"
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
