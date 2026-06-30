import { supabase } from './supabase';
import { notifyRoleOnStageEntry } from './stageNotifications';

export async function moveVehicleToStage(vehicleId: string, newBoard: string, newStage: string) {
  // Close out whichever stage_history row is currently open for this vehicle.
  await supabase
    .from('stage_history')
    .update({ exited_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('exited_at', null);

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('dealership_id, recon_started_at, stock_number, year, make, model, trim')
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

  const result = await supabase.from('vehicles').update(updates).eq('id', vehicleId);

  // Notify the relevant role (Service/Detail/Photo/Manager) the moment a
  // vehicle lands in their stage — this is the single chokepoint every
  // stage change already flows through (the dropdown and drag-and-drop
  // both call this same function), so it fires correctly regardless of
  // which one triggered the move.
  if (!result.error && vehicle) {
    const { data: userData } = await supabase.auth.getUser();
    let actorName: string | null = null;
    if (userData.user) {
      const { data: actorProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', userData.user.id)
        .single();
      if (actorProfile?.first_name) {
        actorName = actorProfile.last_name
          ? `${actorProfile.first_name} ${actorProfile.last_name.charAt(0)}.`
          : actorProfile.first_name;
      } else if (actorProfile?.email) {
        actorName = actorProfile.email.split('@')[0];
      }
    }

    const vehicleLabel = `${vehicle.stock_number ? vehicle.stock_number + '-' : ''}${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}${vehicle.trim ? ' ' + vehicle.trim : ''}`.trim();

    await notifyRoleOnStageEntry({
      dealershipId: vehicle.dealership_id,
      stage: newStage,
      vehicleId,
      vehicleLabel,
      actorId: userData.user?.id ?? null,
      actorName,
      action: 'moved',
    });
  }

  return result;
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

