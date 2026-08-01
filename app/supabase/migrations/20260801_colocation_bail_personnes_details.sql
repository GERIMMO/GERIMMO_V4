-- Item ③ : colocation (bail unique). Détails sur bail_personnes :
-- quote-part de loyer par colocataire, surface privative, garant nominatif
-- (quel colocataire il couvre — RM-1.3.8 + loi/pratique), fin de solidarité résiduelle.
alter table public.bail_personnes add column quote_part numeric
  check (quote_part is null or (quote_part > 0 and quote_part <= 100));
alter table public.bail_personnes add column surface_privative numeric
  check (surface_privative is null or surface_privative > 0);
alter table public.bail_personnes add column garant_de uuid references public.persons (id);
alter table public.bail_personnes add column date_solidarite_fin date;
