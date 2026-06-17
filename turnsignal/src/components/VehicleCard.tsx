import { Vehicle } from '../lib/types';

function daysSince(dateStr: string): number {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function ageStyles(days: number) {
  if (days >= 5) return 'border-signal-red bg-red-50';
  if (days >= 3) return 'border-signal-amber bg-amber-50';
  return 'border-gray-200 bg-white';
}

function ageBadgeStyles(days: number) {
  if (days >= 5) return 'bg-signal-red text-white';
  if (days >= 3) return 'bg-signal-amber text-white';
  return 'bg-gray-100 text-steel';
}

export default function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const days = daysSince(vehicle.stage_entered_at);

  return (
    <div className={`rounded-lg border-2 p-3 mb-3 ${ageStyles(days)}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink text-sm leading-tight">
          {vehicle.year ?? ''} {vehicle.make} {vehicle.model}
          {vehicle.trim ? ` ${vehicle.trim}` : ''}
        </p>
        <span className={`text-xs font-medium rounded-full px-2 py-0.5 whitespace-nowrap ${ageBadgeStyles(days)}`}>
          {days}d
        </span>
      </div>

      <div className="mt-2 text-xs text-steel space-y-0.5">
        {vehicle.stock_number && <p>Stock #{vehicle.stock_number}</p>}
        {vehicle.vin && <p className="truncate">VIN: {vehicle.vin}</p>}
        {vehicle.mileage != null && <p>{vehicle.mileage.toLocaleString()} mi</p>}
        {vehicle.loaned_to && <p>Loaned to: {vehicle.loaned_to}</p>}
      </div>
    </div>
  );
}
