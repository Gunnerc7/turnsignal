import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const ROLE_OPTIONS = ['manager', 'sales', 'service', 'detail', 'photo'];

type TeamMember = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  dealership_role: string | null;
};

export default function TeamRolesModal({
  dealershipId,
  onClose,
}: {
  dealershipId: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMembers() {
    setLoading(true);
    const { data, error: fetchError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, dealership_role')
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Team roles</h2>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <p className="text-signal-red text-sm mb-2">{error}</p>}

          {loading ? (
            <p className="text-steel text-sm">Loading team…</p>
          ) : members.length === 0 ? (
            <p className="text-steel text-sm">No one's been added to this dealership yet.</p>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">
                    {m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.email}
                  </p>
                  {m.first_name && <p className="text-xs text-steel truncate">{m.email}</p>}
                </div>
                <select
                  value={m.dealership_role ?? ''}
                  onChange={(e) => handleRoleChange(m.id, e.target.value)}
                  className="text-sm border border-gray-300 rounded-md py-1.5 px-2 bg-white flex-shrink-0"
                >
                  <option value="">No role</option>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
