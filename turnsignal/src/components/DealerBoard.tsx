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
import { ALL_BOARDS, getBoard } from '../lib/boards';
import { Vehicle } from '../lib/types';
import KanbanColumn from './KanbanColumn';
import AddVehicleModal from './AddVehicleModal';
import VehicleCard from './VehicleCard';

const dropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
};

export default function DealerBoard({ dealershipId }: { dealershipId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeBoardKey, setActiveBoardKey] = useState('main');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ board: string; stage: string } | null>(null);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [draggingVehicle, setDraggingVehicle] = useState<Vehicle | null>(null);
  // The stage a vehicle was in before the drag started — used at drop time
  // to know whether a real stage change happened (and stage history needs
  // updating), separate from whatever it's been previewed into mid-drag.
  const dragOriginStage = useRef<string | null>(null);

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

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

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

  const activeBoard = getBoard(activeBoardKey);

  if (loading) {
    return <p className="text-steel text-sm p-4">Loading vehicles…</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <nav className="flex gap-1.5 overflow-x-auto px-4 py-2.5 bg-white border-b border-gray-200">
        {ALL_BOARDS.map((b) => (
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
      </nav>

      {error && <p className="text-signal-red text-sm px-4 py-2">{error}</p>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <main className="flex-1 overflow-x-auto p-4">
          <div className="snap-row flex gap-4 h-full">
            {activeBoard.stages.map((stage) => (
              <KanbanColumn
                key={stage.key}
                label={stage.label}
                stageKey={stage.key}
                vehicles={vehicles.filter(
                  (v) => v.board === activeBoard.key && v.stage === stage.key
                )}
                onAddClick={() => setAddModal({ board: activeBoard.key, stage: stage.key })}
                onMoved={loadVehicles}
              />
            ))}
          </div>
        </main>

        <DragOverlay dropAnimation={dropAnimation}>
          {draggingVehicle && (
            <div className="w-[86vw] sm:w-72 rotate-1 scale-105 shadow-lift rounded-xl">
              <VehicleCard vehicle={draggingVehicle} onMoved={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <button
        onClick={() => setScanModalOpen(true)}
        className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-ink text-white shadow-lift flex items-center justify-center active:scale-90 transition"
        aria-label="Scan VIN to add a vehicle"
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
        <AddVehicleModal
          dealershipId={dealershipId}
          autoScan
          onClose={() => setScanModalOpen(false)}
          onCreated={() => {
            setScanModalOpen(false);
            loadVehicles();
          }}
        />
      )}

      {addModal && (
        <AddVehicleModal
          dealershipId={dealershipId}
          board={addModal.board}
          stage={addModal.stage}
          onClose={() => setAddModal(null)}
          onCreated={() => {
            setAddModal(null);
            loadVehicles();
          }}
        />
      )}
    </div>
  );
}
