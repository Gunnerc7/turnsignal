import { Dealership, Group } from './DealershipPicker';

export default function GroupMembersModal({
  group,
  members,
  groups,
  onSelect,
  onClose,
  onToggleActive,
  onDelete,
  onGroupAssign,
}: {
  group: Group;
  members: Dealership[];
  groups: Group[];
  onSelect: (d: Dealership) => void;
  onClose: () => void;
  onToggleActive: (d: Dealership) => void;
  onDelete: (d: Dealership) => void;
  onGroupAssign: (d: Dealership, groupId: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">{group.name}</h2>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {members.length === 0 ? (
            <p className="text-steel text-sm">No dealerships in this group yet.</p>
          ) : (
            members.map((d) => (
              <div key={d.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                <button onClick={() => onSelect(d)} className="w-full text-left font-medium text-ink mb-2">
                  {d.name}
                  {!d.active && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-gray-200 text-steel rounded-full px-2 py-0.5">
                      Paused
                    </span>
                  )}
                </button>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-3 text-sm">
                    <button onClick={() => onToggleActive(d)} className="text-steel font-medium">
                      {d.active ? 'Pause' : 'Resume'}
                    </button>
                    <button onClick={() => onDelete(d)} className="text-signal-red font-medium">
                      Delete
                    </button>
                  </div>
                  <select
                    value={d.group_id ?? ''}
                    onChange={(e) => onGroupAssign(d, e.target.value)}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
