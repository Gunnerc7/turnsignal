import { supabase } from './supabase';

export async function moveVehicleToStage(vehicleId: string, newBoard: string, newStage: string) {
  // Close out whichever stage_history row is currently open for this vehicle.
  await supabase
    .from('stage_history')
    .update({ exited_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('exited_at', null);

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('recon_started_at')
    .eq('id', vehicleId)
    .single();

  const now = new Date().toISOString();

  await supabase.from('stage_history').insert({
    vehicle_id: vehicleId,
    board: newBoard,
    stage: newStage,
    entered_at: now,
  });

  const updates: Record<string, unknown> = { board: newBoard, stage: newStage, stage_entered_at: now };

  // The total-time clock starts the first time a vehicle leaves Inbound/Trade-In,
  // and never resets again after that — every later move just adds to it.
  if (!vehicle?.recon_started_at && newStage !== 'inbound_trade_in') {
    updates.recon_started_at = now;
  }

  return supabase.from('vehicles').update(updates).eq('id', vehicleId);
}

// Reordering within a single column is a separate concern from changing
// stages — this just sets sequential position values so the column
// remembers the order you dragged things into.
export async function reorderWithinStage(orderedVehicleIds: string[]) {
  await Promise.all(
    orderedVehicleIds.map((id, index) =>
      supabase.from('vehicles').update({ position: index }).eq('id', id)
    )
  );
}

