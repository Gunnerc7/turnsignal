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

type Member = { id: string; label: string };

export default function NotesModal({
  vehicleId,
  vehicleLabel,
  dealershipId,
  onClose,
  onChanged,
}: {
  vehicleId: string;
  vehicleLabel: string;
  dealershipId: string;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [taggedIds, setTaggedIds] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

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

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('dealership_id', dealershipId)
      .then(({ data }) => {
        const list = (data ?? [])
          .filter((m) => m.id !== session?.user.id) // tagging yourself isn't meaningful
          .map((m) => ({
            id: m.id,
            label: m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.email,
          }));
        setMembers(list);
      });
  }, [dealershipId, session?.user.id]);

  function toggleTag(id: string) {
    setTaggedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);

    const taggedMembers = members.filter((m) => taggedIds.includes(m.id));

    const { data: created } = await supabase
      .from('vehicle_notes')
      .insert({
        vehicle_id: vehicleId,
        content: draft.trim(),
        author_email: session?.user.email ?? null,
        author_name: userName,
        tagged_user_ids: taggedMembers.map((m) => m.id),
        tagged_user_names: taggedMembers.map((m) => m.label),
      })
      .select()
      .single();

    // One notification per tagged person, same table and pattern already
    // used for card assignment notifications.
    if (created && taggedMembers.length > 0) {
      const preview = draft.trim().length > 80 ? draft.trim().slice(0, 80) + '…' : draft.trim();
      await supabase.from('notifications').insert(
        taggedMembers.map((m) => ({
          recipient_id: m.id,
          dealership_id: dealershipId,
          vehicle_id: vehicleId,
          message: `${userName ?? 'Someone'} tagged you on a note for ${vehicleLabel}: "${preview}"`,
        }))
      );
    }

    setSaving(false);
    setTaggedIds([]);
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
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
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
                    {n.tagged_user_names && n.tagged_user_names.length > 0 && (
                      <p className="text-[11px] text-signal-blue font-medium mt-1">
                        🏷️ Tagged: {n.tagged_user_names.join(', ')}
                      </p>
                    )}
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

          {taggedIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {members
                .filter((m) => taggedIds.includes(m.id))
                .map((m) => (
                  <span
                    key={m.id}
                    className="text-xs bg-signal-blue/10 text-signal-blue font-medium rounded-full pl-2.5 pr-1.5 py-1 flex items-center gap-1"
                  >
                    {m.label}
                    <button onClick={() => toggleTag(m.id)} aria-label={`Remove ${m.label}`} className="text-signal-blue">
                      ×
                    </button>
                  </span>
                ))}
            </div>
          )}

          <div className="relative mt-2">
            <button
              onClick={() => setTagPickerOpen((o) => !o)}
              className="text-xs text-steel font-medium flex items-center gap-1 py-1"
            >
              🏷️ {taggedIds.length > 0 ? `${taggedIds.length} tagged` : 'Tag people'}
            </button>

            {tagPickerOpen && (
              <>
                <button
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Close tag picker"
                  onClick={() => setTagPickerOpen(false)}
                />
                <div className="absolute left-0 bottom-full mb-1 bg-white rounded-lg shadow-lift border border-gray-200 w-56 max-h-56 overflow-y-auto z-50">
                  {members.length === 0 ? (
                    <p className="text-steel text-xs p-3">No other team members yet.</p>
                  ) : (
                    members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleTag(m.id)}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-asphalt"
                      >
                        <span
                          className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            taggedIds.includes(m.id) ? 'bg-signal-blue border-signal-blue' : 'border-gray-300'
                          }`}
                        >
                          {taggedIds.includes(m.id) && (
                            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="text-ink truncate">{m.label}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

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
