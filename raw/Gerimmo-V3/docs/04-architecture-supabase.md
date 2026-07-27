# 04 - Architecture Supabase GERIMMO V3

Ce document de reference prepare la future architecture Supabase de GERIMMO V3. Il ne contient pas de SQL, ne cree aucune table, ne definit aucune migration et ne connecte pas Supabase.

GERIMMO V3 est pense comme une plateforme nationale, multi-organisations, avec isolation stricte des donnees, historisation des actions importantes et archivage par defaut. Le Super Admin conserve une vision globale. Tous les autres utilisateurs ne voient que leur perimetre autorise.

## Principes transverses

- Architecture multi-organisations obligatoire.
- Isolation complete des donnees par organisation.
- Un artisan peut travailler avec plusieurs organisations.
- Toutes les actions importantes sont historisees.
- Aucune suppression definitive sauf action explicite Super Admin.
- RLS prevues sur toutes les tables metier.
- Architecture dimensionnee pour plusieurs dizaines de milliers de biens.
- Les tables sensibles doivent porter des champs d'organisation, d'archivage et d'audit.

## 1. Organisations

### Objectif

Representer les entites clientes de GERIMMO : agences, groupes, administrateurs de biens ou structures nationales.

### Relations

Une organisation possede des utilisateurs, des roles, des biens, des residences, des locataires, des proprietaires, des documents, des incidents, des messages, des notifications et des abonnements.

### Tables concernees

- `organizations`
- `organization_settings`
- `organization_memberships`

### Cles principales

- `organizations.id`
- `organization_settings.organization_id`
- `organization_memberships.id`

### RLS prevues

Le Super Admin voit toutes les organisations. Les utilisateurs standards ne voient que les organisations dont ils sont membres actifs.

### Archivage

Une organisation peut etre archivee, suspendue ou reactivee. La suppression definitive est reservee au Super Admin.

### Historique

Toute creation, modification de statut, suspension, archivage ou changement de configuration est historise dans le journal d'audit.

## 2. Utilisateurs

### Objectif

Representer les comptes applicatifs, leurs rattachements aux organisations et leur perimetre d'acces.

### Relations

Un utilisateur peut appartenir a plusieurs organisations via des memberships. Il peut avoir plusieurs roles selon l'organisation.

### Tables concernees

- `users`
- `user_profiles`
- `organization_memberships`
- `user_roles`

### Cles principales

- `users.id`
- `user_profiles.user_id`
- `organization_memberships.id`
- `user_roles.id`

### RLS prevues

Un utilisateur voit son propre profil. Les administrateurs d'organisation voient les membres de leur organisation. Le Super Admin voit tous les utilisateurs.

### Archivage

Un utilisateur est desactive ou archive plutot que supprime. La suppression definitive est reservee au Super Admin.

### Historique

Connexions sensibles, changements de role, invitations, desactivations et modifications de profil sont historises.

## 3. Roles

### Objectif

Definir les profils d'acces applicatifs : Super Admin, administrateur organisation, gestionnaire, collaborateur, lecteur et futurs roles specialises.

### Relations

Les roles sont attribues aux utilisateurs dans le contexte d'une organisation. Ils s'appuient sur des permissions.

### Tables concernees

- `roles`
- `user_roles`
- `role_permissions`

### Cles principales

- `roles.id`
- `user_roles.id`
- `role_permissions.id`

### RLS prevues

Les roles globaux sont visibles par le Super Admin. Les roles organisationnels sont visibles et administrables uniquement dans le perimetre de l'organisation.

### Archivage

Un role peut etre desactive s'il n'est plus utilise. La suppression definitive est reservee au Super Admin.

### Historique

Toute creation, modification, attribution ou retrait de role est historise.

## 4. Permissions

### Objectif

Definir les capacites unitaires permettant d'autoriser ou de refuser une action.

### Relations

Les permissions sont associees aux roles, puis appliquees aux utilisateurs via leurs memberships.

### Tables concernees

- `permissions`
- `role_permissions`
- `permission_scopes`

### Cles principales

- `permissions.id`
- `role_permissions.id`
- `permission_scopes.id`

### RLS prevues

Les permissions systeme sont consultables par le Super Admin. Les administrateurs d'organisation peuvent consulter les permissions applicables a leur organisation.

### Archivage

Les permissions systeme ne sont pas supprimees. Elles peuvent etre depreciees.

### Historique

Les changements de permissions et de scopes sont historises.

## 5. Biens

### Objectif

Representer les biens immobiliers geres par GERIMMO : appartements, maisons, locaux, lots ou ensembles patrimoniaux.

### Relations

Un bien appartient a une organisation, peut etre rattache a une residence, a un proprietaire, a des locataires, a des documents, a des incidents, a des devis et a des interventions.

### Tables concernees

- `properties`
- `property_owners`
- `property_tenants`
- `property_documents`
- `property_status_history`

### Cles principales

- `properties.id`
- `property_owners.id`
- `property_tenants.id`
- `property_documents.id`
- `property_status_history.id`

### RLS prevues

Un bien est visible uniquement par les utilisateurs autorises de son organisation. Les artisans ne voient que les biens lies aux interventions qui leur sont assignees. Le Super Admin voit tous les biens.

### Archivage

Un bien sorti du portefeuille est archive. Les liens historiques avec incidents, documents et interventions sont conserves.

### Historique

Les changements d'etat, de rattachement, de proprietaire, d'occupation et d'informations importantes sont historises.

## 6. Residences optionnelles

### Objectif

Regrouper plusieurs biens au sein d'un immeuble, d'une copropriete, d'une residence ou d'un ensemble immobilier.

### Relations

Une residence appartient a une organisation et regroupe plusieurs biens, documents, incidents ou interventions communes.

### Tables concernees

- `residences`
- `residence_properties`
- `residence_documents`

### Cles principales

- `residences.id`
- `residence_properties.id`
- `residence_documents.id`

### RLS prevues

Les residences suivent l'isolation par organisation. Les utilisateurs ne voient que les residences de leur organisation.

### Archivage

Une residence peut etre archivee sans supprimer ses biens rattaches.

### Historique

Les changements de composition, d'adresse, de statut et de rattachement sont historises.

## 7. Locataires

### Objectif

Representer les occupants ou contacts locataires rattaches aux biens.

### Relations

Un locataire appartient au perimetre d'une organisation et peut etre lie a un ou plusieurs biens sur des periodes donnees.

### Tables concernees

- `tenants`
- `property_tenants`
- `tenant_contacts`
- `tenant_history`

### Cles principales

- `tenants.id`
- `property_tenants.id`
- `tenant_contacts.id`
- `tenant_history.id`

### RLS prevues

Les locataires sont visibles uniquement par les utilisateurs autorises de l'organisation. Les artisans ne voient que les informations strictement necessaires a une intervention.

### Archivage

Un locataire sorti est archive ou marque inactif. Les liens historiques de bail, incidents et messages restent conserves.

### Historique

Les changements de coordonnees, d'occupation, de statut et de rattachement sont historises.

## 8. Proprietaires

### Objectif

Representer les proprietaires de biens ou mandants geres par une organisation.

### Relations

Un proprietaire peut posseder plusieurs biens. Un bien peut avoir plusieurs proprietaires selon les cas.

### Tables concernees

- `owners`
- `property_owners`
- `owner_contacts`
- `owner_history`

### Cles principales

- `owners.id`
- `property_owners.id`
- `owner_contacts.id`
- `owner_history.id`

### RLS prevues

Les proprietaires sont visibles uniquement dans l'organisation qui gere les biens concernes. Le Super Admin voit tout.

### Archivage

Un proprietaire peut etre archive sans perdre l'historique de ses biens, documents et incidents.

### Historique

Les modifications de coordonnees, rattachements, mandats et statuts sont historisees.

## 9. Artisans

### Objectif

Representer les prestataires intervenant sur les incidents, devis et interventions.

### Relations

Un artisan peut travailler avec plusieurs organisations via des relations dediees. Il peut etre rattache a plusieurs devis, interventions, messages et documents.

### Tables concernees

- `contractors`
- `contractor_organizations`
- `contractor_contacts`
- `contractor_specialties`

### Cles principales

- `contractors.id`
- `contractor_organizations.id`
- `contractor_contacts.id`
- `contractor_specialties.id`

### RLS prevues

Une organisation ne voit que les artisans avec lesquels elle travaille. Un artisan ne voit que les interventions et informations explicitement partagees. Le Super Admin voit tout.

### Archivage

La relation entre artisan et organisation peut etre archivee sans supprimer l'artisan global.

### Historique

Les rattachements, specialites, statuts, changements de contact et evaluations sont historises.

## 10. Documents

### Objectif

Centraliser les documents lies aux organisations, biens, residences, proprietaires, locataires, incidents, devis et interventions.

### Relations

Un document appartient a une organisation et peut etre rattache a un ou plusieurs objets metier.

### Tables concernees

- `documents`
- `document_links`
- `document_versions`
- `document_access_logs`

### Cles principales

- `documents.id`
- `document_links.id`
- `document_versions.id`
- `document_access_logs.id`

### RLS prevues

Acces limite a l'organisation et aux roles autorises. Les artisans ne voient que les documents explicitement partages pour leur intervention.

### Archivage

Les documents sont archives, jamais supprimes definitivement hors Super Admin. Les versions restent conservees.

### Historique

Consultations sensibles, ajouts, remplacements, partages et archivages sont historises.

## 11. Incidents

### Objectif

Representer les problemes, demandes ou sinistres lies a un bien, une residence ou une organisation.

### Relations

Un incident est rattache a une organisation, optionnellement a un bien ou une residence, et peut generer messages, documents, devis, interventions, notifications et audit.

### Tables concernees

- `incidents`
- `incident_status_history`
- `incident_assignments`
- `incident_documents`

### Cles principales

- `incidents.id`
- `incident_status_history.id`
- `incident_assignments.id`
- `incident_documents.id`

### RLS prevues

Les utilisateurs voient les incidents de leur organisation selon leurs permissions. Les artisans voient uniquement les incidents lies a leurs devis ou interventions.

### Archivage

Un incident cloture peut etre archive mais reste consultable dans l'historique autorise.

### Historique

Tout changement de statut, priorite, assignation, commentaire important ou decision est historise.

## 12. Devis

### Objectif

Representer les propositions chiffrees d'artisans ou prestataires pour un incident ou une intervention.

### Relations

Un devis est lie a une organisation, a un artisan, a un incident et potentiellement a une intervention.

### Tables concernees

- `quotes`
- `quote_lines`
- `quote_status_history`
- `quote_documents`

### Cles principales

- `quotes.id`
- `quote_lines.id`
- `quote_status_history.id`
- `quote_documents.id`

### RLS prevues

Une organisation voit ses devis. Un artisan voit ses propres devis. Le Super Admin voit tout.

### Archivage

Les devis refuses, expires ou annules sont archives mais conserves.

### Historique

Creation, modification, validation, refus, expiration et transformation en intervention sont historises.

## 13. Interventions

### Objectif

Representer les operations planifiees ou realisees par un artisan sur un bien, une residence ou un incident.

### Relations

Une intervention est liee a une organisation, un artisan, un incident, un planning, des documents, des messages et des notifications.

### Tables concernees

- `interventions`
- `intervention_assignments`
- `intervention_status_history`
- `intervention_documents`

### Cles principales

- `interventions.id`
- `intervention_assignments.id`
- `intervention_status_history.id`
- `intervention_documents.id`

### RLS prevues

Les utilisateurs voient les interventions de leur organisation selon leur role. Les artisans voient uniquement leurs interventions.

### Archivage

Les interventions terminees restent conservees et peuvent etre archivees.

### Historique

Planification, replanification, statut, compte rendu, pieces jointes et validation sont historises.

## 14. Planning

### Objectif

Centraliser les evenements, rendez-vous, interventions planifiees et echeances.

### Relations

Un evenement de planning peut etre rattache a une organisation, un utilisateur, un artisan, un incident, une intervention ou un bien.

### Tables concernees

- `calendar_events`
- `calendar_event_participants`
- `calendar_event_links`

### Cles principales

- `calendar_events.id`
- `calendar_event_participants.id`
- `calendar_event_links.id`

### RLS prevues

Les evenements sont visibles selon organisation, participants et permissions. Le Super Admin voit tout.

### Archivage

Les evenements passes sont conserves. Les annulations sont historisees plutot que supprimees.

### Historique

Creation, modification, annulation, changement de participant et replanification sont historises.

## 15. Messages

### Objectif

Gerer les conversations internes et externes liees aux modules GERIMMO.

### Relations

Un message appartient a une conversation, rattachee a une organisation et optionnellement a un incident, un bien, une intervention, un document ou un contact.

### Tables concernees

- `conversations`
- `conversation_participants`
- `messages`
- `message_attachments`

### Cles principales

- `conversations.id`
- `conversation_participants.id`
- `messages.id`
- `message_attachments.id`

### RLS prevues

Un utilisateur ne voit que les conversations dont il est participant ou autorise par son role dans l'organisation. Les artisans ne voient que leurs conversations.

### Archivage

Les conversations sont archivees. Les messages ne sont pas supprimes definitivement hors Super Admin.

### Historique

Creation, lecture sensible, archivage, suppression logique et changement de participants sont historises.

## 16. Notifications

### Objectif

Informer les utilisateurs, artisans ou administrateurs d'evenements importants.

### Relations

Une notification est liee a une organisation, un destinataire et optionnellement a un objet metier.

### Tables concernees

- `notifications`
- `notification_preferences`
- `notification_deliveries`

### Cles principales

- `notifications.id`
- `notification_preferences.id`
- `notification_deliveries.id`

### RLS prevues

Un utilisateur voit ses notifications. Les administrateurs peuvent voir les notifications organisationnelles selon permissions. Le Super Admin voit tout.

### Archivage

Les notifications anciennes peuvent etre archivees ou expirees.

### Historique

Creation, lecture, envoi, echec de livraison et changement de preference sont historises.

## 17. Bot

### Objectif

Preparer l'assistant ou bot GERIMMO pour aider a qualifier, orienter ou automatiser certaines demandes.

### Relations

Le bot peut etre rattache a des conversations, incidents, documents, organisations et journaux d'action.

### Tables concernees

- `bot_sessions`
- `bot_messages`
- `bot_actions`
- `bot_context_links`

### Cles principales

- `bot_sessions.id`
- `bot_messages.id`
- `bot_actions.id`
- `bot_context_links.id`

### RLS prevues

Les sessions bot sont visibles uniquement par l'organisation et les participants autorises. Le Super Admin voit tout.

### Archivage

Les sessions bot peuvent etre archivees avec leur contexte.

### Historique

Prompts importants, actions declenchees, validations humaines et erreurs sont historises.

## 18. Articles

### Objectif

Gerer une base de connaissances, des articles d'aide ou du contenu editorial GERIMMO.

### Relations

Un article peut etre global, propre a une organisation, rattache au support, au bot ou a l'onboarding.

### Tables concernees

- `articles`
- `article_categories`
- `article_versions`
- `article_visibility_rules`

### Cles principales

- `articles.id`
- `article_categories.id`
- `article_versions.id`
- `article_visibility_rules.id`

### RLS prevues

Les articles publics sont visibles selon leurs regles. Les articles organisationnels restent limites a leur organisation. Le Super Admin gere tout.

### Archivage

Les articles sont archives ou depreciees plutot que supprimes.

### Historique

Versions, publications, retraits, changements de visibilite et consultations sensibles sont historises.

## 19. Support

### Objectif

Gerer les demandes d'aide, tickets support et interactions entre clients GERIMMO et equipe support.

### Relations

Un ticket support est rattache a une organisation, un utilisateur, des messages, documents et eventuellement des articles.

### Tables concernees

- `support_tickets`
- `support_ticket_messages`
- `support_ticket_status_history`
- `support_ticket_documents`

### Cles principales

- `support_tickets.id`
- `support_ticket_messages.id`
- `support_ticket_status_history.id`
- `support_ticket_documents.id`

### RLS prevues

Les utilisateurs voient leurs tickets et ceux autorises dans leur organisation. L'equipe support et le Super Admin voient selon leurs droits globaux.

### Archivage

Les tickets resolus sont archives. Suppression definitive reservee au Super Admin.

### Historique

Statuts, assignations, reponses, escalades et resolutions sont historises.

## 20. Boite a idees

### Objectif

Collecter les suggestions, demandes d'amelioration et votes des utilisateurs.

### Relations

Une idee peut etre rattachee a une organisation, un utilisateur, des votes, des commentaires et un statut produit.

### Tables concernees

- `ideas`
- `idea_votes`
- `idea_comments`
- `idea_status_history`

### Cles principales

- `ideas.id`
- `idea_votes.id`
- `idea_comments.id`
- `idea_status_history.id`

### RLS prevues

Les idees peuvent etre visibles par organisation ou globalement selon regles. Les votes et commentaires suivent les droits du perimetre.

### Archivage

Les idees traitees, rejetees ou fusionnees sont archivees plutot que supprimees.

### Historique

Changements de statut, votes, commentaires, fusions et decisions produit sont historises.

## 21. Abonnements

### Objectif

Gerer les offres, abonnements, limites, statuts commerciaux et droits associes aux organisations.

### Relations

Un abonnement appartient a une organisation et influence les limites de modules, utilisateurs, biens ou options.

### Tables concernees

- `plans`
- `subscriptions`
- `subscription_features`
- `subscription_history`

### Cles principales

- `plans.id`
- `subscriptions.id`
- `subscription_features.id`
- `subscription_history.id`

### RLS prevues

Les administrateurs d'organisation voient leur abonnement. Le Super Admin voit et administre tous les abonnements.

### Archivage

Les anciens abonnements sont conserves dans l'historique.

### Historique

Creation, changement d'offre, suspension, renouvellement, depassement de limite et resiliation sont historises.

## 22. Onboarding

### Objectif

Suivre la mise en route des organisations, utilisateurs et parametres initiaux.

### Relations

L'onboarding est rattache a une organisation, des utilisateurs, des etapes, des documents et potentiellement au support.

### Tables concernees

- `onboarding_flows`
- `onboarding_steps`
- `organization_onboarding_progress`
- `user_onboarding_progress`

### Cles principales

- `onboarding_flows.id`
- `onboarding_steps.id`
- `organization_onboarding_progress.id`
- `user_onboarding_progress.id`

### RLS prevues

Chaque organisation voit son avancement. Le Super Admin et l'equipe support peuvent voir les progressions selon leurs droits.

### Archivage

Les parcours termines sont conserves. Les anciens parcours peuvent etre archives.

### Historique

Progression, validation d'etapes, blocages et relances sont historises.

## 23. Journal d'audit

### Objectif

Centraliser la trace des actions importantes, changements sensibles, acces critiques et decisions systeme.

### Relations

Le journal d'audit peut referencer toute table metier, une organisation, un utilisateur, un artisan ou une action systeme.

### Tables concernees

- `audit_logs`
- `audit_log_metadata`
- `audit_log_retention_rules`

### Cles principales

- `audit_logs.id`
- `audit_log_metadata.id`
- `audit_log_retention_rules.id`

### RLS prevues

Le Super Admin voit tout. Les administrateurs d'organisation voient uniquement les logs de leur organisation selon permissions. Les utilisateurs standards ne voient pas le journal d'audit sauf autorisation explicite.

### Archivage

Les logs sont conserves selon une politique de retention. Ils ne sont pas modifiables par les utilisateurs standards.

### Historique

Le journal d'audit est lui-meme append-only. Toute tentative d'action sensible doit produire une entree.

## Schema simplifie des relations

```txt
                         +----------------+
                         |  Super Admin   |
                         | voit tout      |
                         +--------+-------+
                                  |
                                  v
+----------------+       +----------------+       +----------------+
| Abonnements    |<----->| Organisations  |<----->| Utilisateurs   |
| Plans          |       | Settings       |       | Memberships    |
+--------+-------+       +-------+--------+       +--------+-------+
         |                       |                         |
         |                       v                         v
         |              +----------------+         +----------------+
         |              | Roles          |<------->| Permissions    |
         |              | User roles     |         | Scopes         |
         |              +----------------+         +----------------+
         |
         v
+----------------+       +----------------+       +----------------+
| Onboarding     |<----->| Biens          |<----->| Residences     |
| Progressions   |       | Properties     |       | Optionnelles   |
+----------------+       +---+--------+---+       +----------------+
                             |        |
              +--------------+        +--------------+
              v                                      v
+----------------+                         +----------------+
| Proprietaires  |                         | Locataires     |
| Owners         |                         | Tenants        |
+--------+-------+                         +--------+-------+
         |                                          |
         +------------------+-----------------------+
                            |
                            v
                    +----------------+
                    | Incidents      |
                    | Statuts        |
                    +---+--------+---+
                        |        |
                        v        v
              +-------------+  +----------------+
              | Devis       |  | Interventions  |
              | Quotes      |  | Assignations   |
              +------+------+  +-------+--------+
                     |                 |
                     v                 v
              +-------------+  +----------------+
              | Artisans    |  | Planning       |
              | Multi-org   |  | Evenements     |
              +------+------+  +----------------+
                     |
                     v
+----------------+  +----------------+  +----------------+
| Documents      |<-| Messages       |->| Notifications  |
| Versions       |  | Conversations  |  | Deliveries     |
+--------+-------+  +--------+-------+  +--------+-------+
         |                   |                   |
         +-------------------+-------------------+
                             |
                             v
                    +----------------+
                    | Bot            |
                    | Sessions       |
                    +--------+-------+
                             |
                             v
+----------------+  +----------------+  +----------------+
| Articles       |  | Support        |  | Boite a idees  |
| Knowledge base |  | Tickets        |  | Votes          |
+----------------+  +----------------+  +----------------+

Tous les domaines sensibles alimentent :

+---------------------------------------------------------+
| Journal d'audit                                         |
| audit_logs / metadata / retention                       |
+---------------------------------------------------------+
```

## Points forts

- Architecture native multi-organisations.
- Isolation des donnees pensee des le depart.
- Modele compatible avec un usage national et un volume eleve de biens.
- Gestion claire du cas artisan multi-organisations.
- Historisation et audit integres a tous les domaines sensibles.
- Archivage par defaut, avec suppression definitive reservee au Super Admin.
- Separation nette entre domaines metier, support, bot, articles et abonnements.

## Risques eventuels

- La complexite RLS peut devenir importante si les scopes ne sont pas standardises.
- Le volume du journal d'audit peut croitre rapidement a l'echelle nationale.
- Les relations multi-organisations des artisans doivent etre strictement encadrees pour eviter les fuites de donnees.
- Les documents et messages peuvent devenir couteux a indexer sans strategie de retention et d'archivage.
- Les permissions trop fines peuvent ralentir le developpement si la matrice n'est pas stabilisee tot.

## Ameliorations proposees

- Definir une convention unique pour `organization_id`, `archived_at`, `created_by`, `updated_by` et les statuts.
- Formaliser la matrice roles-permissions avant la premiere migration SQL.
- Prevoir une strategie d'indexation pour biens, incidents, interventions, documents et audit.
- Separer les donnees globales, organisationnelles et partagees avec les artisans.
- Definir une politique de retention des logs, messages et notifications.
- Preparer un modele d'evenements metier pour alimenter audit, notifications et workflows n8n.
