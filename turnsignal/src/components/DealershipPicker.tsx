import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import DeleteDealershipModal from './DeleteDealershipModal';
import GroupMembersModal from './GroupMembersModal';

export type Dealership = { id: string; name: string; active: boolean; group_id: string | null };
export type Group = { id: string; name: string };

export default function DealershipPicker({
  onSelect,
}: {
  onSelect: (dealership: { id: string; name: string; group_id?: string | null }) => void;
}) {
  const [dealerships, setDealerships] = useState<Dealership[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dealership | null>(null);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [editingDealershipId, setEditingDealershipId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  async function loadDealerships() {
    const { data } = await supabase
      .from('dealerships')
      .select('id, name, active, group_id')
      .order('name', { ascending: true });
    setDealerships(data ?? []);
    setLoading(false);
  }

  async function loadGroups() {
    const { data } = await supabase.from('dealership_groups').select('id, name').order('name', { ascending: true });
    setGroups(data ?? []);
  }

  useEffect(() => {
    loadDealerships();
    loadGroups();
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

  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    setError(null);

    const { error: insertError } = await supabase
      .from('dealership_groups')
      .insert({ name: newGroupName.trim() });

    setCreatingGroup(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewGroupName('');
    loadGroups();
  }

  async function handleGroupAssign(dealership: Dealership, groupId: string) {
    await supabase.from('dealerships').update({ group_id: groupId || null }).eq('id', dealership.id);
    loadDealerships();
  }

  async function handleRenameDealership(dealership: Dealership, newName: string) {
    await supabase.from('dealerships').update({ name: newName }).eq('id', dealership.id);
    loadDealerships();
  }

  async function handleRenameGroup(group: Group, newName: string) {
    await supabase.from('dealership_groups').update({ name: newName }).eq('id', group.id);
    loadGroups();
  }

  async function toggleActive(dealership: Dealership) {
    await supabase.from('dealerships').update({ active: !dealership.active }).eq('id', dealership.id);
    loadDealerships();
  }

  function renderStandaloneRow(d: Dealership) {
    const isEditing = editingDealershipId === d.id;
    return (
      <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5 mb-2">
          {isEditing ? (
            <input
              autoFocus
              defaultValue={d.name}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value.trim() !== d.name) {
                  handleRenameDealership(d, e.target.value.trim());
                }
                setEditingDealershipId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="flex-1 font-medium text-ink border border-signal-blue rounded px-1 -mx-1"
            />
          ) : (
            <>
              <button onClick={() => onSelect(d)} className="flex-1 text-left font-medium text-ink truncate">
                {d.name}
              </button>
              <button
                onClick={() => setEditingDealershipId(d.id)}
                aria-label="Rename"
                className="text-steel flex-shrink-0 p-1"
              >
                ✎
              </button>
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-3 text-sm">
            <button onClick={() => toggleActive(d)} className="text-steel font-medium">
              {d.active ? 'Pause' : 'Resume'}
            </button>
            <button onClick={() => setDeleteTarget(d)} className="text-signal-red font-medium">
              Delete
            </button>
          </div>
          <select
            value={d.group_id ?? ''}
            onChange={(e) => handleGroupAssign(d, e.target.value)}
            className="text-xs border border-gray-300 rounded-md py-1 px-1.5 bg-white text-steel"
          >
            <option value="">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  const groupedDealershipIds = new Set(dealerships.filter((d) => d.group_id).map((d) => d.id));
  const standaloneActive = dealerships.filter((d) => d.active && !groupedDealershipIds.has(d.id));
  const paused = dealerships.filter((d) => !d.active);
  const groupsWithCounts = groups.map((g) => ({
    ...g,
    members: dealerships.filter((d) => d.group_id === g.id),
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h2 className="text-lg font-semibold text-ink mb-1">Owner Mode</h2>
      <p className="text-steel text-sm mb-4">Pick a dealership to view or troubleshoot.</p>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3 flex-1">
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
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-3 flex-1">
          <label className="block text-sm font-medium text-ink mb-1">
            Add a new group <span className="text-steel font-normal">(e.g. "Johnson Motors")</span>
          </label>
          <div className="flex gap-2">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateGroup}
              disabled={creatingGroup || !newGroupName.trim()}
              className="bg-signal-blue text-white text-sm font-medium rounded-lg px-3 disabled:opacity-60"
            >
              {creatingGroup ? 'Adding…' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="text-signal-red text-xs mb-3">{error}</p>}

      {loading ? (
        <p className="text-steel text-sm">Loading dealerships…</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-6">
          <div className="flex-1">
            <h3 className="font-display font-semibold text-ink text-sm mb-2">
              Dealer Groups ({groupsWithCounts.length})
            </h3>
            {groupsWithCounts.length === 0 ? (
              <p className="text-steel text-sm">None.</p>
            ) : (
              <div className="space-y-2">
                {groupsWithCounts.map((g) =>
                  editingGroupId === g.id ? (
                    <input
                      key={g.id}
                      autoFocus
                      defaultValue={g.name}
                      onBlur={(e) => {
                        if (e.target.value.trim() && e.target.value.trim() !== g.name) {
                          handleRenameGroup(g, e.target.value.trim());
                        }
                        setEditingGroupId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="w-full bg-white border border-signal-blue rounded-lg px-4 py-3 font-medium text-ink"
                    />
                  ) : (
                    <div
                      key={g.id}
                      className="w-full flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-4 py-3"
                    >
                      <button onClick={() => setOpenGroup(g)} className="flex-1 text-left font-medium text-ink truncate">
                        {g.name} <span className="text-steel font-normal">({g.members.length})</span>
                      </button>
                      <button
                        onClick={() => setEditingGroupId(g.id)}
                        aria-label="Rename group"
                        className="text-steel flex-shrink-0 p-1"
                      >
                        ✎
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

          <div className="flex-1">
            <h3 className="font-display font-semibold text-ink text-sm mb-2">Dealers ({standaloneActive.length})</h3>
            {standaloneActive.length === 0 ? (
              <p className="text-steel text-sm">None.</p>
            ) : (
              <div className="space-y-2">{standaloneActive.map(renderStandaloneRow)}</div>
            )}
          </div>

          <div className="flex-1">
            <h3 className="font-display font-semibold text-steel text-sm mb-2">Paused ({paused.length})</h3>
            {paused.length === 0 ? (
              <p className="text-steel text-sm">None.</p>
            ) : (
              <div className="space-y-2">{paused.map(renderStandaloneRow)}</div>
            )}
          </div>
        </div>
      )}

      {openGroup && (
        <GroupMembersModal
          group={openGroup}
          members={dealerships.filter((d) => d.group_id === openGroup.id)}
          groups={groups}
          onSelect={onSelect}
          onClose={() => setOpenGroup(null)}
          onToggleActive={toggleActive}
          onDelete={(d) => {
            setDeleteTarget(d);
            setOpenGroup(null);
          }}
          onGroupAssign={handleGroupAssign}
          onRenameGroup={(g, newName) => {
            handleRenameGroup(g, newName);
            setOpenGroup({ ...g, name: newName });
          }}
          onRenameDealership={handleRenameDealership}
        />
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
