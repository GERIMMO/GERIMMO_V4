Fonctionnalités par persona

Super Admin (éditeur/SaaS) — gestion des comptes clients, paramétrage global, supervision, facturation (Stripe à venir).

Administrateur de l'agence  > Agent immobilier 
Rapports sur les agents et ce  , affecter des bien a une personne ou l'autre et ajouter ou supprimer des agents immo

Gestionnaire (utilisateur principal) — pilotage du portefeuille de biens, création et suivi des incidents, affectation aux artisans, gestion des documents, échanges avec locataires, rapports.

Propriétaire — vue sur ses biens, état des incidents en cours, documents (baux, quittances, PV), reporting financier et locatif.
	
Le locataire envoyer des incidents, gerimo fait une fiche type et l'envoie au proprietaire ou gestionnaire : il gére ou il demandes des devis (parmis la liste des artisant avec un qui est recommandé)
Lorsque c'est validé il va demander les disponibilité de l'artisant puis au locataire pour qu'il trouve une date qui cocorde ensemble et le locataire peut faire une autre proposition après cette boucle si c pas ok on notifie les deux de voir avec le proprio. 

Gerimmo demande si le loyer a bien été recu, par defaut valider et on devalide pour dire que c'est pas recu (3 niveau)
	1- Envoye d'un rappel par mail
	2- Mis en demeure (7jrs paramétrable)
	3- A definir
	
Si loyer recu , on crée la quittance de loyer qui est disponible dans la plateforme, et envoyer par mail valdiation de la quittance par l'agence ou le proprio
La quittance de loyer est générique
Agence : Possibilité géner une quittance de loyer un peu sur mesure en fonction de la template de l'agence. 

Locataire — déclaration d'incident, suivi de l'intervention, accès à ses documents (baux, quittance de loyer, assurances) , canal d'échange (WhatsApp prévu).
	- 

Artisan / prestataire — réception des demandes d'intervention, acceptation/refus, mise à jour du statut, dépôt de photos et devis/factures. (WhatsApp prévu).
	- Peut faire les devis dans l'application

Tout le monde a un agenda : 
	- Loyer, assurance, accident 
	- Doc qui arrive a terme alerte et relance (2 mois / 1 mois / 2 semaines avant) 
	- Un rdv est crée automatiquement 
	- En cas de désaccord : proprio, agence qui peut mettre des rdv : 
		○ Locataire et / ou artisan
		○ RDV | Alerte

Document : 
Vue proprio & agence : 
	- Vue 360 au niveau du bien : Infos sur le bâtiment 
	- Nav : Bâtiment > Bien 
		○ Infos sur le locataire
		○ Infos sur le bien 
		○ 2 carré côte a côte
			§ Un avec tous les documents
			§ Un avec tous les échanges

On a sois un propriétre , soit une agence  