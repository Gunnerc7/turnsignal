import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
import { useAuth } from '../lib/AuthContext';
import { moveVehicleToStage, reorderWithinStage, undoMove, MoveUndoSnapshot } from '../lib/moveVehicle';
import { BoardConfig, fetchBoards, getBoard } from '../lib/boards';
import { Vehicle } from '../lib/types';
import KanbanColumn from './KanbanColumn';
import AddVehicleModal from './AddVehicleModal';
import VehicleCard from './VehicleCard';
import ManageBoardsModal from './ManageBoardsModal';
import DealershipSettingsModal from './DealershipSettingsModal';
import TeamRolesModal from './TeamRolesModal';
import SettingsModal from './SettingsModal';
import CarryingCostRatesModal from './CarryingCostRatesModal';
import ScanToMoveModal from './ScanToMoveModal';
import LiveInventoryTable from './LiveInventoryTable';
import ImportInventoryModal from './ImportInventoryModal';

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
  navigateTarget,
  onNavigateHandled,
  groupId,
  onNavigateToSiblingStore,
  onOpenInvite,
  onOpenName,
  onOpenPassword,
}: {
  dealershipId: string;
  isOwner: boolean;
  isManager: boolean;
  refreshKey?: number;
  navigateTarget?: { vehicleId: string; board: string } | null;
  onNavigateHandled?: () => void;
  groupId?: string | null;
  onNavigateToSiblingStore?: (dealership: { id: string; name: string }, vehicleId: string, board: string) => void;
  onOpenInvite: () => void;
  onOpenName: () => void;
  onOpenPassword: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Map<string, number>>(new Map());
  const { session, userName } = useAuth();
  const [showLiveInventory, setShowLiveInventory] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [liveInventoryRefreshKey, setLiveInventoryRefreshKey] = useState(0);
  // Personal, board-wide toggle — not a dealership setting, so it's kept
  // in sessionStorage per-browser like other UI-only preferences (active
  // board tab, draft form state) rather than the database.
  const [compactMode, setCompactMode] = useState(() => sessionStorage.getItem('ts-compact-mode') === '1');
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
    { board?: string; stage?: string; restoreDraft?: boolean; initialVin?: string } | null
  >(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manageBoardsOpen, setManageBoardsOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [ratesModalOpen, setRatesModalOpen] = useState(false);
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
  // Desktop-only additions: a synchronized scrollbar at the top (so you
  // don't have to scroll all the way down just to see it), and
  // click-and-drag panning on empty board space, Planner-style.
  const topScrollRef = useRef<HTMLDivElement>(null);
  const boardRowRef = useRef<HTMLDivElement>(null);
  const [contentWidth, setContentWidth] = useState(0);
  const isSyncingScroll = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; scrollLeft: number } | null>(null);

  // ── Search ────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Cross-store search — only relevant when this dealership is part of a
  // group. Sibling store names are fetched once per group, not per
  // keystroke; the actual vehicle search against them is debounced.
  const [siblingStores, setSiblingStores] = useState<{ id: string; name: string }[]>([]);
  const [groupSearchResults, setGroupSearchResults] = useState<
    { id: string; board: string; stock_number: string | null; vin: string | null; year: number | null; make: string | null; model: string | null; dealershipId: string; dealershipName: string }[]
  >([]);
  const [groupSearching, setGroupSearching] = useState(false);

  useEffect(() => {
    if (!groupId) {
      setSiblingStores([]);
      return;
    }
    supabase
      .from('dealerships')
      .select('id, name')
      .eq('group_id', groupId)
      .neq('id', dealershipId)
      .then(({ data }) => setSiblingStores(data ?? []));
  }, [groupId, dealershipId]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q || siblingStores.length === 0) {
      setGroupSearchResults([]);
      return;
    }
    setGroupSearching(true);
    const timeout = setTimeout(async () => {
      const siblingIds = siblingStores.map((s) => s.id);
      const { data } = await supabase
        .from('vehicles')
        .select('id, board, stock_number, vin, year, make, model, dealership_id')
        .in('dealership_id', siblingIds)
        .eq('completed', false)
        .or(`stock_number.ilike.%${q}%,vin.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`)
        .limit(10);
      const storeNameFor = (id: string) => siblingStores.find((s) => s.id === id)?.name ?? 'Another store';
      setGroupSearchResults(
        (data ?? []).map((v) => ({
          id: v.id,
          board: v.board,
          stock_number: v.stock_number,
          vin: v.vin,
          year: v.year,
          make: v.make,
          model: v.model,
          dealershipId: v.dealership_id,
          dealershipName: storeNameFor(v.dealership_id),
        }))
      );
      setGroupSearching(false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, siblingStores]);

  function handleGroupSearchSelect(result: (typeof groupSearchResults)[number]) {
    setSearchQuery('');
    setSearchOpen(false);
    onNavigateToSiblingStore?.({ id: result.dealershipId, name: result.dealershipName }, result.id, result.board);
  }
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

  // Handles "navigate to this vehicle" requests coming from outside the
  // board entirely — right now that's just Analytics' Needs Attention
  // panel, handed off through Dashboard (the shared parent of both, since
  // Analytics and the board are separate siblings, not nested). Reuses
  // the exact same scroll-and-highlight mechanism search results already
  // use, so a vehicle opened this way gets identical treatment.
  useEffect(() => {
    if (!navigateTarget) return;
    if (navigateTarget.board !== activeBoardKey) {
      pendingScrollVehicleId.current = navigateTarget.vehicleId;
      setActiveBoardKey(navigateTarget.board);
    } else {
      setTimeout(() => scrollToAndHighlight(navigateTarget.vehicleId), 200);
    }
    onNavigateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateTarget]);

  // A small activation distance means a normal tap (e.g. opening the dropdown)
  // doesn't accidentally start a drag — only a deliberate press-and-move does.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadVehicles = useCallback(
    async (isInitial = false) => {
      if (isInitial) setLoading(true);
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
      // One batched query for photo counts across every vehicle on the
      // board, rather than a separate query per card — just the
      // vehicle_id column is enough to tally counts client-side.
      const ids = (data ?? []).map((v) => v.id);
      if (ids.length > 0) {
        const { data: photoRows } = await supabase.from('vehicle_photos').select('vehicle_id').in('vehicle_id', ids);
        const counts = new Map<string, number>();
        (photoRows ?? []).forEach((row) => {
          counts.set(row.vehicle_id, (counts.get(row.vehicle_id) ?? 0) + 1);
        });
        setPhotoCounts(counts);
      } else {
        setPhotoCounts(new Map());
      }

      // Due-date-reached check for loaners. There's no real scheduled/cron
      // infrastructure behind this — it's a plain check that runs every
      // time the board loads, which is a good match for what was actually
      // asked for ("let someone know once we've reached that date"),
      // without needing new server infrastructure to build it properly
      // later if that's ever worth doing. The notified flag guarantees
      // this only ever fires once per vehicle, no matter how many times
      // the board reloads after the date passes.
      const today = new Date().toISOString().slice(0, 10);
      const reachedDue = (data ?? []).filter(
        (v) =>
          v.board === 'loaners' &&
          !v.completed &&
          v.loaner_return_date &&
          v.loaner_return_date.slice(0, 10) <= today &&
          !v.loaner_return_date_notified &&
          v.loaner_return_date_set_by
      );
      if (reachedDue.length > 0) {
        await supabase.from('notifications').insert(
          reachedDue.map((v) => ({
            recipient_id: v.loaner_return_date_set_by,
            dealership_id: dealershipId,
            vehicle_id: v.id,
            message: `The due date you set for ${v.stock_number ? v.stock_number + '-' : ''}${v.year ?? ''} ${v.make ?? ''} ${v.model ?? ''} has been reached.`,
          }))
        );
        await supabase
          .from('vehicles')
          .update({ loaner_return_date_notified: true })
          .in('id', reachedDue.map((v) => v.id));
      }
    }
    if (isInitial) setLoading(false);
    },
    [dealershipId]
  );

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
    loadVehicles(true);
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

  // Keeps the top scrollbar's width accurate to the board's real content
  // width, whenever it changes — columns added/removed, compact mode
  // toggled, vehicles added, anything that reflows the row's actual size.
  useEffect(() => {
    const row = boardRowRef.current;
    if (!row) return;
    const observer = new ResizeObserver(() => {
      setContentWidth(boardScrollRef.current?.scrollWidth ?? 0);
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [activeBoardKey]);

  // Two-way sync between the top and bottom scrollbars — the guard flag
  // stops each side's own scroll event from re-triggering the other in
  // an infinite loop.
  function handleTopScroll() {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (boardScrollRef.current && topScrollRef.current) {
      boardScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => (isSyncingScroll.current = false));
  }
  function handleMainScroll() {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (boardScrollRef.current && topScrollRef.current) {
      topScrollRef.current.scrollLeft = boardScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => (isSyncingScroll.current = false));
  }

  // Click-and-drag panning on empty board space — deliberately excludes
  // anything inside a card, or any button/link/input, via closest(), so
  // it can never compete with dragging a card or tapping a control.
  function handleBoardMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[id^="vehicle-card-"], button, a, input, textarea, select')) return;
    panStartRef.current = { x: e.clientX, scrollLeft: boardScrollRef.current?.scrollLeft ?? 0 };
    setIsPanning(true);
  }

  useEffect(() => {
    if (!isPanning) return;
    function onMove(e: MouseEvent) {
      if (!panStartRef.current || !boardScrollRef.current) return;
      boardScrollRef.current.scrollLeft = panStartRef.current.scrollLeft - (e.clientX - panStartRef.current.x);
    }
    function onUp() {
      panStartRef.current = null;
      setIsPanning(false);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isPanning]);

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

  // Undo toast — Gmail-style, 10 second window. Only ever holds the single
  // most recent move; a new move replaces whatever was pending, it
  // doesn't stack.
  const [undoState, setUndoState] = useState<{ snapshot: MoveUndoSnapshot; label: string } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndoToast = useCallback((snapshot: MoveUndoSnapshot, destinationLabel: string) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState({ snapshot, label: destinationLabel });
    undoTimerRef.current = setTimeout(() => setUndoState(null), 10000);
  }, []);

  async function handleUndo() {
    if (!undoState) return;
    const { snapshot } = undoState;
    setUndoState(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    await undoMove(snapshot);
    loadVehicles();
  }

  // Tracks whether any card's own modal (Notes, Timeline, Photos, etc.) is
  // currently open, across every column — used to hide the floating scan
  // button while one is open, since both are fixed-position overlays and
  // were otherwise able to visually collide.
  const [openCardModalCount, setOpenCardModalCount] = useState(0);
  const handleAnyCardModalOpenChange = useCallback((open: boolean) => {
    setOpenCardModalCount((c) => Math.max(0, c + (open ? 1 : -1)));
  }, []);

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
      const { undo } = await moveVehicleToStage(activeId, activeVehicle.board, destinationStage, session?.user.id ?? null, userName);
      if (undo) showUndoToast(undo, locationLabelFor(activeVehicle));
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
            onClick={() => {
              setShowLiveInventory(false);
              setActiveBoardKey(b.key);
            }}
            className={`font-display px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              !showLiveInventory && activeBoardKey === b.key ? 'bg-signal-blue text-white' : 'text-steel bg-asphalt'
            }`}
          >
            {b.label}
          </button>
        ))}
        <button
          onClick={() => setShowLiveInventory(true)}
          className={`font-display px-3.5 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            showLiveInventory ? 'bg-signal-blue text-white' : 'text-steel bg-asphalt'
          }`}
        >
          Live Inventory
        </button>
        <button
          onClick={() => setSettingsMenuOpen(true)}
          className="ml-1 text-steel text-sm whitespace-nowrap px-2"
        >
          ⚙️ Settings
        </button>
        <div className="relative ml-auto flex items-center gap-2">
          <button
            onClick={() => {
              const next = !compactMode;
              setCompactMode(next);
              sessionStorage.setItem('ts-compact-mode', next ? '1' : '0');
            }}
            aria-label={compactMode ? 'Switch to full card view' : 'Switch to compact view'}
            title={compactMode ? 'Full view' : 'Compact view'}
            className={`text-sm whitespace-nowrap px-2 py-1 rounded-md ${
              compactMode ? 'bg-signal-blue text-white' : 'text-steel'
            }`}
          >
            ☰
          </button>
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
                {searchQuery.trim() && siblingStores.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 bg-asphalt border-b border-gray-100">
                      <p className="text-[11px] font-semibold text-steel uppercase tracking-wide">
                        {groupSearching ? 'Searching other stores…' : 'Other stores in your group'}
                      </p>
                    </div>
                    {!groupSearching && groupSearchResults.length === 0 && (
                      <p className="text-steel text-sm p-3">No matches elsewhere in the group.</p>
                    )}
                    {groupSearchResults.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleGroupSearchSelect(result)}
                        className="w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-asphalt"
                      >
                        <p className="text-sm font-medium text-ink truncate">
                          {result.stock_number ? `${result.stock_number}-` : ''}
                          {result.year ?? ''} {result.make} {result.model}
                        </p>
                        <p className="text-xs text-signal-blue font-medium">→ {result.dealershipName}</p>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </nav>

      {error && <p className="text-signal-red text-sm px-4 py-2">{error}</p>}

      {showLiveInventory ? (
        <LiveInventoryTable
          dealershipId={dealershipId}
          refreshKey={liveInventoryRefreshKey}
          onImportClick={() => setImportModalOpen(true)}
        />
      ) : (
        activeBoard && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <div
            ref={topScrollRef}
            onScroll={handleTopScroll}
            className="hidden sm:block board-scroll overflow-x-auto overflow-y-hidden"
            style={{ height: 14 }}
          >
            <div style={{ width: contentWidth, height: 1 }} />
          </div>
          <main
            ref={boardScrollRef}
            onScroll={handleMainScroll}
            onMouseDown={handleBoardMouseDown}
            className={`board-scroll flex-1 min-w-0 overflow-x-auto p-4 ${
              isPanning ? 'cursor-grabbing select-none' : 'sm:cursor-grab'
            }`}
          >
            <div ref={boardRowRef} className="flex gap-4 h-full">
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
                  onAnyCardModalOpenChange={handleAnyCardModalOpenChange}
                  photoCounts={photoCounts}
                  compactMode={compactMode}
                  onMoveWithUndo={showUndoToast}
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
                  photoCount={photoCounts.get(draggingVehicle.id) ?? 0}
                  onMoved={() => {}}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
        )
      )}

      {undoState && (
        <div className="fixed bottom-24 left-4 right-4 z-30 flex justify-center">
          <div className="bg-ink text-white rounded-full shadow-lift pl-4 pr-2 py-2 flex items-center gap-3 max-w-sm">
            <p className="text-sm truncate">Vehicle moved to {undoState.label}.</p>
            <button
              onClick={handleUndo}
              className="text-signal-blue font-semibold text-sm flex-shrink-0 px-2 py-1"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {openCardModalCount === 0 && (
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
      )}

      {scanModalOpen && (
        <ScanToMoveModal
          boards={boards}
          vehicles={vehicles}
          onClose={() => setScanModalOpen(false)}
          onMoved={loadVehicles}
          onNotFound={(vin) => setAddModal({ initialVin: vin })}
        />
      )}

      {importModalOpen && (
        <ImportInventoryModal
          dealershipId={dealershipId}
          boards={boards}
          onClose={() => setImportModalOpen(false)}
          onImported={() => setLiveInventoryRefreshKey((k) => k + 1)}
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
          onCreated={async (newVehicleId, actualBoard) => {
            setAddModal(null);
            setHasDraft(false);
            await loadVehicles();

            // Confirms the card actually landed where expected — the
            // same scroll-and-highlight treatment search results already
            // get, so adding a vehicle ends by showing you that exact
            // card instead of leaving you wherever the board happened to
            // be scrolled before.
            if (newVehicleId && actualBoard) {
              if (actualBoard !== activeBoardKey) {
                pendingScrollVehicleId.current = newVehicleId;
                setActiveBoardKey(actualBoard);
              } else {
                setTimeout(() => scrollToAndHighlight(newVehicleId), 60);
              }
            }
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

      {settingsMenuOpen && (
        <SettingsModal
          isOwner={isOwner}
          isManager={isManager}
          onClose={() => setSettingsMenuOpen(false)}
          onOpenManageBoards={() => setManageBoardsOpen(true)}
          onOpenAgingColors={() => setSettingsOpen(true)}
          onOpenRoles={() => setRolesOpen(true)}
          onOpenRates={() => setRatesModalOpen(true)}
          onOpenInvite={onOpenInvite}
          onOpenName={onOpenName}
          onOpenPassword={onOpenPassword}
        />
      )}

      {ratesModalOpen && (
        <CarryingCostRatesModal dealershipId={dealershipId} onClose={() => setRatesModalOpen(false)} />
      )}
    </div>
  );
}
