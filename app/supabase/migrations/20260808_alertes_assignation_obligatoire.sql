-- Retour recette 08/08 — une alerte est TOUJOURS assignée : soit à une
-- personne de l'agence, soit à « tout le monde » (choix réservé au
-- responsable — admin_agence). Les alertes créées par le système naissent
-- « tout le monde » (défaut true) : chacun les voit tant que personne ne se
-- les est confiées. Confier une alerte pose l'assigné et retire le
-- « tout le monde » — elle change de main, jamais de duplication (module 14).

alter table public.alerts
  add column assigned_all boolean not null default true;

-- Reprise de l'existant : les alertes déjà confiées à quelqu'un restent
-- nominatives, les autres deviennent explicitement « tout le monde ».
update public.alerts
  set assigned_all = false
  where assignee_account_id is not null;

alter table public.alerts
  add constraint alerts_assignation_obligatoire
  check (assigned_all or assignee_account_id is not null);
