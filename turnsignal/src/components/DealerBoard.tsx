import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DndContext,
  defaultDropAnimationSideEffects,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { supabase } from '../lib/supabase';
import { moveVehicleToStage, reorderWithinStage } from '../lib/moveVehicle';
import { BoardConfig, fetchBoards, getBoard } from '../lib/boards';
import { Vehicle } from '../lib/types';
import KanbanColumn from './KanbanColumn';
import AddVehicleModal from './AddVehicleModal';
import VehicleCard from './VehicleCard';
import ManageBoardsModal from './ManageBoardsModal';
import DealershipSettingsModal from './DealershipSettingsModal';
import TeamRolesModal from './TeamRolesModal';
import ScanToMoveModal from './ScanToMoveModal';

const dropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
};

export default function DealerBoard({
  dealershipId,
  isOwner,
  isManager,
  refreshKey,
}: {
  dealershipId: string;
  isOwner: boolean;
  isManager: boolean;
  refreshKey?: number;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [boards, setBoards] = useState<BoardConfig[]>([]);
  // Restore the last-active board from sessionStorage — this is what
  // survives iOS Safari tab discards and comes back to the right column
  // instead of defaulting to Main Board every time.
  const [activeBoardKey, setActiveBoardKey] = useState(
    () => sessionStorage.getItem(`ts-board-${dealershipId}`) ?? 'main'
  );
  const [hasDraft, setHasDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<
    { board: string; stage: string; restoreDraft?: boolean; initialVin?: string } | null
  >(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manageBoardsOpen, setManageBoardsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [yellowDays, setYellowDays] = useState(3);
  const [redDays, setRedDays] = useState(5);
  const [newRatePerDay, setNewRatePerDay] = useState(0);
  const [usedRatePerDay, setUsedRatePerDay] = useState(0);
  const [draggingVehicle, setDraggingVehicle] = useState<Vehicle | null>(null);
  // The stage a vehicle was in before the drag started — used at drop time
  // to know whether a real stage change happened (and stage history needs
  // updating), separate from whatever it's been previewed into mid-drag.
  const dragOriginStage = useRef<string | null>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);

  // ── Search ────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedVehicleId, setHighlightedVehicleId] = useState<string | null>(null);
  const pendingScrollVehicleId = useRef<string | null>(null);

  function scrollToAndHighlight(vehicleId: string) {
    setHighlightedVehicleId(vehicleId);
    requestAnimationFrame(() => {
      document
        .getElementById(`vehicle-card-${vehicleId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    });
    setTimeout(() => {
      setHighlightedVehicleId((current) => (current === vehicleId ? null : current));
    }, 2500);
  }

  function handleSearchSelect(vehicle: Vehicle) {
    setSearchQuery('');
    setSearchOpen(false);
    if (vehicle.board !== activeBoardKey) {
      // Switching tabs unmounts the current board's DOM and mounts the
      // target one — the scroll/highlight has to wait for that to finish,
      // so it's queued here and picked up by the effect below once the
      // new board's columns actually exist to scroll to.
      pendingScrollVehicleId.current = vehicle.id;
      setActiveBoardKey(vehicle.board);
    } else {
      scrollToAndHighlight(vehicle.id);
    }
  }

  useEffect(() => {
    if (pendingScrollVehicleId.current) {
      const id = pendingScrollVehicleId.current;
      pendingScrollVehicleId.current = null;
      setTimeout(() => scrollToAndHighlight(id), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardKey]);

  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const scored = vehicles
      .map((v) => {
        const haystack = `${v.stock_number ?? ''} ${v.vin ?? ''} ${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''} ${v.trim ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return null;
        const isExact = v.stock_number?.toLowerCase() === q || v.vin?.toLowerCase() === q;
        return { vehicle: v, isExact };
      })
      .filter((r): r is { vehicle: Vehicle; isExact: boolean } => r !== null)
      .sort((a, b) => Number(b.isExact) - Number(a.isExact));
    return scored.slice(0, 10);
  })();

  function locationLabelFor(vehicle: Vehicle): string {
    const b = boards.find((bd) => bd.key === vehicle.board);
    const s = b?.stages.find((st) => st.key === vehicle.stage);
    return b ? `${b.label}${s ? ` · ${s.label}` : ''}` : vehicle.board;
  }

  // A small activation distance means a normal tap (e.g. opening the dropdown)
  // doesn't accidentally start a drag — only a deliberate press-and-move does.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('dealership_id', dealershipId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    if (vehiclesError) {
      setError(vehiclesError.message);
    } else {
      setVehicles(data ?? []);
    }
    setLoading(false);
  }, [dealershipId]);

  const loadBoards = useCallback(async () => {
    const fetched = await fetchBoards(dealershipId);
    setBoards(fetched);
  }, [dealershipId]);

  const loadThresholds = useCallback(async () => {
    const { data } = await supabase
      .from('dealerships')
      .select('yellow_threshold_days, red_threshold_days, new_carrying_cost_per_day, used_carrying_cost_per_day')
      .eq('id', dealershipId)
      .single();
    setYellowDays(data?.yellow_threshold_days ?? 3);
    setRedDays(data?.red_threshold_days ?? 5);
    setNewRatePerDay(data?.new_carrying_cost_per_day ?? 0);
    setUsedRatePerDay(data?.used_carrying_cost_per_day ?? 0);
  }, [dealershipId]);

  useEffect(() => {
    loadVehicles();
    loadBoards();
    loadThresholds();
  }, [loadVehicles, loadBoards, loadThresholds, refreshKey]);

  // If the currently selected tab no longer exists (e.g. it was just
  // deleted, or this is the first load), fall back to the first board.
  useEffect(() => {
    if (boards.length > 0 && !boards.find((b) => b.key === activeBoardKey)) {
      setActiveBoardKey(boards[0].key);
    }
  }, [boards, activeBoardKey]);

  // Without this, switching tabs (or just opening the board) can leave you
  // scrolled wherever the previous board happened to be, instead of always
  // starting at the first column.
  useEffect(() => {
    sessionStorage.setItem(`ts-board-${dealershipId}`, activeBoardKey);
  }, [activeBoardKey, dealershipId]);

  useEffect(() => {
    boardScrollRef.current?.scrollTo({ left: 0 });
  }, [activeBoardKey]);

  // Check for a saved add-vehicle draft from a previous session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('ts-add-draft');
      if (raw) {
        const draft = JSON.parse(raw);
        setHasDraft(draft.dealershipId === dealershipId);
      }
    } catch {
      sessionStorage.removeItem('ts-add-draft');
    }
  }, [dealershipId]);

  const [liveFlash, setLiveFlash] = useState(false);

  // Real-time: whenever any vehicle in this dealership changes (moved,
  // edited, added, deleted) re-fetch so every user sees the same board
  // without needing to manually refresh. Debounced 300 ms so a rapid
  // sequence of drag-and-drops (which each fire a DB write) coalesces
  // into one reload rather than a storm.
  useEffect(() => {
    const debounceRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };

    const channel = supabase
      .channel(`vehicles-realtime-${dealershipId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vehicles', filter: `dealership_id=eq.${dealershipId}` },
        () => {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => {
            loadVehicles();
            setLiveFlash(true);
            setTimeout(() => setLiveFlash(false), 1200);
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [dealershipId, loadVehicles]);

  function handleDragStart(event: DragStartEvent) {
    const vehicle = vehicles.find((v) => v.id === event.active.id);
    setDraggingVehicle(vehicle ?? null);
    dragOriginStage.current = vehicle?.stage ?? null;
  }

  // Fires continuously while dragging. dnd-kit automatically previews
  // reordering *within* a column on its own — but it can only do that for
  // columns whose item list already contains the dragged card. Crossing
  // into a different column needs us to actually move the card into that
  // column's list ourselves, live, which is what creates the "snap" feel.
  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    setVehicles((prev) => {
      const activeVehicle = prev.find((v) => v.id === activeId);
      if (!activeVehicle) return prev;

      const overVehicle = prev.find((v) => v.id === overId);
      const destinationStage = overVehicle ? overVehicle.stage : overId;

      if (activeVehicle.stage === destinationStage) return prev;

      return prev.map((v) => (v.id === activeId ? { ...v, stage: destinationStage } : v));
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingVehicle(null);
    const activeId = event.active.id as string;
    const overId = event.over?.id as string | undefined;
    const originStage = dragOriginStage.current;
    dragOriginStage.current = null;

    if (!overId) return;

    // By drop time, onDragOver may have already moved this vehicle's stage
    // in local state to wherever it was last hovering — that's its real
    // destination now, regardless of where the pointer technically released.
    const activeVehicle = vehicles.find((v) => v.id === activeId);
    if (!activeVehicle) return;
    const destinationStage = activeVehicle.stage;

    const stageSiblings = vehicles
      .filter((v) => v.board === activeVehicle.board && v.stage === destinationStage && v.id !== activeId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const overVehicle = vehicles.find((v) => v.id === overId);
    const insertIndex = overVehicle
      ? Math.max(0, stageSiblings.findIndex((v) => v.id === overId))
      : stageSiblings.length;

    const newOrderIds = [
      ...stageSiblings.slice(0, insertIndex).map((v) => v.id),
      activeId,
      ...stageSiblings.slice(insertIndex).map((v) => v.id),
    ];

    if (originStage && originStage !== destinationStage) {
      await moveVehicleToStage(activeId, activeVehicle.board, destinationStage);
    }
    await reorderWithinStage(newOrderIds);
    loadVehicles();
  }

  const activeBoard = getBoard(boards, activeBoardKey);

  if (loading || boards.length === 0) {
    return <p className="text-steel text-sm p-4">Loading…</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <nav className="flex items-center gap-1.5 flex-wrap px-4 py-2.5 bg-white border-b border-gray-200">
        {boards.map((b) => (
          <button
            key={b.key}
            onClick={() => setActiveBoardKey(b.key)}
            className={`font-display px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              activeBoardKey === b.key ? 'bg-signal-blue text-white' : 'text-steel bg-asphalt'
            }`}
          >
            {b.label}
          </button>
        ))}
        {(isOwner || isManager) && (
          <button
            onClick={() => setManageBoardsOpen(true)}
            className="ml-1 text-steel text-sm whitespace-nowrap px-2"
          >
            ⚙ Manage
          </button>
        )}
        {(isOwner || isManager) && (
          <button onClick={() => setSettingsOpen(true)} className="text-steel text-sm whitespace-nowrap px-2">
            🎨 Aging colors
          </button>
        )}
        {(isOwner || isManager) && (
          <button onClick={() => setRolesOpen(true)} className="text-steel text-sm whitespace-nowrap px-2">
            👤 Roles
          </button>
        )}
        <div className="relative ml-auto flex items-center gap-2">
          <button
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Search vehicles"
            className="text-steel text-sm whitespace-nowrap px-2 py-1"
          >
            🔍
          </button>
          <span
            title="Live"
            className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-500 ${
              liveFlash ? 'bg-signal-green shadow-glowGreen scale-125' : 'bg-signal-green opacity-60'
            }`}
            aria-label="Live updates active"
          />

          {searchOpen && (
            <>
              <button
                className="fixed inset-0 z-40 cursor-default"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
              />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lift border border-gray-200 w-72 max-h-96 overflow-y-auto z-50">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Stock #, VIN, or model…"
                    className="w-full text-sm border border-gray-300 rounded-md px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-signal-blue"
                  />
                </div>
                {searchQuery.trim() && (
                  searchResults.length === 0 ? (
                    <p className="text-steel text-sm p-3">No matches.</p>
                  ) : (
                    searchResults.map(({ vehicle }) => (
                      <button
                        key={vehicle.id}
                        onClick={() => handleSearchSelect(vehicle)}
                        className="w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-asphalt"
                      >
                        <p className="text-sm font-medium text-ink truncate">
                          {vehicle.stock_number ? `${vehicle.stock_number}-` : ''}
                          {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
                        </p>
                        <p className="text-xs text-steel">
                          {locationLabelFor(vehicle)}
                          {vehicle.completed && ' · Completed'}
                        </p>
                      </button>
                    ))
                  )
                )}
              </div>
            </>
          )}
        </div>
      </nav>

      {error && <p className="text-signal-red text-sm px-4 py-2">{error}</p>}

      {activeBoard && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <main ref={boardScrollRef} className="board-scroll flex-1 min-w-0 overflow-x-auto p-4">
            <div className="snap-row flex gap-4 h-full">
              {activeBoard.stages.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  label={stage.label}
                  stageKey={stage.key}
                  boards={boards}
                  yellowDays={yellowDays}
                  redDays={redDays}
                  newRatePerDay={newRatePerDay}
                  usedRatePerDay={usedRatePerDay}
                  isOwner={isOwner}
                  isManager={isManager}
                  highlightedVehicleId={highlightedVehicleId}
                  vehicles={vehicles
                    .filter((v) => v.board === activeBoard.key && v.stage === stage.key)
                    .sort((a, b) => {
                      if (a.completed !== b.completed) return a.completed ? 1 : -1;
                      return (a.position ?? 0) - (b.position ?? 0);
                    })}
                  onAddClick={() => setAddModal({ board: activeBoard.key, stage: stage.key })}
                  onMoved={loadVehicles}
                />
              ))}
            </div>
          </main>

          <DragOverlay dropAnimation={dropAnimation}>
            {draggingVehicle && (
              <div className="w-[86vw] sm:w-72 rotate-1 scale-105 shadow-lift rounded-xl">
                <VehicleCard
                  vehicle={draggingVehicle}
                  boards={boards}
                  yellowDays={yellowDays}
                  redDays={redDays}
                  newRatePerDay={newRatePerDay}
                  usedRatePerDay={usedRatePerDay}
                  isOwner={isOwner}
                  isManager={isManager}
                  onMoved={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <button
        onClick={() => setScanModalOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-ink text-white shadow-lift flex items-center justify-center active:scale-90 transition"
        aria-label="Scan a VIN"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 7V5a1 1 0 011-1h2M20 7V5a1 1 0 00-1-1h-2M4 17v2a1 1 0 001 1h2M20 17v2a1 1 0 01-1 1h-2M4 12h16"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {scanModalOpen && (
        <ScanToMoveModal
          boards={boards}
          vehicles={vehicles}
          onClose={() => setScanModalOpen(false)}
          onMoved={loadVehicles}
          onNotFound={(vin) =>
            setAddModal({ board: 'main', stage: 'inbound_trade_in', initialVin: vin })
          }
        />
      )}

      {hasDraft && !addModal && (
        <div className="flex items-center justify-between px-4 py-2 bg-signal-amber/10 border-b border-signal-amber/30 text-sm">
          <span className="text-ink">You have an unsaved vehicle draft.</span>
          <div className="flex gap-3">
            <button
              onClick={() => {
                sessionStorage.removeItem('ts-add-draft');
                setHasDraft(false);
              }}
              className="text-steel"
            >
              Discard
            </button>
            <button
              onClick={() => setAddModal({ board: 'main', stage: 'inbound_trade_in', restoreDraft: true })}
              className="font-semibold text-signal-blue"
            >
              Resume →
            </button>
          </div>
        </div>
      )}

      {addModal && (
        <AddVehicleModal
          dealershipId={dealershipId}
          boards={boards}
          board={addModal.board}
          stage={addModal.stage}
          restoreDraft={addModal.restoreDraft ?? false}
          initialVin={addModal.initialVin}
          onClose={() => setAddModal(null)}
          onCreated={() => {
            setAddModal(null);
            setHasDraft(false);
            loadVehicles();
          }}
        />
      )}

      {manageBoardsOpen && (
        <ManageBoardsModal
          dealershipId={dealershipId}
          boards={boards}
          onClose={() => setManageBoardsOpen(false)}
          onChanged={loadBoards}
        />
      )}

      {settingsOpen && (
        <DealershipSettingsModal
          dealershipId={dealershipId}
          yellowDays={yellowDays}
          redDays={redDays}
          onClose={() => setSettingsOpen(false)}
          onChanged={loadThresholds}
        />
      )}

      {rolesOpen && <TeamRolesModal dealershipId={dealershipId} onClose={() => setRolesOpen(false)} />}
    </div>
  );
}
