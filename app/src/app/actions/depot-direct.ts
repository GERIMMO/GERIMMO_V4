'use server';
import {createClient} from '@/lib/supabase/server';
import {reserverDepotDirect} from '@/lib/depot-direct';
import type {DescriptionDepot} from '@/lib/depot-direct-commun';
export async function preparerDepotDirect(description:DescriptionDepot){
 return reserverDepotDirect(await createClient(),description);
}
