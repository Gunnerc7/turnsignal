import { useCallback, useEffect, useState } from 'react';
import {
  DndContext,
  defaultDropAnimationSideEffects,
  DragEndEvent,
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
  const [draggingVehicle, setDraggingVehicle] = useState<Vehicle | null>(null);

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
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDraggingVehicle(null);
    const activeId = event.active.id as string;
    const overId = event.over?.id as string | undefined;
    if (!overId || activeId === overId) return;

    const activeVehicle = vehicles.find((v) => v.id === activeId);
    if (!activeVehicle) return;

    // overId is either another vehicle's id (dropped onto a card — reorder
    // and possibly change stage) or a stage key directly (dropped onto
    // empty space in a column — just append to that stage).
    const overVehicle = vehicles.find((v) => v.id === overId);
    const destinationStage = overVehicle ? overVehicle.stage : overId;

    const stageSiblings = vehicles
      .filter((v) => v.board === activeVehicle.board && v.stage === destinationStage && v.id !== activeId)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const insertIndex = overVehicle
      ? Math.max(0, stageSiblings.findIndex((v) => v.id === overId))
      : stageSiblings.length;

    const newOrderIds = [
      ...stageSiblings.slice(0, insertIndex).map((v) => v.id),
      activeId,
      ...stageSiblings.slice(insertIndex).map((v) => v.id),
    ];

    if (activeVehicle.stage !== destinationStage) {
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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
