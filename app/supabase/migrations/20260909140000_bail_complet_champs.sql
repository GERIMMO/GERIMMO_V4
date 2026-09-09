-- Bail 100 % rempli (carte blanche Tahir 09/09) : le contrat type imprimait
-- 28 champs en pointillés parce qu'AUCUN écran ne permettait de les saisir.
-- Chaque donnée reçoit sa colonne au bon niveau — organisation (identité qui
-- signe), personne (état civil), lot (le logement), bien (l'immeuble), bail
-- (les conditions convenues). Les champs purement calculables (première
-- échéance, période de construction, plafond d'honoraires) restent calculés.

-- L'identité de l'émetteur : carte professionnelle (agences, loi Hoguet),
-- garantie financière (mandat de gestion), IBAN (modalités de paiement)
alter table public.organizations
  add column carte_pro text,
  add column garantie_financiere text,
  add column iban text;

-- L'état civil du locataire (bloc « Désignation des parties » du contrat)
alter table public.persons
  add column commune_naissance text;

-- Le logement (partie II du contrat) : chauffage, eau chaude, locaux privatifs
alter table public.lots
  add column chauffage text,
  add column eau_chaude text,
  add column locaux_privatifs text;

-- L'immeuble : parties communes, accès aux technologies (fibre, câble, TNT)
alter table public.biens
  add column parties_communes text,
  add column acces_tic text;

-- Les conditions convenues du bail (parties III à X du contrat type)
alter table public.baux
  add column fixation_loyer text,
  add column paiement_echeance text not null default 'echoir'
    check (paiement_echeance in ('echoir', 'echu')),
  add column lieu_paiement text,
  add column irl_valeur numeric(7,2),
  add column duree_reduite_evenement text,
  add column travaux_recents text,
  add column travaux_recents_montant numeric(10,2),
  add column travaux_locataire text,
  add column honoraires_bailleur numeric(10,2) check (honoraires_bailleur >= 0),
  add column honoraires_locataire numeric(10,2) check (honoraires_locataire >= 0),
  add column clauses_particulieres text,
  -- Zone tendue (encadré obligatoire du contrat type)
  add column loyer_reference numeric(8,2),
  add column loyer_reference_majore numeric(8,2),
  add column complement_loyer numeric(10,2),
  add column complement_justification text,
  add column dernier_loyer numeric(10,2),
  add column dernier_loyer_versement date,
  add column dernier_loyer_revision date,
  -- Bail meublé étudiant : 9 mois, non reconductible (loi 89, art. 25-7)
  add column meuble_etudiant boolean not null default false;

-- Le lieu de paiement standard (virement) vaut pour l'existant comme pour les
-- nouveaux baux — modifiable au cas par cas dans « Compléments du contrat »
update public.baux set lieu_paiement = 'Virement bancaire' where lieu_paiement is null;
alter table public.baux alter column lieu_paiement set default 'Virement bancaire';
