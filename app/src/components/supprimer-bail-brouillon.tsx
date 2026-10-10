"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { supprimerBailBrouillon } from "@/app/actions/supprimer-bail-brouillon";

export function SupprimerBailBrouillon({ orgId, bailId, libelle, revenirAuLot = false }: {
  orgId: string; bailId: string; libelle: string; revenirAuLot?: boolean;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [supprime, setSupprime] = useState(false);
  const [enCours, commencer] = useTransition();
  const declencheur = useRef<HTMLButtonElement>(null);
  function fermer() {
    if (enCours) return;
    setOuvert(false);
    declencheur.current?.focus();
  }
  function supprimer() {
    commencer(async () => {
      try {
        const resultat = await supprimerBailBrouillon(orgId, bailId);
        if (resultat.erreur || !resultat.retour) {
          setErreur(resultat.erreur ?? "La suppression n’a pas pu être confirmée.");
          return;
        }
        setOuvert(false);
        setSupprime(true);
        if (revenirAuLot) router.replace(resultat.retour);
        else router.refresh();
      } catch {
        setErreur("La suppression n’a pas pu aboutir. Vérifiez votre connexion puis réessayez.");
      }
    });
  }
  if (supprime) return <span role="status" className="text-sm text-muted-foreground">Brouillon supprimé.</span>;
  return <>
    <Button ref={declencheur} type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { setErreur(undefined); setOuvert(true); }}>
      <Trash2 size={14} aria-hidden="true" /> Supprimer le brouillon
    </Button>
    {ouvert && <Modale titre="Supprimer ce brouillon ?" surtitre="Bail en préparation" variante="critique" fermer={fermer}
      pied={<div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={enCours} onClick={fermer} autoFocus>Annuler</Button>
        <Button type="button" variant="destructive" disabled={enCours} onClick={supprimer}>{enCours ? "Suppression…" : "Supprimer définitivement"}</Button>
      </div>}>
      <p className="text-sm font-semibold">{libelle}</p>
      <p className="text-sm">Le brouillon et ses préparations d’état des lieux seront supprimés définitivement. Le logement, les personnes et les documents déposés sont conservés.</p>
      <p className="text-sm text-muted-foreground">Un bail signé, envoyé en signature ou associé à des opérations ne peut pas être supprimé.</p>
      {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}
    </Modale>}
  </>;
}
