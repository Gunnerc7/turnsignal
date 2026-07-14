import { supabase } from './supabase';

export type NewVehicleFields = {
  dealershipId: string;
  board: string;
  stage: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  color: string | null;
  stock_number: string | null;
  mileage: number | null;
  has_damage: boolean;
  carrying_cost_excluded: boolean;
  is_new: boolean;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  createdById: string | null;
  createdByEmail: string | null;
  createdByName: string | null;
};

export async function createVehicle(fields: NewVehicleFields) {
  const now = new Date().toISOString();
  const startsRecon = fields.stage !== 'inbound_trade_in';

  const { data: created, error } = await supabase
    .from('vehicles')
    .insert({
      dealership_id: fields.dealershipId,
      board: fields.board,
      stage: fields.stage,
      stage_entered_at: now,
      recon_started_at: startsRecon ? now : null,
      position: 999999,
      vin: fields.vin,
      year: fields.year,
      make: fields.make,
      model: fields.model,
      trim: fields.trim,
      color: fields.color,
      stock_number: fields.stock_number,
      mileage: fields.mileage,
      has_damage: fields.has_damage,
      carrying_cost_excluded: fields.carrying_cost_excluded,
      is_new: fields.is_new,
      assigned_to_id: fields.assigned_to_id,
      assigned_to_name: fields.assigned_to_name,
      created_by_email: fields.createdByEmail,
      created_by_name: fields.createdByName,
      loaner_status: fields.board === 'loaners' ? 'here' : null,
    })
    .select()
    .single();

  if (!error && created) {
    await supabase.from('stage_history').insert({
      vehicle_id: created.id,
      board: fields.board,
      stage: fields.stage,
      entered_at: now,
    });
  }

  return { created, error };
}
