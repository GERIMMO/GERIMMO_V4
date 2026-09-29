"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { confirmerCommuneBien, confirmerCommunesEvidentes, signalerInteretReseau, type EtatReseau } from "@/app/actions/reseau";
import { messageDisponibilite, type DisponibiliteReseau, type CommuneReseau } from "@/lib/reseau";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function RetourReseau({ etat }: { etat: EtatReseau }) {
  return <>{etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}</>;
}

export function InteretReseau({ orgId, bienId, disponibilite: d }: { orgId: string; bienId: string; disponibilite: DisponibiliteReseau }) {
  const [etat, action] = useActionState(signalerInteretReseau.bind(null, orgId, bienId, d.metier, d.nature), {});
  if (d.etat !== "fermee" && d.etat !== "sans_artisan") return null;
  return <form action={action} className="mt-3 space-y-2">
    {d.interet_enregistre ? <p className="text-sm">Votre intérêt est enregistré pour ce bien et ce métier. Aucune intervention n’a été demandée.</p> : <><BoutonEnvoi variant="outline" enCoursTexte="Enregistrement…">Signaler mon intérêt</BoutonEnvoi><p className="text-xs text-muted-foreground">Ce signalement aide à préparer le réseau. Il ne déclenche aucun contact et ne prévoit aucune date d’ouverture.</p></>}
    <RetourReseau etat={etat} />
  </form>;
}

export function MessageReseau({ orgId, bienId, disponibilite: d }: { orgId: string; bienId: string; disponibilite: DisponibiliteReseau }) {
  return <div className={`rounded-xl border p-4 ${d.etat === "ouverte" ? "border-success/30 bg-success-soft" : "border-warning/30 bg-warning-soft"}`}>
    <p className="text-sm font-medium">{messageDisponibilite(d)}</p>
    {d.etat === "adresse_incomplete" && <Link href={`/agence/${orgId}/reseau?bien=${bienId}`} className="mt-2 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Compléter la localisation du bien</Link>}
    <p className="mt-2 text-xs text-muted-foreground">Le suivi de vos incidents et travaux et votre carnet de contacts restent disponibles.</p>
  </div>;
}

/** Confirmation groupée des communes évidentes (audit gestion du 29/09). */
export function ConfirmerCommunesEvidentes({ orgId, nbSansCommune }: { orgId: string; nbSansCommune: number }) {
  const [etat, action] = useActionState(confirmerCommunesEvidentes.bind(null, orgId), {});
  if (nbSansCommune === 0 && !etat.succes) return null;
  return <form action={action} className="space-y-2 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4">
    <p className="text-sm font-medium">{nbSansCommune} bien{nbSansCommune > 1 ? "s" : ""} sans commune confirmée</p>
    <p className="text-xs text-muted-foreground">Le réseau d’artisans se décide commune par commune. Confirmez en une fois les biens dont le code postal ne dessert qu’une commune (ou une seule au nom de la ville saisie) ; les autres restent à choisir un par un ci-dessous.</p>
    <BoutonEnvoi variant="outline" enCoursTexte="Confirmation…">Confirmer les communes évidentes</BoutonEnvoi>
    <RetourReseau etat={etat} />
  </form>;
}

export function ConfirmerCommuneBien({ orgId, bienId, communes, communeActuelle }: { orgId: string; bienId: string; communes: CommuneReseau[]; communeActuelle: string | null }) {
  const [etat, action] = useActionState(confirmerCommuneBien.bind(null, orgId, bienId), {});
  const id = useId();
  if (!communes.length) return <p className="text-sm">La commune ne peut pas être déterminée avec cette adresse. <Link href={`/agence/${orgId}/parc/${bienId}`} className="underline">Compléter l’adresse du bien</Link> avant de vérifier le réseau.</p>;
  return <form action={action} className="space-y-3 rounded-xl border border-[var(--filet)] bg-[var(--ivoire)] p-4">
    <label htmlFor={id} className="block text-sm font-medium">Commune exacte du bien</label>
    <select id={id} name="commune" required defaultValue={communeActuelle ?? ""} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm">
      <option value="" disabled>Choisissez la commune figurant dans l’adresse</option>
      {communes.map(c => <option key={c.code} value={c.code}>{c.nom} ({c.departement})</option>)}
    </select>
    <p className="text-xs text-muted-foreground">Un même code postal peut desservir plusieurs communes. Ce choix doit correspondre à la ville enregistrée sur le bien.</p>
    <BoutonEnvoi enCoursTexte="Confirmation…">Confirmer la commune</BoutonEnvoi>
    <RetourReseau etat={etat} />
  </form>;
}
