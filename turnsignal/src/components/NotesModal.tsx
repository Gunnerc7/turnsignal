import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ModalCloseButton from './ModalCloseButton';
import { VehicleNote } from '../lib/types';

function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

// Emails are the fallback identity — the part before the @ reads close
// enough to a short name for old entries made before names existed.
function shortName(email: string | null): string {
  if (!email) return 'Someone';
  return email.split('@')[0];
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
  const { session, userName } = useAuth();
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

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
    await supabase.from('vehicle_notes').insert({
      vehicle_id: vehicleId,
      content: draft.trim(),
      author_email: session?.user.email ?? null,
      author_name: userName,
    });
    setSaving(false);
    onChanged();
    onClose();
  }

  async function handleSaveEdit(noteId: string) {
    if (!editDraft.trim()) return;
    await supabase.from('vehicle_notes').update({ content: editDraft.trim() }).eq('id', noteId);
    setEditingId(null);
    await loadNotes();
    onChanged();
  }

  async function handleDelete(noteId: string) {
    const confirmed = window.confirm('Delete this note? This cannot be undone.');
    if (!confirmed) return;
    await supabase.from('vehicle_notes').delete().eq('id', noteId);
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
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <p className="text-steel text-sm">Loading notes…</p>
          ) : notes.length === 0 ? (
            <p className="text-steel text-sm">No notes yet — add the first one below.</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="bg-asphalt rounded-lg px-3 py-2">
                {editingId === n.id ? (
                  <div>
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      className="w-full text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white resize-none focus:outline-none focus:ring-2 focus:ring-signal-blue"
                    />
                    <div className="flex gap-3 mt-1.5">
                      <button
                        onClick={() => handleSaveEdit(n.id)}
                        className="text-signal-blue text-xs font-medium"
                      >
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-steel text-xs font-medium">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-ink whitespace-pre-wrap">{n.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-[11px] text-steel tabular">
                        {n.author_name ?? shortName(n.author_email)} · {formatNoteDate(n.created_at)}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingId(n.id);
                            setEditDraft(n.content);
                          }}
                          className="text-[11px] text-signal-blue font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(n.id)}
                          className="text-[11px] text-signal-red font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-gray-200">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)}
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
