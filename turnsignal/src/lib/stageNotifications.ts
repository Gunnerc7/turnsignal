import { supabase } from './supabase';

// Maps the standard Main Board stage keys to which dealership role should
// be notified the moment a vehicle enters that stage, and what to call
// that stage in the notification text. Only these five trigger a
// role-wide notify — every other stage, including any custom columns an
// Owner has added, stays silent.
const STAGE_NOTIFY_MAP: Record<string, { role: string; label: string }> = {
  service: { role: 'service', label: 'Service' },
  detail_backlog: { role: 'detail', label: 'Detail Backlog' },
  active_detail: { role: 'detail', label: 'Active Detail' },
  ready_for_photos: { role: 'photo', label: 'Ready for Photos' },
  price_for_lot: { role: 'manager', label: 'Price for Lot' },
};

export async function notifyRoleOnStageEntry(params: {
  dealershipId: string;
  stage: string;
  vehicleId: string;
  vehicleLabel: string;
  actorId: string | null;
  actorName: string | null;
  action: 'added' | 'moved';
}) {
  const mapping = STAGE_NOTIFY_MAP[params.stage];
  if (!mapping) return;

  const { data: recipients } = await supabase
    .from('profiles')
    .select('id')
    .eq('dealership_id', params.dealershipId)
    .eq('dealership_role', mapping.role);

  if (!recipients || recipients.length === 0) return;

  // Don't notify someone about an action they just took themselves —
  // e.g. a Service-role person who moves a card into Service shouldn't
  // get pinged about their own move.
  const filtered = params.actorId ? recipients.filter((r) => r.id !== params.actorId) : recipients;
  if (filtered.length === 0) return;

  const actor = params.actorName ?? 'Someone';
  const message = `${actor} ${params.action} ${params.vehicleLabel} to ${mapping.label}.`;

  await supabase.from('notifications').insert(
    filtered.map((r) => ({
      recipient_id: r.id,
      dealership_id: params.dealershipId,
      vehicle_id: params.vehicleId,
      message,
    }))
  );
}
