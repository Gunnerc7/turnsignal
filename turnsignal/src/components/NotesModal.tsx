import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { VehicleNote } from '../lib/types';

function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function NotesModal({
  vehicleId,
  vehicleLabel,
  onClose,
  onChanged,
}: {
  vehicleId: string;
  vehicleLabel: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadNotes() {
    setLoading(true);
    const { data } = await supabase
      .from('vehicle_notes')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadNotes();
  }, [vehicleId]);

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    await supabase.from('vehicle_notes').insert({ vehicle_id: vehicleId, content: draft.trim() });
    setDraft('');
    setSaving(false);
    await loadNotes();
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Notes</h2>
            <p className="text-xs text-steel">{vehicleLabel}</p>
          </div>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-steel text-sm">Loading notes…</p>
          ) : notes.length === 0 ? (
            <p className="text-steel text-sm">No notes yet — add the first one below.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="bg-asphalt rounded-lg px-3 py-2">
                <p className="text-sm text-ink whitespace-pre-wrap">{n.content}</p>
                <p className="text-[11px] text-steel mt-1 tabular">{formatNoteDate(n.created_at)}</p>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            className="w-full text-sm border border-gray-300 rounded-lg py-2 px-3 resize-none focus:outline-none focus:ring-2 focus:ring-signal-blue"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !draft.trim()}
            className="mt-2 w-full bg-signal-blue text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {saving ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  );
}
