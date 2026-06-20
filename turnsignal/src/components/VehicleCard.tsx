import { useEffect, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Vehicle, VehicleNote } from '../lib/types';
import { moveVehicleToStage } from '../lib/moveVehicle';
import { supabase } from '../lib/supabase';
import { StageConfig } from '../lib/boards';
import NotesModal from './NotesModal';

function daysSince(dateStr: string): number {
  const entered = new Date(dateStr);
  const enteredMidnight = new Date(entered.getFullYear(), entered.getMonth(), entered.getDate());
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const diffMs = todayMidnight.getTime() - enteredMidnight.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function isOverdueLoaner(returnDate: string | null): boolean {
  if (!returnDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(returnDate) < today;
}

function formatNoteDate(dateStr: string): string {
  const date = new Date(dateStr);
  const isToday = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return isToday ? `Today, ${time}` : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
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
  return 'before:bg-signal-green';
}

function ageBadgeStyles(days: number, thresholds: { yellow: number; red: number }) {
  if (days >= thresholds.red) return 'bg-signal-red text-white shadow-glowRed';
  if (days >= thresholds.yellow) return 'bg-signal-amber text-white shadow-glowAmber';
  return 'bg-signal-green text-white';
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
  const [toggling, setToggling] = useState(false);
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const days = daysSince(vehicle.stage_entered_at);
  const thresholds = getThresholds(vehicle.board);
  const overdueLoaner = isOverdueLoaner(vehicle.loaner_return_date);
  const vehicleLabel = `${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: vehicle.id,
  });

  async function loadNotes() {
    const { data } = await supabase
      .from('vehicle_notes')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .order('created_at', { ascending: false });
    setNotes(data ?? []);
  }

  useEffect(() => {
    loadNotes();
  }, [vehicle.id]);

  async function handleMove(newStage: string) {
    if (!newStage || newStage === vehicle.stage) return;
    setMoving(true);
    await moveVehicleToStage(vehicle.id, newStage);
    setMoving(false);
    onMoved();
  }

  async function handleToggleComplete() {
    setToggling(true);
    await supabase.from('vehicles').update({ completed: !vehicle.completed }).eq('id', vehicle.id);
    setToggling(false);
    onMoved();
  }

  const latestNote = notes[0];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.3 : vehicle.completed ? 0.6 : 1,
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

      <div className="flex items-start gap-2 pr-7">
        <button
          onClick={handleToggleComplete}
          disabled={toggling}
          aria-label={vehicle.completed ? 'Mark incomplete' : 'Mark complete'}
          className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition ${
            vehicle.completed ? 'bg-signal-blue border-signal-blue' : 'border-gray-300'
          }`}
        >
          {vehicle.completed && (
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 flex items-start justify-between gap-2">
          <p
            className={`font-display font-semibold text-sm leading-tight ${
              vehicle.completed ? 'text-steel line-through' : 'text-ink'
            }`}
          >
            {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
            {vehicle.trim ? ` ${vehicle.trim}` : ''}
          </p>
          <span
            className={`tabular font-display text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${ageBadgeStyles(days, thresholds)}`}
          >
            {days}d
          </span>
        </div>
      </div>

      <div className="mt-2 text-xs text-steel space-y-0.5 pl-7">
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

      <button
        onClick={() => setNotesOpen(true)}
        className="mt-2 w-full text-left text-xs bg-gray-50 rounded-md px-2 py-1.5"
      >
        {latestNote ? (
          <>
            <p className="text-steel italic line-clamp-1">{latestNote.content}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 tabular">
              {formatNoteDate(latestNote.created_at)}
              {notes.length > 1 && ` · +${notes.length - 1} more`}
            </p>
          </>
        ) : (
          <p className="text-signal-blue font-medium">+ Add note</p>
        )}
      </button>

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

      {notesOpen && (
        <NotesModal
          vehicleId={vehicle.id}
          vehicleLabel={vehicleLabel}
          onClose={() => setNotesOpen(false)}
          onChanged={loadNotes}
        />
      )}
    </div>
  );
}
