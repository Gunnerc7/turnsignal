import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { decodeVin } from '../lib/vinDecode';
import { createVehicle } from '../lib/createVehicle';
import { extractVinFromImage } from '../lib/vinOcr';
import { suggestIsNew } from '../lib/dates';
import { BoardConfig } from '../lib/boards';
import { Vehicle } from '../lib/types';
import VinPhotoCapture from './VinPhotoCapture';

export default function AddVehicleModal({
  dealershipId,
  boards,
  board,
  stage,
  vehicle,
  autoScan,
  onClose,
  onCreated,
}: {
  dealershipId: string;
  boards: BoardConfig[];
  board?: string;
  stage?: string;
  vehicle?: Vehicle;
  autoScan?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { session, userName } = useAuth();
  const isEditing = !!vehicle;
  const needsBucketPicker = !isEditing && !board && !stage;

  const [destination, setDestination] = useState('');
  const [vin, setVin] = useState(vehicle?.vin ?? '');
  const [year, setYear] = useState(vehicle?.year != null ? String(vehicle.year) : '');
  const [make, setMake] = useState(vehicle?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? '');
  const [trim, setTrim] = useState(vehicle?.trim ?? '');
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [stockNumber, setStockNumber] = useState(vehicle?.stock_number ?? '');
  const [hasDamage, setHasDamage] = useState(vehicle?.has_damage ?? false);
  const [isNew, setIsNew] = useState(vehicle?.is_new ?? suggestIsNew(vehicle?.year ?? null));
  const isNewManuallySet = useRef(isEditing); // editing an existing vehicle never auto-overrides its flag
  const [mileage, setMileage] = useState(vehicle?.mileage != null ? String(vehicle.mileage) : '');
  const [assignedToId, setAssignedToId] = useState(vehicle?.assigned_to_id ?? '');
  const [members, setMembers] = useState<{ id: string; label: string }[]>([]);
  const [decoding, setDecoding] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // iOS Safari's on-screen keyboard can resize the viewport in a way that
  // leaves the field you're typing into hidden behind it. Nudging the
  // focused field into view once the keyboard finishes animating in works
  // around this — it's a real platform quirk, not something we can fully
  // fix from CSS alone.
  function scrollFieldIntoView(e: React.FocusEvent<HTMLElement>) {
    setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  }

  useEffect(() => {
    if (autoScan) setCameraOpen(true);
  }, [autoScan]);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('dealership_id', dealershipId)
      .then(({ data }) => {
        const list = (data ?? []).map((m) => ({
          id: m.id,
          label: m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.email,
        }));
        setMembers(list);
      });
  }, [dealershipId]);

  async function runDecode(vinToDecode: string) {
    setError(null);
    setDecoding(true);
    const result = await decodeVin(vinToDecode);
    setDecoding(false);

    if (!result) {
      setError("Couldn't decode that VIN — double check it, or fill in the details manually.");
      return;
    }
    setYear(result.year ? String(result.year) : '');
    setMake(result.make);
    setModel(result.model);
    setTrim(result.trim);
    if (!isNewManuallySet.current) {
      setIsNew(suggestIsNew(result.year ?? null));
    }
  }

  async function handlePhotoCapture(dataUrl: string) {
    setCameraOpen(false);
    setScanning(true);
    setError(null);

    const { vin: detected, verified } = await extractVinFromImage(dataUrl);
    setScanning(false);

    if (!detected) {
      setError("Couldn't read a clear VIN from that photo — check the field below and type or retake it.");
      return;
    }

    setVin(detected);

    if (!verified) {
      setError(
        "Read a VIN, but it didn't pass the standard checksum — double-check it carefully before saving, or retake the photo."
      );
    }

    runDecode(detected);
  }

  async function handleSubmit() {
    if (needsBucketPicker && !destination) {
      setError('Pick where this vehicle goes first.');
      return;
    }

    setSaving(true);
    setError(null);

    const previousAssignedToId = vehicle?.assigned_to_id ?? null;
    const assignedMember = members.find((m) => m.id === assignedToId);
    const isNewAssignment = assignedToId && assignedToId !== previousAssignedToId;

    const sharedFields = {
      vin: vin.trim() || null,
      year: year ? parseInt(year, 10) : null,
      make: make.trim() || null,
      model: model.trim() || null,
      trim: trim.trim() || null,
      color: color.trim() || null,
      stock_number: stockNumber.trim() || null,
      mileage: mileage.trim() ? parseInt(mileage, 10) : null,
      has_damage: hasDamage,
      is_new: isNew,
      assigned_to_id: assignedToId || null,
      assigned_to_name: assignedToId ? assignedMember?.label ?? null : null,
    };

    const vehicleLabelForNotification = `${stockNumber.trim() ? stockNumber.trim() + '-' : ''}${year} ${make} ${model}`.trim();

    async function notifyAssignee(vehicleId: string) {
      if (!isNewAssignment) return;
      await supabase.from('notifications').insert({
        recipient_id: assignedToId,
        dealership_id: dealershipId,
        vehicle_id: vehicleId,
        message: `${vehicleLabelForNotification} was assigned to you by ${userName ?? 'a teammate'}.`,
      });
    }

    if (isEditing && vehicle) {
      const { error: updateError } = await supabase
        .from('vehicles')
        .update(sharedFields)
        .eq('id', vehicle.id);

      setSaving(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      await notifyAssignee(vehicle.id);
      onCreated();
      return;
    }

    const [finalBoard, finalStage] = needsBucketPicker ? destination.split('::') : [board!, stage!];

    const { created, error: insertError } = await createVehicle({
      dealershipId,
      board: finalBoard,
      stage: finalStage,
      createdByEmail: session?.user.email ?? null,
      createdByName: userName,
      ...sharedFields,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (created) await notifyAssignee(created.id);
    onCreated();
  }

  async function handleDelete() {
    if (!vehicle) return;
    const confirmed = window.confirm(
      `Delete this vehicle? This removes it and all its notes and history permanently — it can't be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error: deleteError } = await supabase.from('vehicles').delete().eq('id', vehicle.id);
    setDeleting(false);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold text-ink">
            {isEditing ? 'Edit vehicle' : 'Add vehicle'}
          </h2>
          <button onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">VIN</label>
            <div className="flex gap-2">
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base"
                placeholder="17-character VIN"
                maxLength={17}
              />
              <button
                type="button"
                onClick={() => setCameraOpen(true)}
                disabled={scanning}
                className="px-3 rounded-lg bg-ink text-white text-sm font-medium disabled:opacity-60"
              >
                {scanning ? 'Reading…' : 'Scan'}
              </button>
            </div>
            <button
              type="button"
              disabled={vin.length !== 17 || decoding}
              onClick={() => runDecode(vin)}
              className="mt-2 text-sm text-signal-blue font-medium disabled:text-gray-400"
            >
              {decoding ? 'Decoding…' : 'Decode VIN'}
            </button>
          </div>

          {needsBucketPicker && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Where does this go?</label>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base bg-white"
              >
                <option value="" disabled>
                  Choose a board and column…
                </option>
                {boards.map((b) => (
                  <optgroup key={b.key} label={b.label}>
                    {b.stages.map((s) => (
                      <option key={`${b.key}::${s.key}`} value={`${b.key}::${s.key}`}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Stock number (optional)</label>
            <input
              value={stockNumber}
              onChange={(e) => setStockNumber(e.target.value)}
              onFocus={scrollFieldIntoView}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Year</label>
              <input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Make</label>
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Trim</label>
              <input
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                onFocus={scrollFieldIntoView}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Color (optional)</label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              onFocus={scrollFieldIntoView}
              placeholder="e.g. Summit White"
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Mileage (optional)</label>
            <input
              type="number"
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              onFocus={scrollFieldIntoView}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base"
            />
          </div>

          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={hasDamage}
              onChange={(e) => setHasDamage(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-ink">Has damage</span>
          </label>

          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={isNew}
              onChange={(e) => {
                isNewManuallySet.current = true;
                setIsNew(e.target.checked);
              }}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-ink">New vehicle</span>
            <span className="text-xs text-steel">(unchecked = used — affects holding cost)</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-ink mb-1">Assign to (optional)</label>
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base bg-white"
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-signal-red text-sm">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full bg-signal-blue text-white font-semibold rounded-lg py-2.5 disabled:opacity-60"
          >
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Add vehicle'}
          </button>

          {isEditing && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full text-signal-red font-medium py-2 disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete vehicle'}
            </button>
          )}
        </div>
      </div>

      {cameraOpen && <VinPhotoCapture onCapture={handlePhotoCapture} onClose={() => setCameraOpen(false)} />}
    </div>
  );
}
