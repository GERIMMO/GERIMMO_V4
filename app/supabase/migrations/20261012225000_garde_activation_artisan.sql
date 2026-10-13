-- Le dépôt Storage évalue ce prédicat sous le rôle authenticated : conserver
-- son droit d'exécution, mais ne révéler l'activation qu'au véritable artisan.
-- Une identité de support empruntée ne remplace jamais account_id = auth.uid().
create or replace function public.artisan_module_actif(p_code text)
returns boolean language sql stable security definer set search_path='' as $$
 select case
  when (select auth.uid()) is not null
   and exists(select 1 from public.artisans where account_id=(select auth.uid()))
  then coalesce((select actif from public.artisan_modules_locaux where code=p_code),false)
  else false
 end
$$;
revoke all on function public.artisan_module_actif(text) from public,anon;
grant execute on function public.artisan_module_actif(text) to authenticated;
