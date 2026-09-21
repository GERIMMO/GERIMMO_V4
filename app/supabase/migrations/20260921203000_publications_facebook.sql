-- Diffusion Facebook du Journal Gerimmo.
-- L'article reste la source : Facebook ne reçoit qu'un texte court, un visuel
-- public et le lien canonique. L'identifiant distant empêche un double envoi.

alter table public.publications
  add column if not exists facebook_texte text,
  add column if not exists facebook_image_url text,
  add column if not exists facebook_post_id text,
  add column if not exists facebook_publie_le timestamptz,
  add column if not exists facebook_erreur text;

create unique index if not exists publications_facebook_post_unique
  on public.publications (facebook_post_id)
  where facebook_post_id is not null;

comment on column public.publications.facebook_texte is
  'Texte public préparé par Gerimmo pour accompagner le lien vers l''article sur Facebook.';
comment on column public.publications.facebook_image_url is
  'URL HTTPS publique du visuel transmis à Facebook. Aucun fichier privé ni URL signée.';
comment on column public.publications.facebook_post_id is
  'Identifiant renvoyé par Meta après publication ; sert aussi de garde anti-doublon.';

