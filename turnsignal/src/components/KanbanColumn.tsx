import { useEffect, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { BoardConfig } from '../lib/boards';
import { Vehicle } from '../lib/types';
import VehicleCard from './VehicleCard';

export default function KanbanColumn({
  label,
  stageKey,
  boards,
  yellowDays,
  redDays,
  newRatePerDay,
  usedRatePerDay,
  isOwner,
  isManager,
  vehicles,
  highlightedVehicleId,
  onAddClick,
  onMoved,
}: {
  label: string;
  stageKey: string;
  boards: BoardConfig[];
  yellowDays: number;
  redDays: number;
  newRatePerDay: number;
  usedRatePerDay: number;
  isOwner: boolean;
  isManager: boolean;
  vehicles: Vehicle[];
  highlightedVehicleId?: string | null;
  onAddClick: () => void;
  onMoved: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stageKey });
  const [showCompleted, setShowCompleted] = useState(false);

  const activeVehicles = vehicles.filter((v) => !v.completed);
  const completedVehicles = vehicles.filter((v) => v.completed);

  // A search result can land on a vehicle that's currently tucked inside
  // the collapsed "Completed (N)" summary — auto-expand it so the result
  // is actually visible instead of pointing at a hidden row.
  useEffect(() => {
    if (highlightedVehicleId && completedVehicles.some((v) => v.id === highlightedVehicleId)) {
      setShowCompleted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightedVehicleId]);

  return (
    <div
      ref={setNodeRef}
      className={`snap-col w-[86vw] sm:w-72 flex-shrink-0 flex flex-col max-h-full rounded-xl p-3 transition-colors duration-150 ${
        isOver ? 'bg-blue-50 ring-2 ring-signal-blue ring-inset' : 'bg-asphalt'
      }`}
    >
      <div className="flex items-center justify-between mb-3 px-0.5">
        <p className="font-display font-bold text-ink text-base">
          {label} <span className="text-steel font-normal text-sm">({activeVehicles.length})</span>
        </p>
        <button
          onClick={onAddClick}
          aria-label={`Add vehicle to ${label}`}
          className="w-9 h-9 rounded-full bg-signal-blue text-white text-xl leading-none flex items-center justify-center active:scale-90 transition shadow-sm"
        >
          +
        </button>
      </div>

      <div className="overflow-y-auto flex-1 p-1 -m-1">
        {activeVehicles.length === 0 && completedVehicles.length === 0 ? (
          <p className="text-steel text-sm py-6 text-center">No vehicles here</p>
        ) : (
          <>
            {activeVehicles.length === 0 ? (
              <p className="text-steel text-sm py-4 text-center">No active vehicles</p>
            ) : (
              <SortableContext items={activeVehicles.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                {activeVehicles.map((v) => (
                  <VehicleCard
                    key={v.id}
                    vehicle={v}
                    boards={boards}
                    yellowDays={yellowDays}
                    redDays={redDays}
                    newRatePerDay={newRatePerDay}
                    usedRatePerDay={usedRatePerDay}
                    isOwner={isOwner}
                    isManager={isManager}
                    highlighted={v.id === highlightedVehicleId}
                    onMoved={onMoved}
                  />
                ))}
              </SortableContext>
            )}

            {completedVehicles.length > 0 && (
              <div className="mt-1">
                <button
                  onClick={() => setShowCompleted((s) => !s)}
                  className="w-full flex items-center gap-1.5 text-xs font-semibold text-steel py-2.5 px-1"
                >
                  <span className={`transition-transform ${showCompleted ? 'rotate-90' : ''}`}>›</span>
                  Completed ({completedVehicles.length})
                </button>
                {showCompleted && (
                  <div>
                    {completedVehicles.map((v) => (
                      <VehicleCard
                        key={v.id}
                        vehicle={v}
                        boards={boards}
                        yellowDays={yellowDays}
                        redDays={redDays}
                        newRatePerDay={newRatePerDay}
                        usedRatePerDay={usedRatePerDay}
                        isOwner={isOwner}
                        isManager={isManager}
                        highlighted={v.id === highlightedVehicleId}
                        onMoved={onMoved}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
