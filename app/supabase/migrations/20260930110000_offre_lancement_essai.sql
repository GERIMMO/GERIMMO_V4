-- OFFRE DE LANCEMENT : 2 MOIS D'ESSAI JUSQU'AU 31/12/2026, PUIS 1 MOIS
-- (décision du porteur, 30/09/2026).
--
-- L'essai de 2 mois posé le même jour (20260930100000_essai_deux_mois) devient
-- une OFFRE DE LANCEMENT : toute inscription en ligne, ou ouverture depuis la
-- console, jusqu'au 31 décembre 2026 INCLUS reçoit 2 mois calendaires ; à
-- compter du 1er janvier 2027, l'essai ordinaire est d'un mois calendaire.
--
-- LA DATE QUI COMPTE EST CELLE DE PARIS. `current_date` suit le fuseau de la
-- session (UTC en production) : le 31/12 à 0 h 30 heure de Paris, il dirait
-- encore le 30 ; le 1er janvier à 0 h 30, il dirait le 31 et accorderait
-- 2 mois à tort. La bascule ET la date de départ se lisent donc sur
-- `(now() at time zone 'Europe/Paris')::date`, comme `offreLancementActive()`
-- et `dateParis()` côté TypeScript (src/lib/tarifs.ts).
--
-- CE QUI CHANGE, ET RIEN D'AUTRE : la seule fonction `essai_ordinaire_fin()`,
-- déjà lue par `initialiser_espace_proprietaire()` et `ouvrir_organisation()`
-- (paramètre de durée omis). Même signature, mêmes droits. Aucun essai en
-- cours n'est touché : ceux ouverts pendant l'offre gardent leurs 2 mois.

create or replace function public.essai_ordinaire_fin()
returns date
language sql
stable
set search_path = ''
as $$
  select case
    when (now() at time zone 'Europe/Paris')::date <= date '2026-12-31'
      then ((now() at time zone 'Europe/Paris')::date + interval '2 months')::date
    else ((now() at time zone 'Europe/Paris')::date + interval '1 month')::date
  end
$$;
comment on function public.essai_ordinaire_fin() is
  'Fin de l''essai gratuit ordinaire commençant aujourd''hui (date de Paris), en mois calendaires : 2 mois pour une ouverture jusqu''au 31/12/2026 inclus (offre de lancement), 1 mois à compter du 01/01/2027 (décision du 30/09/2026). Même règle que moisEssai() (src/lib/tarifs.ts).';
revoke execute on function public.essai_ordinaire_fin() from public, anon;
grant execute on function public.essai_ordinaire_fin() to authenticated, service_role;
