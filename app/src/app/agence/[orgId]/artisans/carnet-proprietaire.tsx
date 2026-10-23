import Link from "next/link";
import { Wrench, History, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";
import { ANCRE_INVITER_ARTISAN, etatLigneCarnet, valableJusquAu, type LigneCarnetArtisan, type TonEtat } from "@/lib/invitations-artisan";
import { COULEURS_INTERVENTION, METIERS_ARTISAN, STATUTS_INTERVENTION } from "./referentiel";
import { FormulaireInvitationArtisan, GestesDuCarnet, GestesInvitationEnAttente, ReinviterArtisan } from "./invitations-artisan";
import { baseEspace } from "@/lib/racine-espace";

type Mission = { id: string; artisan_id: string; incident_id: string; statut: string; confiee_le: string; terminee_le: string | null };

const PUCES: Record<TonEtat, string> = {
  attente: "puce puce-prep",
  succes: "puce puce-loue",
  neutre: "puce puce-grise",
  alerte: "puce puce-rouge",
};

/**
 * Le carnet du PROPRIÉTAIRE DIRECT (décision du 15/10/2026). Deux parties :
 *  · « Mes artisans » : ceux qu'il a invités, et l'état de chacun (invitation envoyée, inscrit en attente de la
 *    validation de Gerimmo, validé). Il n'y voit la raison sociale et le téléphone d'un artisan qu'une fois
 *    l'invitation acceptée ; avant, seulement ce qu'il a lui-même saisi. Avec le formulaire « Inviter un artisan ».
 *  · l'historique des interventions confiées, comme avant.
 */
export async function CarnetProprietaire({ orgId }: { orgId: string }) {
  // Décision D27 : le carnet n'existe que chez le propriétaire direct (/espace/<id>).
  const base = baseEspace(orgId, true);
  const supabase = await createClient();
  const missions: Mission[] = [];
  let erreur = false;
  // Lire tout l'historique, y compris au-delà de la limite PostgREST.
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.from("incident_interventions")
      .select("id,artisan_id,incident_id,statut,confiee_le,terminee_le")
      .eq("organization_id", orgId).order("confiee_le", { ascending: false }).order("id")
      .range(debut, debut + 499);
    if (error) { erreur = true; break; }
    missions.push(...(data ?? []) as Mission[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const { data: carnetBrut, error: erreurCarnet } = await supabase.rpc("carnet_artisans_proprietaire", { p_org: orgId });
  const carnet = (carnetBrut ?? []) as LigneCarnetArtisan[];
  const groupes = new Map<string, Mission[]>();
  for (const mission of missions) groupes.set(mission.artisan_id, [...(groupes.get(mission.artisan_id) ?? []), mission]);
  const ids = [...groupes.keys()];
  const profils = new Map<string, { raison_sociale: string; telephone: string | null; email: string | null }>();
  let erreurProfils = false;
  for (let debut = 0; debut < ids.length; debut += 100) {
    const { data, error } = await supabase.from("artisans").select("id,raison_sociale,telephone,email").in("id", ids.slice(debut, debut + 100));
    if (error) erreurProfils = true;
    for (const profil of data ?? []) profils.set(profil.id, profil);
  }
  return <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 p-4 sm:p-7">
    <div className="entete-page"><div><h1>Mon carnet d’artisans</h1><p className="mt-2 text-sm text-muted-foreground">Les artisans que vous avez invités, et le suivi de leurs interventions.</p></div><div className="flex flex-wrap gap-2"><Link href={`#${ANCRE_INVITER_ARTISAN}`} className="btn-or">+ Inviter un artisan</Link><Link href={`${base}/reseau`} className="btn-secondaire">Consulter le réseau</Link></div></div>

    <section aria-labelledby="mes-artisans" className="loc-carte space-y-4">
      <div>
        <h2 id="mes-artisans" className="font-heading text-xl">Mes artisans</h2>
        <p className="mt-1 text-sm text-muted-foreground">Une fois l’invitation acceptée et l’inscription validée par Gerimmo, vous pouvez solliciter l’artisan depuis la fiche d’un incident, même s’il n’est pas proposé par le réseau Gerimmo (profil privé). Il n’est proposé que pour les biens situés dans sa zone d’intervention et, quand les travaux l’exigent, s’il a une garantie décennale valide ; la fiche de l’incident dit pourquoi un artisan n’y est pas proposé. Sa zone et ses attestations, il les met à jour depuis son espace.</p>
      </div>
      {/* Les gestes des lignes et leur message : au niveau de la liste, hors des lignes qui changent sous le bouton. */}
      <GestesDuCarnet orgId={orgId}>
      {erreurCarnet ? <p role="alert" className="err">La liste de vos artisans n’a pas pu être chargée. Rechargez la page.</p>
        : carnet.length === 0 ? <p className="text-sm text-muted-foreground">Aucun artisan pour le moment. Invitez un artisan que vous connaissez avec le formulaire ci-dessous.</p>
        : <ul className="divide-y divide-[var(--filet)]">{carnet.map((ligne) => {
          const etat = etatLigneCarnet(ligne);
          const titre = ligne.raison_sociale ?? ligne.nom_memo ?? ligne.email ?? "Artisan";
          const detail = ligne.artisan_id
            ? [ligne.telephone, (ligne.metiers ?? []).map((m) => METIERS_ARTISAN[m] ?? m).join(", ")].filter(Boolean).join(" · ")
            : [ligne.email, ligne.metier_memo ? METIERS_ARTISAN[ligne.metier_memo] ?? ligne.metier_memo : null].filter(Boolean).join(" · ");
          // Au téléphone, l'état et les gestes passent sous le nom (en ligne, ils débordaient de la carte).
          return <li key={ligne.artisan_id ?? ligne.invitation_id} className="flex flex-col gap-2 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{titre}</p>
              {detail && <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>}
              {ligne.artisan_id && <p className="mt-1 text-xs text-muted-foreground">{ligne.codes_postaux?.length ? `Zone d’intervention : ${ligne.codes_postaux.join(", ")}` : "Zone d’intervention non renseignée"}</p>}
              {ligne.etat_invitation === "en_attente" && ligne.expire_le && <p className="mt-1 text-xs text-muted-foreground">Valable jusqu’au {valableJusquAu(ligne.expire_le)} inclus</p>}
            </div>
            <div className="flex min-w-0 max-w-full flex-col items-start gap-2 sm:items-end">
              <span className={`${PUCES[etat.ton]} max-w-full whitespace-normal`}>{etat.libelle}</span>
              {etat.renvoyer && ligne.invitation_id && <GestesInvitationEnAttente invitationId={ligne.invitation_id} email={ligne.email} />}
              {etat.reinviter && ligne.email && <ReinviterArtisan email={ligne.email} nom={ligne.nom_memo} metier={ligne.metier_memo} />}
            </div>
          </li>;
        })}</ul>}
      </GestesDuCarnet>
    </section>

    <section id={ANCRE_INVITER_ARTISAN} aria-labelledby="titre-inviter-artisan" className="loc-carte scroll-mt-20 space-y-3">
      <div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--marque-clair)] p-3 text-[var(--marque-sombre)]"><UserPlus size={20} aria-hidden="true" /></span><div><h2 id="titre-inviter-artisan" className="font-heading text-xl">Inviter un artisan</h2><p className="mt-1 text-sm text-muted-foreground">Indiquez son adresse e-mail. Il crée lui-même son compte, inscrit son entreprise et dépose ses attestations ; Gerimmo vérifie son inscription avant toute intervention.</p></div></div>
      <FormulaireInvitationArtisan orgId={orgId} />
    </section>

    <h2 className="font-heading text-xl">Historique des interventions</h2>
    {erreur ? <p role="alert" className="err">Votre historique n’a pas pu être chargé. Rechargez la page.</p> : !missions.length ? <section className="loc-carte py-10 text-center"><History aria-hidden="true" className="mx-auto mb-3 text-[var(--or-texte)]" size={30} /><h3 className="font-heading text-xl">Aucune intervention pour le moment</h3><p className="mt-2 text-sm text-muted-foreground">L’historique se complète automatiquement lorsqu’une intervention est confiée à un artisan.</p><Link className="btn-secondaire mt-5 inline-flex" href={`${base}/incidents`}>Voir mes incidents</Link></section> : <>
      {erreurProfils && <p role="alert" className="err">Certaines coordonnées sont indisponibles. L’historique reste consultable.</p>}
      {[...groupes].map(([id, historique]) => {
        const profil = profils.get(id);
        return <section key={id} className="loc-carte space-y-4"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--marque-clair)] p-3 text-[var(--marque-sombre)]"><Wrench size={20} aria-hidden="true" /></span><div className="min-w-0"><h3 className="break-words font-heading text-lg">{profil?.raison_sociale ?? "Artisan — fiche indisponible"}</h3><p className="mt-1 break-words text-sm text-muted-foreground">{[profil?.telephone, profil?.email].filter(Boolean).join(" · ") || "Coordonnées indisponibles"}</p></div></div>
          <details><summary className="cursor-pointer py-2 text-sm font-medium">Historique · {historique.length} intervention{historique.length > 1 ? "s" : ""}</summary><ul className="divide-y divide-[var(--filet)]">{historique.map((mission) => <li key={mission.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><Link className="font-medium underline underline-offset-4" href={`${base}/incidents?sel=${mission.incident_id}`}>Consulter l’intervention</Link><p className="mt-1 text-xs text-muted-foreground">Confiée le {formaterDate(mission.confiee_le)}{mission.terminee_le && ` · Terminée le ${formaterDate(mission.terminee_le)}`}</p></div><span className={COULEURS_INTERVENTION[mission.statut] ?? "puce puce-grise"}>{STATUTS_INTERVENTION[mission.statut] ?? mission.statut}</span></li>)}</ul></details>
        </section>;
      })}
    </>}
  </main>;
}
