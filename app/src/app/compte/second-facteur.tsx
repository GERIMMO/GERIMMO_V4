"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { codeTotpValide } from "@/lib/mfa";
import {
  etatSecondFacteur,
  libelleFacteur,
  nomPourNouveauFacteur,
  type FacteurTotp,
} from "@/lib/compte";
import { formaterDate } from "@/lib/ged";

type Inscription = { id: string; qr: string; secret: string };

/**
 * LA DOUBLE AUTHENTIFICATION, GÉRÉE PAR SON PROPRIÉTAIRE (19/09).
 *
 * `/securite` sait CONFIGURER un facteur, mais seulement pour laisser entrer la
 * supervision, et seulement quand il n'y en a pas : on ne pouvait ni en
 * remplacer un, ni en retirer un. Le jour où un trousseau perd la clé, le
 * compte est mort — c'est arrivé au porteur du projet, et seule une
 * intervention en base l'a rouvert.
 *
 * LE PIÈGE QUE CET ÉCRAN DÉSAMORCE. Supabase refuse (403) de retirer un facteur
 * VÉRIFIÉ depuis une session restée en aal1. L'ordre des gestes est donc
 * imposé : d'abord un code de l'application en place, ensuite seulement le
 * remplacement ou le retrait. On le demande AVANT de montrer ces boutons,
 * plutôt que de laisser la personne buter dessus.
 */
export function SecondFacteur({ obligatoire }: { obligatoire: boolean }) {
  const [client] = useState(() => createClient());
  const [facteurs, setFacteurs] = useState<FacteurTotp[]>([]);
  const [niveau, setNiveau] = useState<string | null>(null);
  const [inscription, setInscription] = useState<Inscription | null>(null);
  const [code, setCode] = useState("");
  const [retraitDemande, setRetraitDemande] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let actif = true;
    (async () => {
      const lu = await lire(client);
      if (!actif) return;
      if (!lu) setErreur("La protection du compte n’a pas pu être lue. Rechargez la page.");
      else {
        setFacteurs(lu.facteurs);
        setNiveau(lu.niveau);
      }
      setChargement(false);
    })();
    return () => {
      actif = false;
    };
  }, [client]);

  async function rafraichir() {
    const lu = await lire(client);
    if (!lu) {
      setErreur("La protection du compte n’a pas pu être relue. Rechargez la page.");
      return;
    }
    setFacteurs(lu.facteurs);
    setNiveau(lu.niveau);
  }

  const etat = etatSecondFacteur(facteurs, niveau);
  const verifies = facteurs.filter((f) => f.status === "verified");

  async function ajouter() {
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    setMessage("");
    try {
      // Une configuration interrompue laisse un facteur non vérifié derrière
      // elle ; on ne les empile pas.
      const liste = await client.auth.mfa.listFactors();
      if (liste.error) {
        setErreur("Impossible de lire les configurations en attente. Rechargez la page.");
        return;
      }
      for (const f of liste.data.all.filter(
        (f) => f.factor_type === "totp" && f.status === "unverified"
      )) {
        await client.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: nomPourNouveauFacteur(new Date()),
      });
      if (error) {
        setErreur("Le service de protection est indisponible. Réessayez dans quelques instants.");
        return;
      }
      setInscription({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch {
      setErreur("Connexion interrompue. Rechargez la page avant de recommencer.");
    } finally {
      setEnCours(false);
    }
  }

  // Un seul formulaire pour deux gestes : activer la nouvelle application, ou
  // prouver qu'on détient celle en place. Dans les deux cas, un code à six
  // chiffres et une session qui monte en aal2.
  async function valider(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enCours) return;
    const cible = inscription?.id ?? verifies[0]?.id;
    if (!cible) return;
    if (!codeTotpValide(code)) {
      setErreur("Saisissez les six chiffres affichés dans votre application.");
      return;
    }
    setEnCours(true);
    setErreur("");
    setMessage("");
    try {
      const { error } = await client.auth.mfa.challengeAndVerify({ factorId: cible, code });
      if (error) {
        setErreur("Ce code est incorrect ou a expiré. Utilisez le code actuel de votre application.");
        setCode("");
        return;
      }
      if (inscription) {
        // La nouvelle application est vérifiée : les anciennes n'ont plus de
        // raison d'être, et ce retrait-ci passe, car la session vient de
        // monter en aal2.
        const remplacement = verifies.length > 0;
        for (const ancien of verifies) {
          await client.auth.mfa.unenroll({ factorId: ancien.id });
        }
        setInscription(null);
        setMessage(
          remplacement
            ? "Nouvelle application enregistrée. L’ancienne ne donne plus de codes valables."
            : "Double authentification activée. Gardez l’application à portée : elle sera demandée à chaque connexion."
        );
      } else {
        setMessage("Code vérifié. Vous pouvez remplacer ou retirer votre application.");
      }
      setCode("");
      await rafraichir();
    } catch {
      setErreur("La vérification n’a pas abouti. Vérifiez votre connexion et réessayez.");
    } finally {
      setEnCours(false);
    }
  }

  async function annuler() {
    if (!inscription || enCours) return;
    setEnCours(true);
    setErreur("");
    try {
      await client.auth.mfa.unenroll({ factorId: inscription.id });
      setInscription(null);
      setCode("");
      await rafraichir();
    } catch {
      setErreur("Connexion interrompue. Rechargez la page.");
    } finally {
      setEnCours(false);
    }
  }

  async function retirer(id: string) {
    if (enCours) return;
    setEnCours(true);
    setErreur("");
    setMessage("");
    try {
      const { error } = await client.auth.mfa.unenroll({ factorId: id });
      if (error) {
        setErreur(
          "Le retrait a été refusé. Saisissez d’abord un code de votre application, puis réessayez."
        );
        return;
      }
      setRetraitDemande(null);
      setMessage("Application retirée. Votre compte n’est plus protégé que par son mot de passe.");
      await rafraichir();
    } catch {
      setErreur("Connexion interrompue. Rechargez la page.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="loc-carte" aria-busy={chargement || enCours}>
      <div className="entete-carte">
        <h3>Double authentification</h3>
        <span className={`puce ${etat === "aucun" ? "puce-grise" : "puce-loue"}`}>
          {etat === "aucun" ? "inactive" : "active"}
        </span>
      </div>

      <p className="mesure-lecture text-sm text-muted-foreground">
        Un code à six chiffres, donné par une application d’authentification,
        en plus du mot de passe.{" "}
        {obligatoire
          ? "Elle est obligatoire pour la supervision : sans elle, la console reste fermée."
          : "Elle est facultative, et vivement conseillée."}
      </p>
      <p className="mesure-lecture mt-2 text-sm text-muted-foreground">
        Utilisez une application dédiée aux codes. Un trousseau qui range le mot
        de passe et le code dans la même fiche les perd ensemble : effacer
        l’entrée efface le second facteur, et le compte devient inaccessible.
      </p>

      {chargement ? (
        <p role="status" className="mt-4 text-sm">
          Lecture de la protection…
        </p>
      ) : (
        <>
          {verifies.length > 0 && !inscription && (
            <ul className="mt-4 space-y-1">
              {verifies.map((f) => (
                <li key={f.id} className="ligne-info">
                  <span>{libelleFacteur(f, formaterDate)}</span>
                  <span className="mono-discret">vérifiée</span>
                </li>
              ))}
            </ul>
          )}

          {/* 1. Rien en place : on propose d'en mettre un. */}
          {etat === "aucun" && !inscription && (
            <Button type="button" className="mt-4" onClick={ajouter} disabled={enCours}>
              {enCours ? "Préparation…" : "Activer la double authentification"}
            </Button>
          )}

          {/* 2. Un facteur en place, session non élevée : le code d'abord. */}
          {etat === "a-confirmer" && !inscription && (
            <p className="mt-4 text-sm">
              Pour remplacer ou retirer cette application, saisissez d’abord un
              de ses codes — c’est la preuve que vous l’avez toujours.
            </p>
          )}

          {/* 3. Session élevée : les deux gestes sont ouverts. */}
          {etat === "actif" && !inscription && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="button" variant="outline" onClick={ajouter} disabled={enCours}>
                Remplacer l’application
              </Button>
              {retraitDemande ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => retirer(retraitDemande)}
                    disabled={enCours}
                  >
                    Confirmer le retrait
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setRetraitDemande(null)}
                    disabled={enCours}
                  >
                    Annuler
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRetraitDemande(verifies[0]?.id ?? null)}
                  disabled={enCours || verifies.length === 0}
                >
                  Retirer la double authentification
                </Button>
              )}
            </div>
          )}
          {retraitDemande && obligatoire && (
            <p className="mt-3 text-sm text-destructive">
              Votre compte a un accès de supervision : sans second facteur, la
              console vous redemandera d’en configurer un à la prochaine visite.
            </p>
          )}

          {inscription && (
            <div className="mt-4 space-y-3">
              <p className="text-sm">
                Scannez ce QR code avec votre application d’authentification,
                puis saisissez le code à six chiffres qu’elle affiche.
              </p>
              {/* QR fourni par Supabase Auth : rendu comme image, jamais comme HTML. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inscription.qr}
                alt="QR code de configuration de votre application d’authentification"
                width={220}
                height={220}
                className="rounded-md bg-white p-2"
              />
              <details className="text-sm">
                <summary className="lien-discret cursor-pointer">
                  Saisir une clé à la place du QR code
                </summary>
                <p className="mt-2 rounded bg-muted p-3 font-mono break-all select-all">
                  {inscription.secret}
                </p>
              </details>
            </div>
          )}

          {(inscription || etat !== "aucun") && (
            <form onSubmit={valider} className="mt-4 max-w-xs space-y-3">
              <div className="space-y-2">
                <Label htmlFor="code-second-facteur">Code à six chiffres</Label>
                <Input
                  id="code-second-facteur"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  disabled={enCours}
                  className="text-center text-xl tracking-widest"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={enCours || !codeTotpValide(code)}>
                  {enCours ? "Vérification…" : inscription ? "Activer" : "Vérifier"}
                </Button>
                {inscription && (
                  <Button type="button" variant="ghost" onClick={annuler} disabled={enCours}>
                    Annuler
                  </Button>
                )}
              </div>
            </form>
          )}

          {erreur && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {erreur}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="mt-3 border-l-[3px] border-l-success bg-success-soft p-3 text-sm text-success-soft-foreground"
            >
              {message}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Les deux lectures vont ensemble : la liste des facteurs ne dit rien sans le
// niveau de la session, et l'inverse non plus.
async function lire(client: ReturnType<typeof createClient>) {
  try {
    const [liste, niveau] = await Promise.all([
      client.auth.mfa.listFactors(),
      client.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (liste.error || niveau.error) return null;
    return {
      facteurs: liste.data.totp as FacteurTotp[],
      niveau: niveau.data.currentLevel,
    };
  } catch {
    return null;
  }
}
