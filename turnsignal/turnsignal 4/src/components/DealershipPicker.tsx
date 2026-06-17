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

  useEffect(() => {
    supabase
      .from('dealerships')
      .select('id, name')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setDealerships(data ?? []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-lg font-semibold text-ink mb-1">Owner Mode</h2>
      <p className="text-steel text-sm mb-4">Pick a dealership to view or troubleshoot.</p>

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
