import { supabase } from './supabase';

export async function moveVehicleToStage(vehicleId: string, newStage: string) {
  return supabase
    .from('vehicles')
    .update({ stage: newStage, stage_entered_at: new Date().toISOString() })
    .eq('id', vehicleId);
}
