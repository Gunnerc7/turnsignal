import { supabase } from './supabase';

export type MoveUndoSnapshot = {
  vehicleId: string;
  previousBoard: string;
  previousStage: string;
  previousStageEnteredAt: string;
  previousReconStartedAt: string | null;
  reconStartedAtWasNewlySet: boolean;
  previousLoanerStatus: 'here' | 'out' | null;
  previousPosition: number | null;
  closedHistoryRowId: string | null;
  newHistoryRowId: string | null;
};

export async function moveVehicleToStage(vehicleId: string, newBoard: string, newStage: string) {
  // Capture everything about "before" up front — this is what undo
  // restores from, so it has to be read before anything changes.
  const { data: openHistoryRow } = await supabase
    .from('stage_history')
    .select('id')
    .eq('vehicle_id', vehicleId)
    .is('exited_at', null)
    .maybeSingle();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('board, stage, stage_entered_at, recon_started_at, loaner_status, position')
    .eq('id', vehicleId)
    .single();

  // Close out whichever stage_history row is currently open for this vehicle.
  if (openHistoryRow) {
    await supabase
      .from('stage_history')
      .update({ exited_at: new Date().toISOString() })
      .eq('id', openHistoryRow.id);
  }

  const now = new Date().toISOString();

  const { data: newHistoryRow } = await supabase
    .from('stage_history')
    .insert({ vehicle_id: vehicleId, board: newBoard, stage: newStage, entered_at: now })
    .select('id')
    .single();

  const updates: Record<string, unknown> = { board: newBoard, stage: newStage, stage_entered_at: now };

  // The total-time clock starts the first time a vehicle leaves Inbound/Trade-In,
  // and never resets again after that — every later move just adds to it.
  const reconStartedAtWasNewlySet = !vehicle?.recon_started_at && newStage !== 'inbound_trade_in';
  if (reconStartedAtWasNewlySet) {
    updates.recon_started_at = now;
  }

  // Loaner status only ever means something on the Loaners board — freshly
  // arriving there always starts "here" (it hasn't gone out with anyone
  // yet), and leaving clears it so a stale "out with customer" badge can
  // never linger on a card that isn't a loaner anymore.
  const wasOnLoaners = vehicle?.board === 'loaners';
  const isEnteringLoaners = newBoard === 'loaners';
  if (isEnteringLoaners && !wasOnLoaners) {
    updates.loaner_status = 'here';
  } else if (wasOnLoaners && !isEnteringLoaners) {
    updates.loaner_status = null;
  }

  const result = await supabase.from('vehicles').update(updates).eq('id', vehicleId);

  const undo: MoveUndoSnapshot | null = vehicle
    ? {
        vehicleId,
        previousBoard: vehicle.board,
        previousStage: vehicle.stage,
        previousStageEnteredAt: vehicle.stage_entered_at,
        previousReconStartedAt: vehicle.recon_started_at,
        reconStartedAtWasNewlySet,
        previousLoanerStatus: vehicle.loaner_status,
        previousPosition: vehicle.position,
        closedHistoryRowId: openHistoryRow?.id ?? null,
        newHistoryRowId: newHistoryRow?.id ?? null,
      }
    : null;

  return { ...result, undo };
}

// Reverses exactly one move — deletes the history row the move created,
// reopens the one it closed, and restores every field on the vehicle
// that move touched. Only ever acts on the most recent move; there's no
// stack of multiple undos.
export async function undoMove(snapshot: MoveUndoSnapshot) {
  if (snapshot.newHistoryRowId) {
    await supabase.from('stage_history').delete().eq('id', snapshot.newHistoryRowId);
  }
  if (snapshot.closedHistoryRowId) {
    await supabase.from('stage_history').update({ exited_at: null }).eq('id', snapshot.closedHistoryRowId);
  }

  const updates: Record<string, unknown> = {
    board: snapshot.previousBoard,
    stage: snapshot.previousStage,
    stage_entered_at: snapshot.previousStageEnteredAt,
    loaner_status: snapshot.previousLoanerStatus,
    position: snapshot.previousPosition,
  };
  if (snapshot.reconStartedAtWasNewlySet) {
    updates.recon_started_at = snapshot.previousReconStartedAt;
  }

  return supabase.from('vehicles').update(updates).eq('id', snapshot.vehicleId);
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

