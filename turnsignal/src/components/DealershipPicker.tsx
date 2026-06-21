import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DeleteDealershipModal from './DeleteDealershipModal';

type Dealership = { id: string; name: string; active: boolean };

export default function DealershipPicker({
  onSelect,
}: {
  onSelect: (dealership: { id: string; name: string }) => void;
}) {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dealership | null>(null);

  async function loadDealerships() {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, active')
      .order('name', { ascending: true });
    setDealerships(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadDealerships();
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);

    const { data: userData } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase
      .from('dealerships')
      .insert({ name: newName.trim(), owner_id: userData.user?.id })
      .select()
      .single();

    setCreating(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewName('');
    await loadDealerships();
    if (data) onSelect(data);
  }

  async function toggleActive(dealership: Dealership) {
    await supabase.from('dealerships').update({ active: !dealership.active }).eq('id', dealership.id);
    loadDealerships();
  }

  function renderRow(d: Dealership) {
    return (
      <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <button onClick={() => onSelect(d)} className="w-full text-left font-medium text-ink mb-2">
          {d.name}
        </button>
        <div className="flex gap-3 text-sm">
          <button onClick={() => toggleActive(d)} className="text-steel font-medium">
            {d.active ? 'Pause' : 'Resume'}
          </button>
          <button onClick={() => setDeleteTarget(d)} className="text-signal-red font-medium">
            Delete
          </button>
        </div>
      </div>
    );
  }

  const activeDealerships = dealerships.filter((d) => d.active);
  const pausedDealerships = dealerships.filter((d) => !d.active);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-lg font-semibold text-ink mb-1">Owner Mode</h2>
      <p className="text-steel text-sm mb-4">Pick a dealership to view or troubleshoot.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-6">
        <label className="block text-sm font-medium text-ink mb-1">Add a new dealership</label>
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Johnson Motors Menomonie"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="bg-signal-blue text-white text-sm font-medium rounded-lg px-3 disabled:opacity-60"
          >
            {creating ? 'Adding…' : 'Add'}
          </button>
        </div>
        {error && <p className="text-signal-red text-xs mt-2">{error}</p>}
      </div>

      {loading ? (
        <p className="text-steel text-sm">Loading dealerships…</p>
      ) : dealerships.length === 0 ? (
        <p className="text-steel text-sm">No dealerships found.</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <h3 className="font-display font-semibold text-ink text-sm mb-2">
              Active ({activeDealerships.length})
            </h3>
            {activeDealerships.length === 0 ? (
              <p className="text-steel text-sm">None.</p>
            ) : (
              <div className="space-y-2">{activeDealerships.map(renderRow)}</div>
            )}
          </div>

          <div className="flex-1">
            <h3 className="font-display font-semibold text-steel text-sm mb-2">
              Paused ({pausedDealerships.length})
            </h3>
            {pausedDealerships.length === 0 ? (
              <p className="text-steel text-sm">None.</p>
            ) : (
              <div className="space-y-2">{pausedDealerships.map(renderRow)}</div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <DeleteDealershipModal
          dealershipId={deleteTarget.id}
          dealershipName={deleteTarget.name}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            loadDealerships();
          }}
        />
      )}
    </div>
  );
}
