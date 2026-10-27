-- Une année connue reste une année : ne pas inventer le jour ou le mois
-- d'installation lorsque le propriétaire ne dispose pas de cette précision.
alter table public.qualifications_diagnostics_lot
  add column annee_installation integer,
  drop constraint qualifications_diagnostics_lot_situation_check,
  drop constraint qualifications_diagnostics_date_coherente,
  add constraint qualifications_diagnostics_lot_situation_check
    check (situation in ('plus_15_ans', 'date_connue', 'annee_connue', 'absente', 'inconnue')),
  add constraint qualifications_diagnostics_date_coherente check (
    (situation = 'date_connue' and date_installation is not null and annee_installation is null)
    or (situation = 'annee_connue' and annee_installation is not null and date_installation is null)
    or (situation not in ('date_connue', 'annee_connue') and date_installation is null and annee_installation is null)
  ),
  add constraint qualifications_diagnostics_annee_passee check (
    annee_installation is null or (annee_installation >= 1800
      and annee_installation <= extract(year from current_timestamp at time zone 'Europe/Paris'))
  );
