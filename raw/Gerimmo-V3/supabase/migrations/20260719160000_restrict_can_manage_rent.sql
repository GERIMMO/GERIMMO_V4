-- Complément à 20260719150000 : can_manage_rent (helper RLS livré avec rent_periods) était
-- resté exécutable par `anon`, contrairement à tous les autres helpers du projet.
-- Détecté par les advisors Supabase après le premier durcissement.
--
-- Impact réel faible (la fonction renvoie un booléen sur les droits de l'appelant : pour un
-- anonyme, auth.uid() est nul donc elle renvoie false), mais on aligne la posture.
--
-- ⚠️ `authenticated` doit CONSERVER le droit d'exécution : les policies de rent_periods
-- appellent cette fonction, et une policy RLS est évaluée avec les droits de l'appelant.
-- La révoquer aux utilisateurs connectés casserait la lecture des loyers.
revoke execute on function public.can_manage_rent(uuid, uuid) from public, anon;
grant execute on function public.can_manage_rent(uuid, uuid) to authenticated, service_role;
