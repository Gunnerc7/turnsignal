import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Dealership = { id: string; name: string };

export default function DealershipPicker({
  onSelect,
}: {
  onSelect: (dealership: Dealership) => void;
}) {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDealerships() {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name')
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

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-lg font-semibold text-ink mb-1">Owner Mode</h2>
      <p className="text-steel text-sm mb-4">Pick a dealership to view or troubleshoot.</p>

      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
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
        <div className="space-y-2">
          {dealerships.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelect(d)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg px-4 py-3 font-medium text-ink"
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
