"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { changerEtatLot, type EtatParc } from "@/app/actions/parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

// Transitions autorisées par la machine à états (module 0) — la base fait foi.
//
// « Loué » et « en préavis » ne sont PAS proposés à la main : ils découlent du
// bail. Activer un bail passe le lot en loué, enregistrer un congé le passe en
// préavis. Les boutons manuels d'avant le module bail laissaient marquer un lot
// loué sans locataire, ou en préavis sans congé.
//
// La LIBÉRATION non plus ne se décrète pas depuis le lot : « Le locataire est
// parti » remettait le lot sur le marché alors que son bail courait encore
// jusqu'au terme du préavis (parc annonçant vacant un logement occupé). Le
// départ se constate sur le bail — état des lieux de sortie signé puis
// « Clôturer le bail » (RM-3.11.2) — et le lot repasse en disponible tout seul.
// La base refuse désormais l'incohérence (20260910176000).
const TRANSITIONS: Record<string, { cible: string; libelle: string }[]> = {
  brouillon: [
    { cible: "disponible", libelle: "Mettre en location" },
    { cible: "archive", libelle: "Archiver" },
  ],
  disponible: [
    { cible: "brouillon", libelle: "Remettre en préparation" },
    { cible: "archive", libelle: "Archiver" },
  ],
  loue: [],
  preavis: [],
  archive: [{ cible: "brouillon", libelle: "Réactiver (réservé au responsable)" }],
};

// Ce que l'agent doit faire à la place, quand l'état ne se change pas à la main.
// UNE PHRASE QUI DIT OÙ ALLER Y MÈNE (24/09) : « passez par le bail » n'avait
// pas de lien vers le bail. `bail` est ce lien quand la page le connaît.
const AILLEURS: Record<string, (bail: (texte: string) => ReactNode) => ReactNode> = {
  // Ne redit PAS que le lot est loué : la pastille du titre, le titre de la
  // carte et l'état du bail le disent déjà. Ne reste que la suite à donner.
  loue: (bail) => <>Pour enregistrer un départ, passez par {bail("le bail et son congé")}.</>,
  preavis: (bail) => (
    <>
      Le locataire a donné congé : son bail court jusqu&apos;au terme du préavis.
      Quand il aura rendu les clés et que l&apos;état des lieux de sortie sera
      signé, clôturez le bail depuis {bail("sa fiche")} — le lot redeviendra
      disponible tout seul.
    </>
  ),
};

export function BoutonsEtatLot({
  orgId,
  bienId,
  lotId,
  etat,
  bloque = false,
  compact = false,
  bailHref,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  etat: string;
  // Des blocages subsistent : « Passer en disponible » reste cliquable (la base
  // fait foi et renvoie l'erreur exacte) mais cesse de s'annoncer comme l'action
  // évidente à faire.
  bloque?: boolean;
  // Liste de lots : le rappel sur la revérification est affiché une fois pour
  // toute la carte, pas sous chaque lot — et la phrase d'un lot loué ne s'y
  // répète plus sous chaque rang (24/09).
  compact?: boolean;
  // Le bail en cours, quand la page le connaît : la phrase y mène.
  bailHref?: string;
}) {
  const actionLiee = changerEtatLot.bind(null, orgId, bienId, lotId);
  const [retour, action] = useActionState<EtatParc, FormData>(actionLiee, {});
  const transitions = TRANSITIONS[etat] ?? [];
  const phrase = AILLEURS[etat] && !(compact && etat === "loue") ? AILLEURS[etat] : null;
  // Rien à proposer ni à dire : pas de bloc vide sous le rang du lot.
  if (transitions.length === 0 && !phrase && !retour.erreur && !retour.succes) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <form key={t.cible} action={action}>
            <input type="hidden" name="etat" value={t.cible} />
            <BoutonEnvoi
              size="sm"
              variant={t.cible === "disponible" && !bloque ? "default" : "outline"}
            >
              {t.libelle}
            </BoutonEnvoi>
          </form>
        ))}
      </div>
      {retour.erreur && <p className="text-sm text-destructive">{retour.erreur}</p>}
      {retour.succes && (
        <p className="text-sm text-success-soft-foreground">{retour.succes}</p>
      )}
      {phrase && (
        <p className="text-xs text-muted-foreground">
          {phrase((texte) =>
            bailHref ? (
              <Link href={bailHref} className="lien-discret text-xs">
                {texte}
              </Link>
            ) : (
              texte
            )
          )}
        </p>
      )}
      {/* « ÉTAT ACTUEL : LOUÉ » A DISPARU, et c'est le relevé du 11/09 : la
          pastille du titre disait déjà « Loué », la carte s'intitulait « La
          location en cours », la ligne du bail affichait « Actif », et la
          phrase au-dessus commençait par « Ce lot est loué ». Quatre fois le
          même fait. Ce qui reste ici est le seul renseignement que l'écran ne
          porte pas ailleurs : ce que vérifie le bouton sur lequel on s'apprête
          à appuyer. */}
      {!compact && transitions.some((t) => t.cible === "disponible") && (
        <p className="text-xs text-muted-foreground">
          La mise en location vérifie une dernière fois qu&apos;il ne manque rien
          au lot.
        </p>
      )}
    </div>
  );
}
