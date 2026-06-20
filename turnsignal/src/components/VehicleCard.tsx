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

function ageStripe(days: number, thresholds: { yellow: number; red: number }) {
  if (days >= thresholds.red) return 'before:bg-signal-red';
  if (days >= thresholds.yellow) return 'before:bg-signal-amber';
  return 'before:bg-gray-200';
}

function ageBadgeStyles(days: number, thresholds: { yellow: number; red: number }) {
  if (days >= thresholds.red) return 'bg-signal-red text-white shadow-glowRed';
  if (days >= thresholds.yellow) return 'bg-signal-amber text-white shadow-glowAmber';
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
        opacity: isDragging ? 0.3 : 1,
      }}
      className={`relative bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 mb-3 pl-5 transition-opacity duration-150
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-xl ${ageStripe(days, thresholds)}`}
    >
      <div
        {...listeners}
        {...attributes}
        style={{ touchAction: 'none' }}
        className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 active:scale-90 transition"
        aria-label="Drag to move"
      >
        <svg width="14" height="18" viewBox="0 0 12 16" fill="currentColor">
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="2" cy="8" r="1.5" />
          <circle cx="2" cy="14" r="1.5" />
          <circle cx="9" cy="2" r="1.5" />
          <circle cx="9" cy="8" r="1.5" />
          <circle cx="9" cy="14" r="1.5" />
        </svg>
      </div>

      <div className="flex items-start justify-between gap-2 pr-7">
        <p className="font-display font-semibold text-ink text-sm leading-tight">
          {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
          {vehicle.trim ? ` ${vehicle.trim}` : ''}
        </p>
        <span
          className={`tabular font-display text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${ageBadgeStyles(days, thresholds)}`}
        >
          {days}d
        </span>
      </div>

      <div className="mt-2 text-xs text-steel space-y-0.5">
        {vehicle.stock_number && <p className="tabular">Stock #{vehicle.stock_number}</p>}
        {vehicle.vin && <p className="truncate tabular">VIN: {vehicle.vin}</p>}
        {vehicle.mileage != null && <p className="tabular">{vehicle.mileage.toLocaleString()} mi</p>}
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
            className="w-full text-xs border border-gray-300 rounded-md py-1.5 px-2 bg-white text-ink resize-none focus:outline-none focus:ring-2 focus:ring-signal-blue"
          />
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="text-xs bg-signal-blue text-white rounded-md px-3 py-1.5 font-medium disabled:opacity-60"
            >
              {savingNotes ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setNotesDraft(vehicle.notes ?? '');
                setEditingNotes(false);
              }}
              className="text-xs text-steel px-3 py-1.5"
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
          className="mt-2 text-xs text-signal-blue font-medium py-1"
        >
          + Add note
        </button>
      )}

      {otherStages.length > 0 && (
        <select
          value=""
          disabled={moving}
          onChange={(e) => handleMove(e.target.value)}
          className="mt-2 w-full text-xs border border-gray-300 rounded-md py-2 px-2 bg-white text-steel font-medium focus:outline-none focus:ring-2 focus:ring-signal-blue"
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
