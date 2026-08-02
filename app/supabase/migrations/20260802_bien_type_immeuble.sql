-- « Immeuble » manquait à la typologie : l'application conseillait de contourner
-- avec « maison, local ou autre » pour un immeuble entier. Type ajouté après
-- « maison » — découpable en lots, et considéré comme habitation (chaque logement
-- porte son propre DPE, RM-0.6.2).
alter type public.bien_type add value if not exists 'immeuble' after 'maison';
