"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { declarerMonIncident, type EtatIncidentAction } from "@/app/actions/incidents";
import { categorieIncident, CATEGORIES_INCIDENT, PIECES_INCIDENT } from "@/lib/incidents";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const classeSelect =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

// Encart adaptatif « Qui paiera la réparation » (maquette pLocDeclarer +
// apercuImput) : le REPÈRE juridique de la catégorie choisie — une
// information, jamais une décision. Le gérant tranche à la qualification
// (RM-7.2.1) et la mention finale le rappelle.
function EncartQuiPaiera({ slug }: { slug: string }) {
  const categorie = categorieIncident(slug);

  if (!categorie) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Qui paiera la réparation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Choisissez une catégorie : Gerimmo vous dit immédiatement si la
            réparation est plutôt à votre charge ou à celle du propriétaire, et
            sur quel fondement. Aucune surprise à la sortie.
          </p>
        </CardContent>
      </Card>
    );
  }

  const repere = categorie.repere;
  const chargeLocataire = repere?.charge === "locataire";
  const bordure = repere
    ? chargeLocataire
      ? "border-l-[3px] border-l-warning"
      : "border-l-[3px] border-l-success"
    : "";

  return (
    <Card className={bordure}>
      <CardHeader>
        <CardTitle className="text-base">Qui paiera la réparation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        {repere ? (
          <>
            <p>
              <span className={chargeLocataire ? "puce puce-prep" : "puce puce-loue"}>
                {chargeLocataire
                  ? "Plutôt à votre charge"
                  : "Plutôt à la charge du propriétaire"}
              </span>
            </p>
            <p className="text-muted-foreground">{repere.fondement}</p>
            {chargeLocataire ? (
              <p className="text-muted-foreground">
                Le propriétaire peut refuser de prendre en charge financièrement
                l&apos;incident. L&apos;agence peut missionner un artisan pour
                vous ; l&apos;intervention vous est alors refacturée après votre
                accord sur le devis.
              </p>
            ) : (
              <p className="text-muted-foreground">
                Vous n&apos;avancez rien : l&apos;agence missionne l&apos;artisan
                après qualification.
              </p>
            )}
          </>
        ) : (
          <>
            <p>
              <span className="puce puce-grise">À qualifier par votre gérant</span>
            </p>
            <p className="text-muted-foreground">
              La cause ne se déduit pas de la catégorie : votre gérant tranche
              et vous êtes informé immédiatement.
            </p>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Repère indicatif — la décision (opposable) revient à votre gérant à la
          qualification.
        </p>
      </CardContent>
    </Card>
  );
}

// La photo est le PREMIER champ, avant la description (RM-19.2.2). La
// catégorie est pilotée : elle alimente l'encart « Qui paiera la réparation »
// (retour de recette 24/08, alignement maquette pLocDeclarer).
export function FormulaireIncidentLocataire({ orgId }: { orgId: string }) {
  const actionLiee = declarerMonIncident.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatIncidentAction, FormData>(actionLiee, {});
  const [categorie, setCategorie] = useState(etat.valeurs?.categorie ?? "");
  const router = useRouter();

  // Succès : le message reste lisible ~2,5 s puis on rejoint « Mes demandes »
  useEffect(() => {
    if (!etat.succes) return;
    const minuterie = setTimeout(() => {
      router.push(`/locataire/${orgId}/demandes`);
    }, 2500);
    return () => clearTimeout(minuterie);
  }, [etat.succes, orgId, router]);

  if (etat.succes) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
          {etat.avertissement && (
            <p className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Vous allez être redirigé vers vos demandes…{" "}
            <Link
              href={`/locataire/${orgId}/demandes`}
              className="text-[var(--bleu)] underline-offset-2 hover:underline"
            >
              Voir mes demandes maintenant
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="deux-col">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Votre signalement</CardTitle>
          <CardDescription>
            Une ou deux photos prises sur le vif évitent souvent un déplacement
            pour rien.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            {etat.erreur && <div className="err">{etat.erreur}</div>}

            <div className="space-y-1.5">
              <Label htmlFor="photos">Photos (jusqu&apos;à 5)</Label>
              <Input id="photos" name="photos" type="file" accept="image/jpeg,image/png" multiple />
            </div>

            {/* defaultValue={etat.valeurs?.…} : en erreur, le reset React retombe
                sur la saisie (recette 22/08 — mécanique commune, lib/formulaires.ts).
                La catégorie, pilotée, garde sa valeur d'elle-même. */}
            <div className="space-y-1.5">
              <Label htmlFor="categorie">De quoi s&apos;agit-il ? *</Label>
              <select
                id="categorie"
                name="categorie"
                required
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                className={classeSelect}
              >
                <option value="" disabled>
                  Choisissez la catégorie la plus proche…
                </option>
                {CATEGORIES_INCIDENT.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.libelle}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="piece">Dans quelle pièce ?</Label>
              <select id="piece" name="piece" defaultValue={etat.valeurs?.piece ?? ""} className={classeSelect}>
                <option value="">—</option>
                {PIECES_INCIDENT.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Décrivez en quelques mots *</Label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                placeholder="Depuis quand, où exactement, est-ce que cela s'aggrave…"
                defaultValue={etat.valeurs?.description}
                className="w-full rounded-md border border-input bg-transparent px-2.5 py-2 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="anciennete">Depuis quand ?</Label>
              <Input
                id="anciennete"
                name="anciennete"
                placeholder="« Depuis dimanche »"
                defaultValue={etat.valeurs?.anciennete}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="urgence">Est-ce urgent ?</Label>
              <select
                id="urgence"
                name="urgence"
                defaultValue={etat.valeurs?.urgence ?? "normale"}
                className={classeSelect}
              >
                <option value="normale">Non, cela peut attendre quelques jours</option>
                <option value="urgente">Oui, dégât en cours ou logement inutilisable</option>
              </select>
            </div>

            <Button type="submit" disabled={enCours} className="w-full">
              {enCours ? "Envoi…" : "Envoyer le signalement"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <EncartQuiPaiera slug={categorie} />
    </div>
  );
}
