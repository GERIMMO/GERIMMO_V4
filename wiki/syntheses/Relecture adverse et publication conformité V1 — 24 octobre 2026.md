---
type: synthesis
tags: [conformite, relecture, publication, preuves]
status: in-progress
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Prompt de passation à Codex — conformité V1, 24 octobre 2026]]", "log.md", "app/CLAUDE.md"]
---

# Relecture adverse et publication conformité V1 — 24 octobre 2026

## Périmètre et ordre

Reprise de `claude/compassionate-euler-qpqjp6`, tête `9e6e33b` (passation ajoutée après `b3ef106`), descendante de `main` `31377f5`. Travail sur `codex/conformite-v1-20261024`. La date du 24 octobre reste celle de la publication prévue. Aucun autre chantier ni changement de tarification n'est embarqué.

Le code des lots 1 à 3 est déjà en production via #246/#247. Cette livraison publie les textes, active leur acceptation distincte et la règle d'inactivité V1 ; les corrections supplémentaires sont celles de la relecture ci-dessous. Une revue technique et documentaire ne constitue pas une certification juridique.

## Constats corrigés avant publication

| Constat | Correction | Vérification |
|---|---|---|
| Le formulaire de rétractation simplifiait le modèle réglementaire | Modèle R. 221-1 reproduit dans la page et le courriel, y compris les variantes et la mention à rayer | Comparaison à Légifrance et test indépendant page/courriel |
| Un circuit de signature annulé était décrit comme n'engageant personne | Le texte décrit seulement son état technique, sans préjuger de la portée des engagements déjà pris | Test du texte contractuel ; caution et garant confirmant eux-mêmes leur mobile |
| Conditions artisans : accès aux données et certains préavis incomplets | A9 distingue données propres, données nécessaires aux missions, accès de l'éditeur et situation après fermeture ; A12 prévoit le préavis prolongé si des adaptations sont nécessaires et l'absence de rétroactivité défavorable | Comparaison P2B art. 3, 4, 8, 9 et tests des textes |
| Impayé : trente jours de défaut étaient assimilés à trente jours depuis la mise en demeure | Le courriel impose aussi trente jours après son envoi ; le webhook relit la preuve du premier envoi de cet épisode avant de citer l'article 15.4. Sans preuve, ou trop tôt : texte factuel et alerte au relais | Cas de courrier retardé, absent, illisible ou inaccessible ; cas à trente jours révolus |
| Wiki rédigé avant la dernière intégration | Compléments ci-dessous et liens depuis les pages concernées ; les constats historiques datés restent identifiables | Relecture des neuf nouvelles pages et des modifications du lot 6 |

Les deux empreintes du 24 octobre, encore inédites, sont recalculées. La déclaration et l'archive de la version publiée du 30 septembre restent intactes. Les pages de référence sont à relever de nouveau sur `next start` après compilation.

## Confrontation des textes au code

- **Souscription et tarifs** : prix du module partagé `tarifs`, confirmation explicite, Stripe en mode abonnement sans `submit_type: pay`, confirmation et formulaire, archive des conditions jointe quand disponible. L'offre de lancement est conservée. Le libellé final de Stripe doit être contrôlé dans sa recette, il n'est pas présenté comme un bouton « Payer » fourni par Gerimmo.
- **Rétractation** : délai calculé côté serveur, déclaration conservée, remboursement intégral, accusé de réception même si Stripe doit être repris, reprise de nuit et garde d'idempotence ; retour mensuel décrit avec la nouvelle mensualité. Aucun paiement réel effectué par cette relecture.
- **Résiliation** : récapitulatif, notification et accusé ; un nouveau rang d'accusé après une levée ; pas d'accusé trompeur pour une fermeture ou une non-reconduction automatique. L'avis annuel utilise la fenêtre de trois à un mois ; les voies manuelles annoncées restent manuelles.
- **Impayé** : J+15 après au moins un courrier, gel immédiat au premier prélèvement sans paiement antérieur, lecture/export maintenus, résiliation décidée manuellement. La règle des trente jours est désormais contrôlée sur la preuve d'envoi, et pas seulement le défaut.
- **Conservation et fermeture** : les durées publiques sont celles du catalogue, avec les traitements manuels et règles inactives signalés. Factures six ans et preuve dix ans selon la décision du dirigeant ; la qualification fiscale de l'activité reste à faire confirmer par son conseil. Les comptes sans accord V1 sont exclus de l'inactivité ; le superadmin permanent est protégé ; deux avertissements et une sauvegarde réussie sont exigés avant effacement.
- **Export** : archive CSV et fichiers, documents signés et certificats, dans les droits du demandeur, authentification récente ; limite de volume et échec explicite. L'article 9 des conditions contient déjà cet export : l'ancien point ouvert du wiki est résolu.
- **Signatures** : mobile confirmé par la caution ou le garant ; mention de caution à saisir ; confirmation de l'établissement contradictoire sur place pour l'EDL, date identique au document. Le délai de complément de l'EDL part de son établissement. Aucun document réel envoyé ni signé pendant cette revue. La remise réelle d'un exemplaire à chacun et les conditions de l'offre Zoho restent à valider avec le prestataire, sans revendiquer une signature qualifiée.
- **Acceptation** : écran de changement pour les comptes existants ; conditions artisans distinctes ; garde serveur ; V1 au 24/10 dans les comptes de recette. Le changement E2E `41f4270` est conservé : le titre attendu « 8.8 — Artisans et travaux » est bien celui du texte.
- **Migration 150000** : activation seule et garde des fonctions d'inactivité, contrôle du catalogue attendu, droits fermés, chemin de recherche vide, retour arrière explicite refusé si des fermetures ont déjà été programmées. La simulation sur production reste obligatoire avant application.

## Sources officielles confrontées le 24 octobre

Les pages Légifrance sont parfois rendues par l'index de recherche lorsque l'ouverture directe est refusée. Les textes officiels ci-dessous sont les sources utilisées, pas les commentaires d'un fournisseur.

- [Modèle de rétractation, annexe R. 221-1](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000045418600/) : formulaire de la page et du courriel corrigé.
- [Fonctionnalité de rétractation, D. 221-5](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053303365/) : accès, confirmation et réception sur support durable ; texte applicable depuis juin 2026.
- [Confirmation du contrat, L. 221-13](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044563210/) et [obligation de paiement, L. 221-14](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000032226854/) : pas de réintroduction du paramètre Stripe incompatible.
- [Encadré de garantie numérique, décret 2022-946](https://www.legifrance.gouv.fr/eli/decret/2022/6/29/2022-946/jo/texte) : annexe III comparée à l'article 14 bis ; conservation de la formulation réglementaire.
- [Reconduction, L. 215-1 à L. 215-3](https://www.legifrance.gouv.fr/codes/section_lc/LEGITEXT000006069565/LEGISCTA000032221235/) et [L. 241-3](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032226409/) : annexe 2 comparée, date de vérification corrigée.
- [P2B 2019/1150](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX%3A32019R1150) : accès aux données et préavis complétés. Les exemptions des petites entreprises pour le dispositif formel de plaintes et les médiateurs P2B ne dispensent pas du médiateur de la consommation.
- [État des lieux, article 3-2](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000047900049/) et [mention de caution, article 2297](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044071230/) : établissement de l'EDL et mention propre de la caution.
- [Conservation des contrats, D. 213-1 et D. 213-2](https://www.legifrance.gouv.fr/codes/id/LEGISCTA000032807206/) : seuil légal de 120 euros, conservation dix ans ; Gerimmo retient une politique plus large pour les contrats payés, sans présenter le seuil comme applicable à tout contrat.
- [Factures, doctrine fiscale L. 102 B](https://bofip.impots.gouv.fr/bofip/2899-PGP.html/identifiant%3DBOI-BIC-DECLA-30-10-20-40-20120912) : durée fiscale de six ans, sous réserve de la qualification de l'éditeur.
- [RGPD, article 28, CNIL](https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre4#Article28) : annexes de sous-traitance, restitution/suppression, assistance et information sur les sous-traitants ; l'acceptation des DPA chez les fournisseurs n'est pas prouvée par le code.
- [CNIL, comptes inactifs](https://www.cnil.fr/fr/achat-de-contenus-numeriques-quelle-duree-de-conservation-des-comptes-inactifs) : recommandation de proportionnalité, pas une obligation universelle de supprimer tous les comptes à vingt-quatre mois.

## Preuves et limites de publication

- Archive préalable réellement enregistrée le 24/10 à 08:13:43 UTC : conditions clients 2026-09-30, SHA-256 `6160e62a4883d92b4e92203236330df388d382af6b3e69248858a25506fa6799`.
- Production consultée en lecture seule : une identité d'authentification, zéro organisation et zéro acceptation ; règle d'inactivité encore inactive avant publication.
- Banc local reconstruit avec 420 migrations dans l'ordre du manifeste et des données fictives. UTC appliqué comme en production : les trois échecs initiaux dus au fuseau local disparaissent (82 tests ciblés). Le premier build épuisait la mémoire TypeScript ; avec 8 Go, build et types passent. Les corrections juridiques ont 77 tests ciblés verts ; impayés 63 tests verts.
- Les résultats finaux, SHA, CI, sauvegarde, simulation, application, Vercel et recettes sont consignés successivement dans `log.md`. Cette note ne remplace pas ces preuves et ne vaut pas attestation de mise en ligne.
- Santé de production : un abonnement Stripe orphelin préexistant signalé par l'inventaire. Aucun abonnement n'est modifié dans cette livraison. Le réglage de fin des relances Stripe reste à confirmer.
- À la charge du dirigeant : médiateur, DPA des prestataires, RC professionnelle ; contrôle de la première tâche `fermetures-comptes` le 25/10. Pas d'annonce, pas de dépense et pas de rapport PDF.
