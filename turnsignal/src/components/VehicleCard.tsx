import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { useAuth } from '../lib/AuthContext';
import { Vehicle, VehicleNote } from '../lib/types';
import { moveVehicleToStage, MoveUndoSnapshot } from '../lib/moveVehicle';
import { supabase } from '../lib/supabase';
import { BoardConfig } from '../lib/boards';
import { getThresholds } from '../lib/aging';
import { daysSince, carryingCostSoFar } from '../lib/dates';
import NotesModal from './NotesModal';
import StageTimelineModal from './StageTimelineModal';
import AddVehicleModal from './AddVehicleModal';
import PhotosModal from './PhotosModal';
import TitleStatusIcon, { titleStatusLabel } from './TitleStatusIcon';
import TitleStatusModal from './TitleStatusModal';

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

function ageStripeColor(days: number, thresholds: { yellow: number; red: number } | null): string {
  if (!thresholds) return '#D1D5DB';
  if (days >= thresholds.red) return '#E5483D';
  if (days >= thresholds.yellow) return '#F5A623';
  return '#1FA463';
}

// Loaners board cards skip aging colors entirely (that stripe would
// otherwise sit unused, always gray) — repurposed here instead, so a
// quick scan down the column shows at a glance which loaners are free.
function loanerStripeColor(status: 'here' | 'out' | null): string {
  return status === 'out' ? '#2D5BFF' : '#1FA463';
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
  newRatePerDay,
  usedRatePerDay,
  isOwner,
  isManager,
  highlighted,
  onAnyModalOpenChange,
  photoCount = 0,
  compactMode,
  onMoveWithUndo,
  onMoved,
}: {
  vehicle: Vehicle;
  boards: BoardConfig[];
  yellowDays: number;
  redDays: number;
  newRatePerDay: number;
  usedRatePerDay: number;
  isOwner: boolean;
  isManager: boolean;
  highlighted?: boolean;
  onAnyModalOpenChange?: (open: boolean) => void;
  photoCount?: number;
  compactMode?: boolean;
  onMoveWithUndo?: (snapshot: MoveUndoSnapshot, destinationLabel: string) => void;
  onMoved: () => void;
}) {
  const { session, userName } = useAuth();
  const [moving, setMoving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [togglingLoaner, setTogglingLoaner] = useState(false);
  const [togglingCarryingCostTracking, setTogglingCarryingCostTracking] = useState(false);
  const [togglingCarryingCostExcluded, setTogglingCarryingCostExcluded] = useState(false);
  const [notes, setNotes] = useState<VehicleNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [titleStatusOpen, setTitleStatusOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canEditTitleStatus = isOwner || isManager;

  // Reports whenever any of this card's own modals open or close. Used to
  // hide the board's floating scan button while one is open — that button
  // is a fixed-position overlay of its own, and a card-level modal (Notes,
  // Timeline, Photos, etc.) opening at the same time was letting the two
  // visually collide, with the button ending up on top of modal content
  // instead of safely behind it.
  useEffect(() => {
    onAnyModalOpenChange?.(notesOpen || timelineOpen || editOpen || photosOpen || titleStatusOpen);
  }, [notesOpen, timelineOpen, editOpen, photosOpen, titleStatusOpen, onAnyModalOpenChange]);
  // Once recon_started_at is set (the moment a vehicle first leaves Inbound),
  // the badge shows total time across every stage since then — it never
  // resets on a stage move. Still in Inbound with no anchor yet? Fall back
  // to the neutral per-stage count from getThresholds returning null.
  const days = daysSince(vehicle.recon_started_at ?? vehicle.stage_entered_at);
  const thresholds = getThresholds(vehicle.board, vehicle.stage, yellowDays, redDays);
  const overdueLoaner = !vehicle.completed && isOverdueLoaner(vehicle.loaner_return_date);
  const carryingCost = carryingCostSoFar(vehicle, newRatePerDay, usedRatePerDay);
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
    const { undo } = await moveVehicleToStage(vehicle.id, newBoard, newStage, session?.user.id ?? null, userName);
    setMoving(false);
    if (undo && onMoveWithUndo) {
      const b = boards.find((bd) => bd.key === newBoard);
      const s = b?.stages.find((st) => st.key === newStage);
      onMoveWithUndo(undo, b ? `${b.label}${s ? ` · ${s.label}` : ''}` : newBoard);
    }
    onMoved();
  }

  async function handleToggleComplete() {
    setToggling(true);
    const nowCompleting = !vehicle.completed;
    const now = new Date().toISOString();
    await supabase
      .from('vehicles')
      .update({
        completed: nowCompleting,
        completed_by_email: nowCompleting ? session?.user.email ?? null : null,
        completed_by_name: nowCompleting ? userName : null,
        completed_at: nowCompleting ? now : null,
        // A completed loaner isn't "here" or "out" anymore — clears the
        // same way it does when a vehicle leaves the Loaners board
        // entirely, so the badge never lingers on a finished card.
        ...(nowCompleting && vehicle.board === 'loaners' ? { loaner_status: null } : {}),
      })
      .eq('id', vehicle.id);
    setToggling(false);
    onMoved();
  }

  async function handleToggleLoanerStatus() {
    setTogglingLoaner(true);
    const next = vehicle.loaner_status === 'out' ? 'here' : 'out';
    await supabase.from('vehicles').update({ loaner_status: next }).eq('id', vehicle.id);
    setTogglingLoaner(false);
    onMoved();
  }

  async function handleToggleCarryingCostTracking() {
    setTogglingCarryingCostTracking(true);
    await supabase
      .from('vehicles')
      .update({ loaner_track_carrying_cost: !vehicle.loaner_track_carrying_cost })
      .eq('id', vehicle.id);
    setTogglingCarryingCostTracking(false);
    onMoved();
  }

  async function handleToggleCarryingCostExcluded() {
    setTogglingCarryingCostExcluded(true);
    await supabase
      .from('vehicles')
      .update({ carrying_cost_excluded: !vehicle.carrying_cost_excluded })
      .eq('id', vehicle.id);
    setTogglingCarryingCostExcluded(false);
    onMoved();
  }

  const latestNote = notes[0];

  // Completed vehicles collapse down to a single slim row, Planner-style —
  // tap anywhere on the row to pop it back open without un-completing it.
  // A search result landing on a completed vehicle auto-expands it too,
  // via the `highlighted` prop, so the search doesn't point at a row
  // that's still hidden behind a collapsed summary.
  if (vehicle.completed && !expanded && !highlighted) {
    return (
      <div
        id={`vehicle-card-${vehicle.id}`}
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

  // Compact/collapsed board view — a personal, board-wide toggle (not tied
  // to this specific vehicle) that shows just enough to identify a car at
  // a glance: stock number and year/make/model. Only applies to active
  // vehicles — completed ones already have their own collapsed row above.
  // Drag-and-drop still works here via the same useSortable handles as
  // the full card; tapping the row opens full detail directly, since
  // there's no extra info to "expand into" in place.
  if (compactMode && !vehicle.completed && !highlighted) {
    return (
      <div
        id={`vehicle-card-${vehicle.id}`}
        ref={setNodeRef}
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition,
          opacity: isDragging ? 0.3 : 1,
        }}
        className="relative bg-white rounded-lg shadow-sm border border-gray-200 mb-1.5 flex items-center gap-2 pl-5 pr-1 py-2"
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-lg"
          style={{
            backgroundColor:
              vehicle.board === 'loaners' ? loanerStripeColor(vehicle.loaner_status) : ageStripeColor(days, thresholds),
          }}
        />
        <button onClick={() => setEditOpen(true)} className="flex-1 text-left min-w-0 py-1">
          <span className="text-sm text-ink truncate block">
            {vehicle.stock_number && <span className="font-semibold">{vehicle.stock_number}-</span>}
            {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
          </span>
        </button>
        <div
          {...listeners}
          {...attributes}
          style={{ touchAction: 'none' }}
          className="w-9 h-9 flex-shrink-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 active:scale-90 transition"
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

        {editOpen &&
          createPortal(
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
            />,
            document.body
          )}
      </div>
    );
  }

  return (
    <div
      id={`vehicle-card-${vehicle.id}`}
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
        opacity: isDragging ? 0.3 : 1,
      }}
      className={`relative bg-white rounded-xl shadow-sm border border-gray-200 p-3.5 mb-3 pl-5 transition-all duration-300
        ${highlighted ? 'ring-2 ring-signal-blue shadow-lift' : ''}`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl"
        style={{
          backgroundColor:
            vehicle.board === 'loaners' ? loanerStripeColor(vehicle.loaner_status) : ageStripeColor(days, thresholds),
        }}
      />
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

      {vehicle.board === 'loaners' && !vehicle.completed && (
        <button
          onClick={handleToggleLoanerStatus}
          disabled={togglingLoaner}
          className={`mt-2 ml-7 w-[calc(100%-1.75rem)] text-sm font-semibold rounded-lg py-2 flex items-center justify-center gap-1.5 active:scale-[0.98] transition disabled:opacity-60 ${
            vehicle.loaner_status === 'out'
              ? 'bg-signal-blue/10 text-signal-blue'
              : 'bg-signal-green/10 text-signal-green'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${vehicle.loaner_status === 'out' ? 'bg-signal-blue' : 'bg-signal-green'}`} />
          {vehicle.loaner_status === 'out' ? 'Out with Customer' : 'Here / Available'}
        </button>
      )}

      {vehicle.board === 'loaners' && !vehicle.completed && vehicle.loaner_return_date && (
        <p className={`mt-1.5 ml-7 text-sm font-semibold ${overdueLoaner ? 'text-signal-red' : 'text-ink'}`}>
          {overdueLoaner ? '⚠ Overdue — was due ' : '📅 Due back '}
          {new Date(vehicle.loaner_return_date).toLocaleDateString()}
        </p>
      )}

      {vehicle.has_damage && (
        <p className="mt-1.5 pl-7 inline-flex items-center gap-1 text-xs font-bold text-signal-red">
          ⚠ DAMAGE
        </p>
      )}

      {carryingCost > 0 && (
        <p className="mt-1.5 pl-7 text-sm font-bold text-ink tabular">
          ${carryingCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
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
        {vehicle.assigned_to_name && (
          <p className="text-ink font-medium">👤 Assigned: {vehicle.assigned_to_name}</p>
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
          aria-label={photoCount > 0 ? `View ${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'View photos'}
          className={`relative rounded-md px-2.5 ${
            photoCount > 0 ? 'bg-signal-blue/10 text-signal-blue' : 'bg-gray-50 text-steel'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect
              x="1.5"
              y="3.5"
              width="13"
              height="10"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.3"
              fill={photoCount > 0 ? 'currentColor' : 'none'}
              fillOpacity={photoCount > 0 ? 0.12 : 0}
            />
            <circle cx="5.5" cy="7" r="1.2" stroke="currentColor" strokeWidth="1.1" />
            <path d="M2 12l3.5-3 2.5 2 2.5-3 3.5 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {photoCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-signal-blue text-white text-[10px] font-bold flex items-center justify-center">
              {photoCount > 9 ? '9+' : photoCount}
            </span>
          )}
        </button>

        {canEditTitleStatus && vehicle.board !== 'loaners' && vehicle.stage !== 'inbound_trade_in' && !vehicle.completed && (
          <button
            onClick={handleToggleCarryingCostExcluded}
            disabled={togglingCarryingCostExcluded}
            aria-label={
              vehicle.carrying_cost_excluded
                ? 'Carrying cost excluded for this vehicle — tap to include it again'
                : 'Exclude this vehicle from carrying cost'
            }
            className={`rounded-md px-2.5 disabled:opacity-60 ${
              vehicle.carrying_cost_excluded ? 'bg-signal-amber/10 text-signal-amber' : 'bg-gray-50 text-steel'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 4.5v7M6 10.2c0 .8.9 1.3 2 1.3s2-.6 2-1.4c0-1-.8-1.3-2-1.6-1.2-.3-2-.7-2-1.6 0-.8.9-1.4 2-1.4s2 .5 2 1.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              {vehicle.carrying_cost_excluded && (
                <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.3" />
              )}
            </svg>
          </button>
        )}

        {canEditTitleStatus && vehicle.board === 'loaners' && !vehicle.completed && (
          <button
            onClick={handleToggleCarryingCostTracking}
            disabled={togglingCarryingCostTracking}
            aria-label={
              vehicle.loaner_track_carrying_cost
                ? 'Carrying cost is tracking for this loaner — tap to turn off'
                : 'Turn on carrying cost tracking for this loaner'
            }
            className={`rounded-md px-2.5 disabled:opacity-60 ${
              vehicle.loaner_track_carrying_cost ? 'bg-signal-amber/10 text-signal-amber' : 'bg-gray-50 text-steel'
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 4.5v7M6 10.2c0 .8.9 1.3 2 1.3s2-.6 2-1.4c0-1-.8-1.3-2-1.6-1.2-.3-2-.7-2-1.6 0-.8.9-1.4 2-1.4s2 .5 2 1.3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              {!vehicle.loaner_track_carrying_cost && (
                <line x1="2.5" y1="13.5" x2="13.5" y2="2.5" stroke="currentColor" strokeWidth="1.3" />
              )}
            </svg>
          </button>
        )}

        {canEditTitleStatus ? (
          <button
            onClick={() => setTitleStatusOpen(true)}
            aria-label="Set title status"
            title={titleStatusLabel(vehicle.title_status)}
            className="bg-gray-50 rounded-md px-2.5 flex items-center justify-center"
          >
            <TitleStatusIcon status={vehicle.title_status} />
          </button>
        ) : (
          <span
            aria-label={`Title status: ${titleStatusLabel(vehicle.title_status)}`}
            title={titleStatusLabel(vehicle.title_status)}
            className="bg-gray-50 rounded-md px-2.5 flex items-center justify-center"
          >
            <TitleStatusIcon status={vehicle.title_status} />
          </span>
        )}
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

      {/* Every modal below is rendered via a portal straight to
          document.body, deliberately escaping this card's nested position
          inside the board's scrolling containers (the horizontal board
          scroll, then the column's own vertical scroll). Safari has a
          long-documented bug — not present in Chrome, which is why this
          worked there and not here — where a "fixed, cover-the-whole-
          screen" element loses that ability when it's a DOM descendant of
          a scrolling container: instead of covering everything, it gets
          visually trapped inside that scrolling area. Portaling to
          document.body means none of these are descendants of any
          scrolling ancestor anymore, so they render correctly everywhere. */}
      {createPortal(
        <>
          {notesOpen && (
            <NotesModal
              vehicleId={vehicle.id}
              vehicleLabel={vehicleLabel}
              dealershipId={vehicle.dealership_id}
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
              isOwner={isOwner}
              isManager={isManager}
              onClose={() => setTimelineOpen(false)}
              onHistoryChanged={onMoved}
            />
          )}

          {photosOpen && (
            <PhotosModal
              vehicleId={vehicle.id}
              dealershipId={vehicle.dealership_id}
              vehicleLabel={vehicleLabel}
              onClose={() => {
                setPhotosOpen(false);
                onMoved();
              }}
            />
          )}

          {titleStatusOpen && (
            <TitleStatusModal
              vehicleId={vehicle.id}
              vehicleLabel={vehicleLabel}
              currentStatus={vehicle.title_status}
              onClose={() => setTitleStatusOpen(false)}
              onSaved={onMoved}
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
        </>,
        document.body
      )}
    </div>
  );
}
