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
  completed: boolean;
  recon_started_at: string | null;
  color: string | null;
  created_by_email: string | null;
  completed_by_email: string | null;
  created_by_name: string | null;
  completed_by_name: string | null;
  has_damage: boolean;
  is_new: boolean;
  completed_at: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
};

export type Notification = {
  id: string;
  recipient_id: string;
  dealership_id: string;
  vehicle_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
};

export type VehicleNote = {
  id: string;
  vehicle_id: string;
  content: string;
  created_at: string;
  author_email: string | null;
  author_name: string | null;
};

export type StageHistoryRow = {
  id: string;
  vehicle_id: string;
  board: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
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
