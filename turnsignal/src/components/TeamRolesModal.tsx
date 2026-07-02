import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ModalCloseButton from './ModalCloseButton';

const ROLE_OPTIONS = ['manager', 'sales', 'service', 'detail', 'photo'];

type TeamMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  dealership_role: string | null;
  role: string;
};

export default function TeamRolesModal({
  dealershipId,
  onClose,
}: {
  dealershipId: string;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, dealership_role, role')
      .eq('dealership_id', dealershipId)
      .order('email', { ascending: true });

    if (fetchError) setError(fetchError.message);
    setMembers(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadMembers();
  }, [dealershipId]);

  async function handleRoleChange(memberId: string, newRole: string) {
    setError(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ dealership_role: newRole || null })
      .eq('id', memberId);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    loadMembers();
  }

  async function handleRemove(member: TeamMember) {
    const label = member.first_name ? `${member.first_name} ${member.last_name ?? ''}`.trim() : member.email;
    const confirmed = window.confirm(
      `Remove ${label} from this dealership? They'll lose access immediately. This can't be undone — they'd need to be re-invited to come back.`
    );
    if (!confirmed) return;

    setRemovingId(member.id);
    setError(null);
    const { error: deleteError } = await supabase.from('profiles').delete().eq('id', member.id);
    setRemovingId(null);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    loadMembers();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Team roles</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <p className="text-signal-red text-sm mb-2">{error}</p>}

          {loading ? (
            <p className="text-steel text-sm">Loading team…</p>
          ) : members.length === 0 ? (
            <p className="text-steel text-sm">No one's been added to this dealership yet.</p>
          ) : (
            members.map((m) => {
              const isSelf = m.id === session?.user.id;
              const isOwnerRow = m.role === 'owner';
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.email}
                      {isOwnerRow && <span className="ml-1.5 text-[10px] text-steel font-normal">(Owner)</span>}
                    </p>
                    {m.first_name && <p className="text-xs text-steel truncate">{m.email}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={m.dealership_role ?? ''}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white"
                    >
                      <option value="">No role</option>
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r.charAt(0).toUpperCase() + r.slice(1)}
                        </option>
                      ))}
                    </select>
                    {!isOwnerRow && !isSelf && (
                      <button
                        onClick={() => handleRemove(m)}
                        disabled={removingId === m.id}
                        className="text-signal-red text-xs font-medium disabled:opacity-50"
                      >
                        {removingId === m.id ? '…' : 'Remove'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
