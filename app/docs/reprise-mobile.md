# Reprise de session — où on en est (4 septembre 2026)

> Fichier de relais : à lire en premier quand on reprend le projet depuis un autre
> appareil (Claude Code web sur téléphone, autre poste…).

## Le projet en une phrase

Gerimmo, SaaS de gérance immobilière (Next.js 16 + Supabase + Vercel). Le dépôt est
aussi un coffre Obsidian : le **référentiel métier** vit dans `wiki/`, l'application
dans `app/`. Toute règle métier se vérifie dans `wiki/` avant d'être codée.

## Où on en est

**Sprints livrés** : S0–S8 (S8 quasi complet), **S7 incidents** (mergé le 23/08),
**S9a Propriétaire direct** (auto-inscription essai 14 j, espace complet, livre,
récapitulatif fiscal 2044), sprint **« Alertes & documents »** (bail activé au dépôt
du signé, prévisualisation Envoyer/Corriger, cloche retirée), et **« Documents-0 »**
(31/08). **Tests : 104 unitaires verts + 22/22 intégration SQL**, typecheck/lint 0
erreur.

La **charte v2** (issue de la maquette cliquable ingérée le 8/08) est appliquée sur
tout l'espace agent — l'arbitrage des « 16 propositions visuelles » du 2/08 est
**clos**, ce document n'est plus que de l'historique. La maquette de référence est
`raw/maquettes/2026-08-23-gerimmo-prototype.html` ; en cas d'écart
maquette/référentiel, **le référentiel (`wiki/`) prime** (décision du 21/08).

**Ce qui vient d'être fait (31 août)** : sprint **Documents-0** — génération de
vrais PDF fidèles aux 50 épreuves :

- socle de rendu (gabarit encre/laiton, police Caladea embarquée, pied
  « Réf · Modèle 2026.11-g1 · Empreinte », Chromium réutilisé ≈ 1,1 s/PDF) ;
- **vague A complète** : quittance/reçu, avis d'échéance, reçu de dépôt, révision
  IRL, prorata, rappel d'assurance, notice d'information ;
- **bail nu (01)** en sections conditionnelles + **EDL entrée/sortie (14/15)** sur la
  grille réelle (compteurs, clés, comparatif, vétusté) ;
- volet **identité** : `persons` + `organizations` enrichies (migration appliquée en
  prod), inscription propriétaire complétée, page **Profil de l'organisation**.

Recette humaine remise à Tahir : **§ 2.000 (D0.1 → D0.5)** dans
`livrables/Recette - test par sprint et persona.md` (c'est le livrable de recette
central, fusion de tout l'historique).

## Les sujets ouverts

1. **Retours de la recette D0.1 → D0.5** : c'est l'étape en cours — attendre/traiter
   les retours de Tahir sur les documents générés.
2. **Suite des documents** : vagues B → D et les manques transverses qui les
   bloquent (adresse postale des personnes, identité complète de l'agence — S9b —,
   IBAN, lieu de signature, table `textes` réglementaires). Tout est cartographié
   dans `wiki/syntheses/Etat des lieux generation de documents.md` (statuts vérifiés
   contre le schéma de production le 31/08).
3. **Reste V0** : fin du S8 (caution formalisée, Visale/GLI, alertes d'approche
   d'échéance de restitution, provision 20 %, relances copro), **S9b**
   administration/transverses, paiement Stripe au S11. Inventaire complet :
   `livrables/Reste a faire V0 - sprints et ecarts maquette.md`.

Aucun arbitrage métier en attente (dernier point clos le 21/08 — voir
`wiki/syntheses/État du projet et décisions ouvertes.md`).

## Directive produit permanente

Concevoir pour un **agent immobilier débutant** : simple, progressif (« le site se
déroule au fur et à mesure des clics »), une prochaine étape évidente par écran,
aucun jargon à l'écran, le manquement signalé là où on regarde avec le bouton qui y
mène. Détail des patterns : `wiki/syntheses/Charte visuelle de l'espace agent.md`.

## Ce qui ne marchera PAS depuis un environnement cloud

À savoir avant de promettre quoi que ce soit :

- **Pas d'accès à la base** : les identifiants sont dans `app/.env.local`, jamais
  commité. Donc pas de vérification en base, et `npm test` ignore les tests
  d'intégration (`describe.skipIf(!DB_URL)`). (L'outil MCP Supabase, quand il est
  connecté à la session, reste le seul accès base possible.)
- **Pas de serveur local** : `localhost:3000` tourne sur le Mac. Pour voir
  l'application, utiliser le déploiement : <https://gerimmo-v4.vercel.app>
- **Pas d'envoi d'e-mail** : `RESEND_API_KEY` est également dans `.env.local`.

Conséquence pratique : depuis le téléphone, privilégier **décider, rédiger, relire** —
et garder l'exécution vérifiée pour le Mac.

## Comptes de démo

`agent.alpha@` · `admin.alpha@` (clôture comptable) · `locataire.alpha@` · `multi@`
(deux agences) — tous en `@gerimmo-demo.fr`. Mot de passe commun dans
`app/supabase/seed.sql`. Le propriétaire direct peut aussi s'inscrire seul depuis la
page publique (essai 14 jours).

## À lire aussi

- `livrables/Recette - test par sprint et persona.md` — le livrable de recette
  central (dont § 2.000 : Documents-0)
- `livrables/Reste a faire V0 - sprints et ecarts maquette.md` — l'inventaire V0
- `wiki/syntheses/Etat des lieux generation de documents.md` — la carte des 50
  documents à générer
- `log.md` (racine) — le journal : `grep "^## \[" log.md | tail -10`
- `CLAUDE.md` (racine) — les règles d'entretien du wiki métier
