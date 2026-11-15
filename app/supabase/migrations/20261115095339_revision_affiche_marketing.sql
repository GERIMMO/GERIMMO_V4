-- Une validation porte sur une version précise de l’article et de son affiche.
create function public.reverifier_affiche_modifiee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if row(old.titre, old.slug, old.chapo, old.corps, old.facebook_texte, old.facebook_image_url, old.image_empreinte)
      is not distinct from
      row(new.titre, new.slug, new.chapo, new.corps, new.facebook_texte, new.facebook_image_url, new.image_empreinte) then
    return new;
  end if;
  if old.facebook_envoi_demarre_le is not null and old.facebook_post_id is null then
    raise exception 'Vérifiez la tentative Facebook en cours avant de modifier cette publication.';
  end if;
  new.valide_le := null;
  new.valide_par := null;
  return new;
end;
$$;

revoke all on function public.reverifier_affiche_modifiee() from public, anon, authenticated;
create trigger reverifier_affiche_modifiee
before update of titre, slug, chapo, corps, facebook_texte, facebook_image_url, image_empreinte
on public.publications for each row
execute function public.reverifier_affiche_modifiee();
