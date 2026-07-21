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
    const newKey = slugify(label);
    if (board.stages.some((s) => s.key === newKey)) {
      window.alert(
        `A column with a name too similar to "${label.trim()}" already exists on this board — use something more specific (e.g. "Final Photos" instead of "Photos" if you already have one).`
      );
      return;
    }
    const newStage: StageConfig = { key: newKey, label: label.trim() };
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

  // Column order is just array order in the stages list — reordering is a
  // simple swap-with-neighbor-and-save. Up/down buttons instead of drag
  // handles deliberately: this is a settings screen, not the board itself,
  // and a couple of taps is a lot more reliable than a drag gesture inside
  // a modal, especially on a phone.
  async function moveStage(board: BoardConfig, index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= board.stages.length) return;

    const updatedStages = [...board.stages];
    [updatedStages[index], updatedStages[targetIndex]] = [updatedStages[targetIndex], updatedStages[index]];

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

    const isSpecialFirstStage = board.key === 'main' && stageKey === 'inbound_trade_in';
    const confirmed = window.confirm(
      isSpecialFirstStage
        ? "This is the column where new vehicles wait before recon really starts — it's the only stage that doesn't get aging colors, and for new vehicles, carrying cost doesn't start counting until they leave it. Deleting it means whatever becomes your new first stage will start the clock immediately instead. Delete anyway?"
        : 'Delete this column? This cannot be undone.'
    );
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
    if (board.key === 'main' || board.key === 'loaners') {
      window.alert(
        `The ${board.label} board can't be deleted — the rest of the app, especially Analytics, depends on it existing. Rename it or reorganize its columns instead.`
      );
      return;
    }

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
                {board.stages.map((stage, index) => (
                  <div key={stage.key} className="flex items-center gap-1.5">
                    <div className="flex flex-col flex-shrink-0">
                      <button
                        onClick={() => moveStage(board, index, 'up')}
                        disabled={index === 0}
                        aria-label={`Move ${stage.label} left`}
                        className="text-steel disabled:opacity-25 leading-none px-1 py-0.5"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => moveStage(board, index, 'down')}
                        disabled={index === board.stages.length - 1}
                        aria-label={`Move ${stage.label} right`}
                        className="text-steel disabled:opacity-25 leading-none px-1 py-0.5"
                      >
                        ▼
                      </button>
                    </div>
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
