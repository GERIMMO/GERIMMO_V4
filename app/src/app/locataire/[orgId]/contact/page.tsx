import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { buttonVariants } from "@/components/ui/button";
import { CarteUrgence, type Gestionnaire } from "../cartes-laterales";

export const metadata = { title: "Mon gestionnaire — Gerimmo" };

// « Mon gestionnaire » (maquette v10) : qui s'occupe de mon logement et
// comment le joindre. La messagerie intégrée viendra plus tard — d'ici là,
// l'e-mail et le téléphone de l'agence, sans détour.
export default async function PageContactLocataire(
  props: PageProps<"/locataire/[orgId]/contact">
) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspaceLocataire(orgId);
  const { data } = await supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId });
  const g = ((data ?? []) as Gestionnaire[])[0];

  return (
    <div className="space-y-4">
      <h1>Mon gestionnaire</h1>
      {g ? (
        <div className="loc-grille">
          <div className="loc-carte">
            <div className="flex items-center gap-3.5">
              <span
                className="loc-avat"
                style={{
                  width: 52,
                  height: 52,
                  fontSize: 16,
                  background: "linear-gradient(135deg, var(--bleu), var(--encre))",
                  color: "var(--sur-encre)",
                }}
                aria-hidden
              >
                {g.agence
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((m) => m[0]?.toUpperCase() ?? "")
                  .join("") || "◇"}
              </span>
              <span>
                <b className="block font-heading text-lg text-[var(--encre)]">{g.agence}</b>
                <span className="text-[13px] text-muted-foreground">
                  Votre agence de gestion
                  {g.agent_email ? ` · interlocuteur : ${g.agent_email}` : ""}
                </span>
              </span>
            </div>
            <div className="mt-4 space-y-0">
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
            {g.email_contact && (
              <a
                href={`mailto:${g.email_contact}`}
                className={`${buttonVariants({ size: "sm" })} mt-4`}
              >
                Écrire un e-mail
              </a>
            )}
            <p className="mt-3.5 text-xs text-muted-foreground">
              Pour un problème dans le logement, préférez « Signaler un
              problème » : votre demande est suivie étape par étape, et vous
              savez qui prend la réparation en charge.
            </p>
          </div>
          <CarteUrgence />
        </div>
      ) : (
        <div className="loc-carte">
          <p className="text-sm text-muted-foreground">
            Les coordonnées de votre gestionnaire apparaîtront ici.
          </p>
        </div>
      )}
    </div>
  );
}
