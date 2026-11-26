# Passe 2 (89cb87ff) — relecture des espaces d'agence (admin d'agence, agent)

Seuil appliqué : palier 2, donc seulement ce qui bloque (erreur affichée, donnée d'autrui, page cassée).

## Verdict
Aucun défaut bloquant ni majeur dans les espaces d'agence, IA activée comme IA coupée.

## Ce qui a été regardé (95 captures ouvertes avec l'outil de lecture)
- 390 px : les 59 captures admin et les 62 captures agent. 72 ont été lues à l'écran, découpées en bandes. Les autres sont identiques au pixel près à une capture déjà lue : version « ouvert » dont seul l'ombrage du menu change, page agent identique à la page admin, /espaces identique à l'accueil.
- 1440 px : 17 écrans principaux. Admin : accueil, administration, parc, fiche bien, bail, loyers, incidents (liste et fiche), écritures, personnes, mandats, documents. Agent : accueil, portefeuille, incidents, profil.
- Rapports automatiques rapport-admin.json et rapport-agent.json (390 et 1440, IA activée et IA coupée) : tous les écrans répondent 200, aucune erreur console ou page, aucune réponse en échec, aucun débordement, 0 lien en défaut. Deux redirections sont voulues : incidents/<id> vers la liste avec ?sel= (incidents/[incidentId]/page.tsx:17), diagnostics/<id> vers la fiche du lot.
- Cloisonnement de l'agent vérifié à l'écran : il ne voit que son portefeuille (1 bien, 1 lot, 2 fiches de personnes), sans les 17 lots du mandant Vasseur. « Dupont Alice » dans la liste des personnes de l'admin vient du jeu d'essai de l'agence Alpha (supabase/seed.sql:83) : ce n'est pas une donnée d'autrui.
- Données cohérentes d'un écran à l'autre : 700 € appelés, 300 € encaissés, 400 € restant dus ; honoraires 18 € ; dépôt de garantie 650 €.

## IA coupée (p2-off comparé à p2-on, fichiers appariés en neutralisant les identifiants)
- 36 captures sur 242 diffèrent. Les écarts portent uniquement sur des horodatages (04:17 contre 04:39), le code de parrainage, l'heure de dernière connexion et l'anticrénelage d'icônes. Il n'y a aucun écart de fonction et aucun message manquant. Les écrans restent utilisables.
- Aucune entrée IA n'est visible dans les états capturés des espaces d'agence. L'assistant privé n'est proposé qu'au propriétaire direct (agence/[orgId]/messages/page.tsx:56-70). Non vérifié : la lecture assistée et les dépenses simplifiées des formulaires repliés de la fiche bien (consommations-bien.tsx, echeanciers-charges-client.tsx).

## Passe 1
ECRANS-defauts.md (224 défauts) ne contient aucune ligne pour les espaces admin d'agence ou agent, et les lots L60 à L65 ne les couvrent pas. Il n'y a donc aucun défaut majeur de passe 1 à confirmer comme corrigé ou toujours présent. Entre p1 et p2, aucun écran n'a disparu. L'accueil s'est allongé de 168 px avec les liens Statistiques et Journal, ce qui est voulu.

## Pour mémoire (sous le seuil du palier 2, non compté)
Dans le profil de l'agence, la section « Relances d'impayé » dit que les relances automatiques sont suspendues. Juste en dessous, le texte décrit les relances comme actives : « Chaque matin… reçoit sa première relance… la caution est informée ». Source : profil/formulaire-profil.tsx:404 et 442-451. Correction minimale : n'afficher ce paragraphe que si envoisProposes.relances est vrai.
