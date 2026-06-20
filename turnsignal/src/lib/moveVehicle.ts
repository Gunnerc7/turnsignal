import { supabase } from './supabase';

export async function moveVehicleToStage(vehicleId: string, newStage: string) {
  // Close out whichever stage_history row is currently open for this vehicle.
  await supabase
    .from('stage_history')
    .update({ exited_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('exited_at', null);

  // Look up the vehicle's board and recon_started_at so we know what board
  // this new history row belongs to, and whether this is the moment the
  // "real" recon clock should start.
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('board, recon_started_at')
    .eq('id', vehicleId)
    .single();

  const board = vehicle?.board ?? 'main';
  const now = new Date().toISOString();

  await supabase.from('stage_history').insert({
    vehicle_id: vehicleId,
    board,
    stage: newStage,
    entered_at: now,
  });

  const updates: Record<string, unknown> = { stage: newStage, stage_entered_at: now };

  // The total-time clock starts the first time a vehicle leaves Inbound/Trade-In,
  // and never resets again after that — every later move just adds to it.
  if (!vehicle?.recon_started_at && newStage !== 'inbound_trade_in') {
    updates.recon_started_at = now;
  }

  return supabase.from('vehicles').update(updates).eq('id', vehicleId);
}
