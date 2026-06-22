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
  stockNumber: string | null;
  mileage: number | null;
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
      stock_number: fields.stockNumber,
      mileage: fields.mileage,
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
