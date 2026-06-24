import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Store = { id: string; name: string };

export default function GroupStorePicker({
  groupId,
  onSelect,
  onClose,
}: {
  groupId: string;
  onSelect: (store: Store) => void;
  onClose: () => void;
}) {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('dealerships')
      .select('id, name')
      .eq('group_id', groupId)
      .order('name', { ascending: true })
      .then(({ data }) => {
        setStores(data ?? []);
        setLoading(false);
      });
  }, [groupId]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Your stores</h2>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <p className="text-steel text-sm">Loading stores…</p>
          ) : (
            stores.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="w-full text-left bg-asphalt rounded-lg px-4 py-3 font-medium text-ink"
              >
                {s.name}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
