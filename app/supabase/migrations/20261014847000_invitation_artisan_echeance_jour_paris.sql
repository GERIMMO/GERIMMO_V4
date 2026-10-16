-- Invitation d'artisan : l'échéance tombe à la FIN d'un jour de Paris (relecture du 15/10/2026 du lot
-- « invitation-artisan »).
--
-- Constat : une invitation expirait 30 jours après son envoi, à la minute près (`now() + 30 days`), alors que l'e-mail,
-- le carnet du propriétaire et la page de l'artisan disent « valable jusqu'au 14/11/2026 ». Envoyée le 15/10 à 11 h,
-- elle expirait le 14/11 à 11 h : l'après-midi du jour annoncé, la page disait déjà « expirée ».
--
-- Correctif : l'échéance d'une NOUVELLE invitation est la fin de son 30e jour de Paris, c'est-à-dire minuit (heure de
-- Paris) au début du 31e jour, changements d'heure compris ; l'écran nomme le jour qui précède cette échéance
-- (`valableJusquAu`, src/lib/invitations-artisan.ts), ce jour-là inclus. Les invitations existantes gardent leur
-- échéance (aucune ligne n'est touchée) ; l'écran nomme pour elles le jour de leur échéance.
-- Le jour est calculé dans l'expression même (`now() at time zone 'Europe/Paris'`, comme `aujourdhui_paris()`), sans
-- dépendre d'une fonction : le retour de la fonction du jour de Paris (lot « fuseau-paris ») n'en est pas gêné.
--
-- Rejouable sans effet (`set default` idempotent). Retour arrière :
-- app/supabase/retours-arriere/20261014847000_invitation_artisan_echeance_jour_paris.retour.sql.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

alter table public.invitations_artisans
  alter column expire_le set default ((((now() at time zone 'Europe/Paris')::date + 31)::timestamp) at time zone 'Europe/Paris');

comment on column public.invitations_artisans.expire_le is
  'Échéance : fin du 30e jour de Paris après l''envoi (minuit, heure de Paris, au début du 31e jour), voir 20261014847000. L''écran nomme le jour qui précède, inclus.';
