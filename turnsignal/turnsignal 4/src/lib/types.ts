export type Vehicle = {
  id: string;
  dealership_id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  board: string;
  stage: string;
  stage_entered_at: string;
  position: number | null;
  loaned_to: string | null;
  loaner_return_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  stock_number: string | null;
  mileage: number | null;
};

export type NewVehicleInput = {
  dealership_id: string;
  board: string;
  stage: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  stock_number: string;
  mileage: number;
};
