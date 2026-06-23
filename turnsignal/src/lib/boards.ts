import { supabase } from './supabase';

export type StageConfig = { key: string; label: string };

export type BoardConfig = {
  id: string;
  dealership_id: string;
  key: string;
  label: string;
  position: number;
  stages: StageConfig[];
};

export async function fetchBoards(dealershipId: string): Promise<BoardConfig[]> {
  const { data, error } = await supabase
    .from('boards')
    .select('*')
    .eq('dealership_id', dealershipId)
    .order('position', { ascending: true });

  if (error || !data) return [];
  return data as BoardConfig[];
}

export function getBoard(boards: BoardConfig[], boardKey: string): BoardConfig | undefined {
  return boards.find((b) => b.key === boardKey);
}
