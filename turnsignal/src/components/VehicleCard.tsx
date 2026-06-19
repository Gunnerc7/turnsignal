import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Vehicle } from '../lib/types';
import { moveVehicleToStage } from '../lib/moveVehicle';
import { supabase } from '../lib/supabase';
import { StageConfig } from '../lib/boards';

function daysSince(dateStr: string): number {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function isOverdueLoaner(returnDate: string | null): boolean {
  if (!returnDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(returnDate) < today;
}

// Waiting on Title typically takes longer than a normal recon stage,
// so it gets a more lenient threshold than the rest of the board.
function getThresholds(board: string) {
  if (board === 'waiting_on_title') return { yellow: 5, red: 10 };
  return { yellow: 3, red: 5 };
}

function ageStyles(days: number, thresholds: { yellow: number; red: number }) {
  if (days >= thresholds.red) return 'border-signal-red bg-red-50';
  if (days >= thresholds.yellow) return 'border-signal-amber bg-amber-50';
  return 'border-gray-200 bg-white';
}

function ageBadgeStyles(days: number, thresholds: { yellow: number; red: number }) {
  if (days >= thresholds.red) return 'bg-signal-red text-white';
  if (days >= thresholds.yellow) return 'bg-signal-amber text-white';
  return 'bg-gray-100 text-steel';
}

export default function VehicleCard({
  vehicle,
  otherStages,
  onMoved,
}: {
  vehicle: Vehicle;
  otherStages: StageConfig[];
  onMoved: () => void;
}) {
  const [moving, setMoving] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(vehicle.notes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);
  const days = daysSince(vehicle.stage_entered_at);
  const thresholds = getThresholds(vehicle.board);
  const overdueLoaner = isOverdueLoaner(vehicle.loaner_return_date);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: vehicle.id,
  });

  async function handleMove(newStage: string) {
    if (!newStage || newStage === vehicle.stage) return;
    setMoving(true);
    await moveVehicleToStage(vehicle.id, newStage);
    setMoving(false);
    onMoved();
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    await supabase.from('vehicles').update({ notes: notesDraft.trim() || null }).eq('id', vehicle.id);
    setSavingNotes(false);
    setEditingNotes(false);
    onMoved();
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
      className={`relative rounded-lg border-2 p-3 mb-3 ${ageStyles(days, thresholds)}`}
    >
      <div
        {...listeners}
        {...attributes}
        style={{ touchAction: 'none' }}
        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400"
        aria-label="Drag to move"
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="9" cy="2" r="1.5" />
          <circle cx="9" cy="8" r="1.5" />
          <circle cx="9" cy="14" r="1.5" />
        </svg>
      </div>

      <div className="flex items-start justify-between gap-2 pr-6">
        <p className="font-semibold text-ink text-sm leading-tight">
          {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
          {vehicle.trim ? ` ${vehicle.trim}` : ''}
        </p>
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${ageBadgeStyles(days, thresholds)}`}>
          {days}d
        </span>
      </div>

      <div className="mt-2 text-xs text-steel space-y-0.5">
        {vehicle.stock_number && <p>Stock #{vehicle.stock_number}</p>}
        {vehicle.vin && <p className="truncate">VIN: {vehicle.vin}</p>}
        {vehicle.mileage != null && <p>{vehicle.mileage.toLocaleString()} mi</p>}
        {vehicle.loaned_to && <p>Loaned to: {vehicle.loaned_to}</p>}
        {vehicle.loaner_return_date && (
          <p className={overdueLoaner ? 'text-signal-red font-semibold' : ''}>
            {overdueLoaner ? 'OVERDUE — ' : 'Due back '}
            {new Date(vehicle.loaner_return_date).toLocaleDateString()}
          </p>
        )}
      </div>

      {editingNotes ? (
        <div className="mt-2">
          <textarea
            autoFocus
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            placeholder="Add a note…"
            rows={2}
            className="w-full text-xs border border-gray-300 rounded-md py-1.5 px-2 bg-white text-ink resize-none"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="text-xs bg-signal-blue text-white rounded-md px-3 py-1 font-medium disabled:opacity-60"
            >
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setNotesDraft(vehicle.notes ?? '');
                setEditingNotes(false);
              }}
              className="text-xs text-steel px-3 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : vehicle.notes ? (
        <button
          onClick={() => setEditingNotes(true)}
          className="mt-2 w-full text-left text-xs text-steel italic bg-gray-50 rounded-md px-2 py-1.5 line-clamp-2"
        >
          {vehicle.notes}
        </button>
      ) : (
        <button
          onClick={() => setEditingNotes(true)}
          className="mt-2 text-xs text-signal-blue font-medium"
        >
          + Add note
        </button>
      )}

      {otherStages.length > 0 && (
        <select
          value=""
          disabled={moving}
          onChange={(e) => handleMove(e.target.value)}
          className="mt-2 w-full text-xs border border-gray-300 rounded-md py-1.5 px-2 bg-white text-steel"
        >
          <option value="" disabled>
            {moving ? 'Moving…' : 'Move to…'}
          </option>
          {otherStages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
