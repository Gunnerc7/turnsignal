import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { BoardConfig, StageConfig } from '../lib/boards';
import ModalCloseButton from './ModalCloseButton';

export default function ManageBoardsModal({
  dealershipId,
  boards,
  onClose,
  onChanged,
}: {
  dealershipId: string;
  boards: BoardConfig[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [savingBoard, setSavingBoard] = useState(false);

  function slugify(label: string) {
    return (
      label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || `col_${Date.now()}`
    );
  }

  async function renameBoard(board: BoardConfig, newLabel: string) {
    if (!newLabel.trim() || newLabel === board.label) return;
    setError(null);
    const { error: updateError } = await supabase
      .from('boards')
      .update({ label: newLabel.trim() })
      .eq('id', board.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  async function renameStage(board: BoardConfig, stageKey: string, newLabel: string) {
    if (!newLabel.trim()) return;
    const updatedStages = board.stages.map((s) => (s.key === stageKey ? { ...s, label: newLabel.trim() } : s));
    setError(null);
    const { error: updateError } = await supabase
      .from('boards')
      .update({ stages: updatedStages })
      .eq('id', board.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  async function addStage(board: BoardConfig) {
    const label = window.prompt('Name this new column:');
    if (!label || !label.trim()) return;
    const newStage: StageConfig = { key: slugify(label), label: label.trim() };
    const updatedStages = [...board.stages, newStage];
    setError(null);
    const { error: updateError } = await supabase
      .from('boards')
      .update({ stages: updatedStages })
      .eq('id', board.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  async function deleteStage(board: BoardConfig, stageKey: string) {
    const { count } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('board', board.key)
      .eq('stage', stageKey);

    if (count && count > 0) {
      window.alert(
        `Move the ${count} vehicle(s) out of this column first — deleting it would leave them stranded.`
      );
      return;
    }

    const confirmed = window.confirm('Delete this column? This cannot be undone.');
    if (!confirmed) return;

    const updatedStages = board.stages.filter((s) => s.key !== stageKey);
    setError(null);
    const { error: updateError } = await supabase
      .from('boards')
      .update({ stages: updatedStages })
      .eq('id', board.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
  }

  async function deleteBoard(board: BoardConfig) {
    const { count } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('board', board.key);

    if (count && count > 0) {
      window.alert(
        `Move the ${count} vehicle(s) out of this board first — deleting it would leave them stranded.`
      );
      return;
    }

    const confirmed = window.confirm(`Delete the entire "${board.label}" board? This cannot be undone.`);
    if (!confirmed) return;

    setError(null);
    const { error: deleteError } = await supabase.from('boards').delete().eq('id', board.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onChanged();
  }

  async function addBoard() {
    if (!newBoardName.trim()) return;
    setSavingBoard(true);
    setError(null);

    const { error: insertError } = await supabase.from('boards').insert({
      dealership_id: dealershipId,
      key: slugify(newBoardName),
      label: newBoardName.trim(),
      position: boards.length,
      stages: [],
    });

    setSavingBoard(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setNewBoardName('');
    onChanged();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg modal-h-88 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="font-display text-lg font-semibold text-ink">Manage boards & columns</h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && <p className="text-signal-red text-sm">{error}</p>}

          {boards.map((board) => (
            <div key={board.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <input
                  defaultValue={board.label}
                  onBlur={(e) => renameBoard(board, e.target.value)}
                  className="flex-1 font-display font-semibold text-ink border border-transparent hover:border-gray-300 focus:border-signal-blue rounded px-2 py-1 text-sm"
                />
                <button onClick={() => deleteBoard(board)} className="text-signal-red text-xs font-medium">
                  Delete board
                </button>
              </div>

              <div className="space-y-1.5">
                {board.stages.map((stage) => (
                  <div key={stage.key} className="flex items-center gap-2">
                    <input
                      defaultValue={stage.label}
                      onBlur={(e) => renameStage(board, stage.key, e.target.value)}
                      className="flex-1 text-sm text-ink border border-transparent hover:border-gray-300 focus:border-signal-blue rounded px-2 py-1.5"
                    />
                    <button
                      onClick={() => deleteStage(board, stage.key)}
                      className="text-signal-red text-xs font-medium px-1"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <button onClick={() => addStage(board)} className="mt-2 text-signal-blue text-sm font-medium">
                + Add column
              </button>
            </div>
          ))}

          <div className="border border-dashed border-gray-300 rounded-lg p-3">
            <label className="block text-sm font-medium text-ink mb-1">Add a new board</label>
            <div className="flex gap-2">
              <input
                value={newBoardName}
                onChange={(e) => setNewBoardName(e.target.value)}
                placeholder="e.g. Wholesale"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={addBoard}
                disabled={savingBoard || !newBoardName.trim()}
                className="bg-signal-blue text-white text-sm font-medium rounded-lg px-3 disabled:opacity-60"
              >
                {savingBoard ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
