import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ALL_BOARDS, getBoard } from '../lib/boards';
import { Vehicle } from '../lib/types';
import KanbanColumn from '../components/KanbanColumn';
import AddVehicleModal from '../components/AddVehicleModal';

export default function Dashboard() {
  const { session } = useAuth();
  const [dealershipId, setDealershipId] = useState<string | null>(null);
  const [dealershipName, setDealershipName] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeBoardKey, setActiveBoardKey] = useState('main');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ board: string; stage: string } | null>(null);

  const loadEverything = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('dealership_id')
      .eq('id', session.user.id)
      .single();

    if (profileError || !profile) {
      setError("Couldn't find a dealership linked to this account.");
      setLoading(false);
      return;
    }

    const { data: dealership } = await supabase
      .from('dealerships')
      .select('name')
      .eq('id', profile.dealership_id)
      .single();

    setDealershipId(profile.dealership_id);
    setDealershipName(dealership?.name ?? 'Your dealership');

    const { data: vehicleRows, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('dealership_id', profile.dealership_id)
      .order('created_at', { ascending: true });

    if (vehiclesError) {
      setError(vehiclesError.message);
    } else {
      setVehicles(vehicleRows ?? []);
    }

    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadEverything();
  }, [loadEverything]);

  const activeBoard = getBoard(activeBoardKey);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-steel text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-ink text-white px-4 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-steel uppercase tracking-wide">Dealership</p>
          <h1 className="text-lg font-semibold">{dealershipName}</h1>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="text-sm text-steel hover:text-white">
          Sign out
        </button>
      </header>

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
              vehicles={vehicles.filter(
                (v) => v.board === activeBoard.key && v.stage === stage.key
              )}
              onAddClick={() => setAddModal({ board: activeBoard.key, stage: stage.key })}
            />
          ))}
        </div>
      </main>

      {addModal && dealershipId && (
        <AddVehicleModal
          dealershipId={dealershipId}
          board={addModal.board}
          stage={addModal.stage}
          onClose={() => setAddModal(null)}
          onCreated={() => {
            setAddModal(null);
            loadEverything();
          }}
        />
      )}
    </div>
  );
}
