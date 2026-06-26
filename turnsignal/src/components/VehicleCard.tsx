import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { useAuth } from '../lib/AuthContext';
import { Vehicle, VehicleNote } from '../lib/types';
import { moveVehicleToStage } from '../lib/moveVehicle';
import { supabase } from '../lib/supabase';
import { BoardConfig } from '../lib/boards';
import { getThresholds } from '../lib/aging';
import NotesModal from './NotesModal';
import StageTimelineModal from './StageTimelineModal';
import AddVehicleModal from './AddVehicleModal';
import PhotosModal from './PhotosModal';

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

// Emails are the only identity we store — the part before the @ reads
// close enough to a short name/initials for a compact byline.
function shortName(email: string | null): string {
  if (!email) return 'Someone';
  return email.split('@')[0];
}

function ageStripe(days: number, thresholds: { yellow: number; red: number } | null) {
  if (!thresholds) return 'before:bg-gray-300';
  if (days >= thresholds.red) return 'before:bg-signal-red';
  if (days >= thresholds.yellow) return 'before:bg-signal-amber';
  return 'before:bg-signal-green';
}

function ageBadgeStyles(days: number, thresholds: { yellow: number; red: number } | null) {
  if (!thresholds) return 'bg-gray-200 text-steel';
  if (days >= thresholds.red) return 'bg-signal-red text-white shadow-glowRed';
  if (days >= thresholds.yellow) return 'bg-signal-amber text-white shadow-glowAmber';
  return 'bg-signal-green text-white';
}

export default function VehicleCard({
  vehicle,
  boards,
  yellowDays,
  redDays,
  onMoved,
}: {
  vehicle: Vehicle;
  boards: BoardConfig[];
  yellowDays: number;
  redDays: number;
  onMoved: () => void;
}) {
  const { session, userName } = useAuth();
  const [moving, setMoving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // Once recon_started_at is set (the moment a vehicle first leaves Inbound),
  // the badge shows total time across every stage since then — it never
  // resets on a stage move. Still in Inbound with no anchor yet? Fall back
  // to the neutral per-stage count from getThresholds returning null.
  const days = daysSince(vehicle.recon_started_at ?? vehicle.stage_entered_at);
  const thresholds = getThresholds(vehicle.stage, yellowDays, redDays);
  const overdueLoaner = isOverdueLoaner(vehicle.loaner_return_date);
  const vehicleLabel = `${vehicle.stock_number ? vehicle.stock_number + '-' : ''}${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
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

  async function handleMove(value: string) {
    const [newBoard, newStage] = value.split('::');
    if (!newBoard || !newStage) return;
    if (newBoard === vehicle.board && newStage === vehicle.stage) return;
    setMoving(true);
    await moveVehicleToStage(vehicle.id, newBoard, newStage);
    setMoving(false);
    onMoved();
  }

  async function handleToggleComplete() {
    setToggling(true);
    const nowCompleting = !vehicle.completed;
    await supabase
      .from('vehicles')
      .update({
        completed: nowCompleting,
        completed_by_email: nowCompleting ? session?.user.email ?? null : null,
        completed_by_name: nowCompleting ? userName : null,
      })
      .eq('id', vehicle.id);
    setToggling(false);
    onMoved();
  }

  const latestNote = notes[0];

  // Completed vehicles collapse down to a single slim row, Planner-style —
  // tap anywhere on the row to pop it back open without un-completing it.
  if (vehicle.completed && !expanded) {
    return (
      <div
        ref={setNodeRef}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition,
          opacity: isDragging ? 0.3 : 0.6,
        }}
        className="relative bg-white rounded-xl shadow-sm border border-gray-200 mb-2 pl-5 flex items-center gap-1 px-3 py-2
          before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-xl before:bg-signal-green"
      >
        <button
          onClick={handleToggleComplete}
          disabled={toggling}
          aria-label="Mark incomplete"
          className="w-5 h-5 rounded-full bg-signal-blue border-2 border-signal-blue flex-shrink-0 flex items-center justify-center"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5L6.5 12L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button
          onClick={() => setExpanded(true)}
          className="flex-1 flex items-center gap-1 text-left text-sm text-steel py-1 min-w-0"
        >
          <span className="line-through truncate">
            {vehicle.stock_number && <span className="font-semibold not-italic">{vehicle.stock_number}-</span>}
            {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
            {vehicle.trim ? ` ${vehicle.trim}` : ''}
          </span>
          {(vehicle.completed_by_name || vehicle.completed_by_email) && (
            <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
              {vehicle.completed_by_name ?? shortName(vehicle.completed_by_email)}
            </span>
          )}
          <span className="text-gray-400 flex-shrink-0">›</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.3 : vehicle.completed ? 0.6 : 1,
      }}
      className={`relative bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 mb-3 pl-5 transition-opacity duration-150
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1.5 before:rounded-l-xl ${ageStripe(days, thresholds)}`}
    >
      {!vehicle.completed && (
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
      )}

      {vehicle.completed && (
        <button
          onClick={() => setExpanded(false)}
          aria-label="Collapse"
          className="absolute top-1 right-1 w-9 h-9 flex items-center justify-center text-gray-300 hover:text-gray-400 active:scale-90 transition text-lg"
        >
          ‹
        </button>
      )}

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
            onClick={() => setEditOpen(true)}
            className={`font-display leading-tight cursor-pointer ${
              vehicle.completed ? 'text-steel line-through' : 'text-ink'
            }`}
          >
            {vehicle.stock_number && <span className="text-base font-bold">{vehicle.stock_number}-</span>}
            <span className="text-sm font-medium">
              {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
              {vehicle.trim ? ` ${vehicle.trim}` : ''}
            </span>
          </p>
          <button
            onClick={() => setTimelineOpen(true)}
            aria-label="View stage timeline"
            className={`tabular font-display text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap active:scale-90 transition ${ageBadgeStyles(days, thresholds)}`}
          >
            {days}d
          </button>
        </div>
      </div>

      {vehicle.has_damage && (
        <p className="mt-1.5 pl-7 inline-flex items-center gap-1 text-xs font-bold text-signal-red">
          ⚠ DAMAGE
        </p>
      )}

      <div onClick={() => setEditOpen(true)} className="mt-2 text-xs text-steel space-y-0.5 pl-7 cursor-pointer">
        {vehicle.color && <p>{vehicle.color}</p>}
        {vehicle.vin && <p className="truncate tabular">VIN: {vehicle.vin}</p>}
        {vehicle.mileage != null && <p className="tabular">{vehicle.mileage.toLocaleString()} mi</p>}
        {vehicle.loaned_to && <p>Loaned to: {vehicle.loaned_to}</p>}
        {vehicle.loaner_return_date && (
          <p className={overdueLoaner ? 'text-signal-red font-semibold' : ''}>
            {overdueLoaner ? 'OVERDUE — ' : 'Due back '}
            {new Date(vehicle.loaner_return_date).toLocaleDateString()}
          </p>
        )}
        {(vehicle.created_by_name || vehicle.created_by_email) && (
          <p className="text-gray-400">Added by {vehicle.created_by_name ?? shortName(vehicle.created_by_email)}</p>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={() => setNotesOpen(true)}
          className="flex-1 text-left text-xs bg-gray-50 rounded-md px-2 py-1.5"
        >
          {latestNote ? (
            <>
              <p className="text-steel italic line-clamp-1">{latestNote.content}</p>
              <p className="text-[10px] text-gray-400 mt-0.5 tabular">
                {latestNote.author_name ?? shortName(latestNote.author_email)} · {formatNoteDate(latestNote.created_at)}
                {notes.length > 1 && ` · +${notes.length - 1} more`}
              </p>
            </>
          ) : (
            <p className="text-signal-blue font-medium">+ Add note</p>
          )}
        </button>

        <button
          onClick={() => setPhotosOpen(true)}
          aria-label="View photos"
          className="bg-gray-50 rounded-md px-2.5 text-steel"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="3.5" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="5.5" cy="7" r="1.2" stroke="currentColor" strokeWidth="1.1" />
            <path d="M2 12l3.5-3 2.5 2 2.5-3 3.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {(() => {
        const otherDestinations = boards
          .map((b) => ({
            board: b,
            stages: b.stages.filter((s) => !(b.key === vehicle.board && s.key === vehicle.stage)),
          }))
          .filter((g) => g.stages.length > 0);

        return (
          <select
            value=""
            disabled={moving}
            onChange={(e) => handleMove(e.target.value)}
            className="mt-2 w-full text-xs border border-gray-300 rounded-md py-2 px-2 bg-white text-steel font-medium focus:outline-none focus:ring-2 focus:ring-signal-blue"
          >
            <option value="" disabled>
              {moving ? 'Moving…' : 'Move to…'}
            </option>
            {otherDestinations.map((group) => (
              <optgroup key={group.board.key} label={group.board.label}>
                {group.stages.map((s) => (
                  <option key={`${group.board.key}::${s.key}`} value={`${group.board.key}::${s.key}`}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        );
      })()}

      {notesOpen && (
        <NotesModal
          vehicleId={vehicle.id}
          vehicleLabel={vehicleLabel}
          onClose={() => setNotesOpen(false)}
          onChanged={loadNotes}
        />
      )}

      {timelineOpen && (
        <StageTimelineModal
          vehicleId={vehicle.id}
          vehicleLabel={vehicleLabel}
          board={vehicle.board}
          boards={boards}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {photosOpen && (
        <PhotosModal
          vehicleId={vehicle.id}
          dealershipId={vehicle.dealership_id}
          vehicleLabel={vehicleLabel}
          onClose={() => setPhotosOpen(false)}
        />
      )}

      {editOpen && (
        <AddVehicleModal
          dealershipId={vehicle.dealership_id}
          boards={boards}
          board={vehicle.board}
          stage={vehicle.stage}
          vehicle={vehicle}
          onClose={() => setEditOpen(false)}
          onCreated={() => {
            setEditOpen(false);
            onMoved();
          }}
        />
      )}
    </div>
  );
}
