import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ALL_BOARDS, getBoard } from '../lib/boards';
import { Vehicle } from '../lib/types';
import KanbanColumn from './KanbanColumn';
import AddVehicleModal from './AddVehicleModal';

export default function DealerBoard({ dealershipId }: { dealershipId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeBoardKey, setActiveBoardKey] = useState('main');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ board: string; stage: string } | null>(null);

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('dealership_id', dealershipId)
      .order('created_at', { ascending: true });

    if (vehiclesError) {
      setError(vehiclesError.message);
    } else {
      setVehicles(data ?? []);
    }
    setLoading(false);
  }, [dealershipId]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const activeBoard = getBoard(activeBoardKey);

  if (loading) {
    return <p className="text-steel text-sm p-4">Loading vehicles…</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <nav className="flex gap-1 overflow-x-auto px-4 py-2 bg-white border-b border-gray-200">
        {ALL_BOARDS.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBoardKey(b.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              activeBoardKey === b.key ? 'bg-signal-blue text-white' : 'text-steel bg-gray-100'
            }`}
          >
            {b.label}
          </button>
        ))}
      </nav>

      {error && <p className="text-signal-red text-sm px-4 py-2">{error}</p>}

      <main className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full">
          {activeBoard.stages.map((stage) => (
            <KanbanColumn
              key={stage.key}
              label={stage.label}
              stageKey={stage.key}
              allStagesInBoard={activeBoard.stages}
              vehicles={vehicles.filter(
                (v) => v.board === activeBoard.key && v.stage === stage.key
              )}
              onAddClick={() => setAddModal({ board: activeBoard.key, stage: stage.key })}
              onMoved={loadVehicles}
            />
          ))}
        </div>
      </main>

      {addModal && (
        <AddVehicleModal
          dealershipId={dealershipId}
          board={addModal.board}
          stage={addModal.stage}
          onClose={() => setAddModal(null)}
          onCreated={() => {
            setAddModal(null);
            loadVehicles();
          }}
        />
      )}
    </div>
  );
}
