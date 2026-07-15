import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { decodeVin } from '../lib/vinDecode';
import { createVehicle } from '../lib/createVehicle';
import { scanVin } from '../lib/vinOcr';
import ModalCloseButton from './ModalCloseButton';
import { suggestIsNew } from '../lib/dates';
import { BoardConfig } from '../lib/boards';
import { Vehicle, VehicleNote } from '../lib/types';
import VinPhotoCapture from './VinPhotoCapture';

export default function AddVehicleModal({
  dealershipId,
  boards,
  board,
  stage,
  vehicle,
  autoScan,
  initialVin,
  restoreDraft = false,
  onClose,
  onCreated,
}: {
  dealershipId: string;
  boards: BoardConfig[];
  board?: string;
  stage?: string;
  vehicle?: Vehicle;
  autoScan?: boolean;
  initialVin?: string;
  restoreDraft?: boolean;
  onClose: () => void;
  onCreated: (newVehicleId?: string, board?: string) => void;
}) {
  const { session, userName } = useAuth();
  const isEditing = !!vehicle;
  const needsBucketPicker = !isEditing && !board && !stage;

  // Restore from sessionStorage draft if this was triggered by "Resume →"
  const savedDraft = (() => {
    if (!restoreDraft || isEditing) return null;
    try {
      const raw = sessionStorage.getItem('ts-add-draft');
      if (!raw) return null;
      const d = JSON.parse(raw);
      return d.dealershipId === dealershipId ? d : null;
    } catch { return null; }
  })();

  const [destination, setDestination] = useState(savedDraft?.destination ?? '');
  const [vin, setVin] = useState(vehicle?.vin ?? initialVin ?? savedDraft?.vin ?? '');
  const [year, setYear] = useState(vehicle?.year != null ? String(vehicle.year) : (savedDraft?.year ?? ''));
  const [make, setMake] = useState(vehicle?.make ?? savedDraft?.make ?? '');
  const [model, setModel] = useState(vehicle?.model ?? savedDraft?.model ?? '');
  const [trim, setTrim] = useState(vehicle?.trim ?? savedDraft?.trim ?? '');
  const [color, setColor] = useState(vehicle?.color ?? savedDraft?.color ?? '');
  const [stockNumber, setStockNumber] = useState(vehicle?.stock_number ?? savedDraft?.stockNumber ?? '');
  const [hasDamage, setHasDamage] = useState(vehicle?.has_damage ?? savedDraft?.hasDamage ?? false);
  const [carryingCostExcluded, setCarryingCostExcluded] = useState(vehicle?.carrying_cost_excluded ?? false);
  const [isNew, setIsNew] = useState(vehicle?.is_new ?? savedDraft?.isNew ?? suggestIsNew(vehicle?.year ?? null));
  const isNewManuallySet = useRef(isEditing); // editing an existing vehicle never auto-overrides its flag
  const [mileage, setMileage] = useState(vehicle?.mileage != null ? String(vehicle.mileage) : (savedDraft?.mileage ?? ''));
  const [assignedToId, setAssignedToId] = useState(vehicle?.assigned_to_id ?? savedDraft?.assignedToId ?? '');
  // Only meaningful when creating a new vehicle — lets someone jot down a
  // note (or a few, each optionally tagging people) right in this same
  // form instead of having to close it and reopen Notes separately.
  const [pendingNotes, setPendingNotes] = useState<{ content: string; taggedIds: string[] }[]>(
    savedDraft?.pendingNotes ?? []
  );
  const [noteDraft, setNoteDraft] = useState('');
  const [noteDraftTaggedIds, setNoteDraftTaggedIds] = useState<string[]>([]);
  const [noteTagPickerOpen, setNoteTagPickerOpen] = useState(false);

  // Editing an existing vehicle: real notes, fetched from the same table
  // NotesModal reads from, added immediately (not staged) using the exact
  // same insert pattern NotesModal already uses successfully — this is
  // deliberately not a new implementation, just that same proven flow
  // made reachable straight from the card itself instead of only through
  // a separate Notes button.
  const [existingNotes, setExistingNotes] = useState<VehicleNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editNoteDraft, setEditNoteDraft] = useState('');
  const [editNoteTaggedIds, setEditNoteTaggedIds] = useState<string[]>([]);
  const [editNoteTagPickerOpen, setEditNoteTagPickerOpen] = useState(false);
  const [savingEditNote, setSavingEditNote] = useState(false);

  async function loadExistingNotes() {
    if (!vehicle) return;
    setLoadingNotes(true);
    const { data } = await supabase
      .from('vehicle_notes')
      .select('*')
      .eq('vehicle_id', vehicle.id)
      .order('created_at', { ascending: false });
    setExistingNotes(data ?? []);
    setLoadingNotes(false);
  }

  useEffect(() => {
    if (isEditing) loadExistingNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicle?.id]);

  async function handleAddNoteToExistingVehicle() {
    if (!vehicle || !editNoteDraft.trim()) return;
    setSavingEditNote(true);

    const taggedMembers = members.filter((m) => editNoteTaggedIds.includes(m.id));
    const { data: created } = await supabase
      .from('vehicle_notes')
      .insert({
        vehicle_id: vehicle.id,
        content: editNoteDraft.trim(),
        author_email: session?.user.email ?? null,
        author_name: userName,
        tagged_user_ids: taggedMembers.map((m) => m.id),
        tagged_user_names: taggedMembers.map((m) => m.label),
      })
      .select()
      .single();

    if (created && taggedMembers.length > 0) {
      const preview = editNoteDraft.trim().length > 80 ? editNoteDraft.trim().slice(0, 80) + '…' : editNoteDraft.trim();
      const label = `${vehicle.stock_number ? vehicle.stock_number + '-' : ''}${vehicle.year ?? ''} ${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim();
      await supabase.from('notifications').insert(
        taggedMembers.map((m) => ({
          recipient_id: m.id,
          dealership_id: dealershipId,
          vehicle_id: vehicle.id,
          message: `${userName ?? 'Someone'} tagged you on a note for ${label}: "${preview}"`,
        }))
      );
    }

    setSavingEditNote(false);
    setEditNoteDraft('');
    setEditNoteTaggedIds([]);
    await loadExistingNotes();
  }
  const [loanerReturnDate, setLoanerReturnDate] = useState(vehicle?.loaner_return_date?.slice(0, 10) ?? '');
  // Which board this vehicle is actually on (or heading to) — used to
  // decide whether the loaner-specific due date field is relevant at all.
  const currentBoard = vehicle?.board ?? (needsBucketPicker ? destination.split('::')[0] : board);
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

  // A VIN handed in already (e.g. from the scan-to-move flow finding no
  // existing match) has already been confirmed by a scan — decode it
  // immediately instead of making the person scan or type it again.
  useEffect(() => {
    if (initialVin && !isEditing) {
      runDecode(initialVin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save a draft to sessionStorage whenever form fields change so a
  // tab switch / iOS discard doesn't lose the user's work. Only runs for
  // new vehicles, not edits (edits have a database record already).
  useEffect(() => {
    if (isEditing) return;
    const hasAnyData = vin || stockNumber || year || make || pendingNotes.length > 0;
    if (!hasAnyData) return;
    sessionStorage.setItem('ts-add-draft', JSON.stringify({
      dealershipId, destination, vin, year, make, model, trim,
      color, stockNumber, hasDamage, isNew, mileage, assignedToId, pendingNotes,
    }));
  }, [dealershipId, destination, vin, year, make, model, trim, color, stockNumber, hasDamage, isNew, mileage, assignedToId, pendingNotes, isEditing]);

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

    const { vin: detected, verified } = await scanVin(dataUrl);
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

    // Only touch the notified/set-by fields when the date itself actually
    // changed — an unrelated save (e.g. just fixing the color) shouldn't
    // reset a notification that's already correctly pending or already
    // fired.
    const previousLoanerDate = vehicle?.loaner_return_date?.slice(0, 10) ?? '';
    const loanerDateChanged = previousLoanerDate !== loanerReturnDate;

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
      carrying_cost_excluded: carryingCostExcluded,
      is_new: isNew,
      assigned_to_id: assignedToId || null,
      assigned_to_name: assignedToId ? assignedMember?.label ?? null : null,
      loaner_return_date: loanerReturnDate || null,
      ...(loanerDateChanged
        ? {
            loaner_return_date_set_by: loanerReturnDate ? session?.user.id ?? null : null,
            loaner_return_date_notified: false,
          }
        : {}),
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
      // Whatever's sitting in the note composer at Save time gets
      // captured too — someone typing a note and hitting the main Save
      // button (rather than the separate, smaller "+ Add note" button)
      // is the natural thing to do, since that's exactly how saving a
      // note already works when first adding a vehicle. Without this,
      // that note would just silently vanish the moment this modal closes.
      if (editNoteDraft.trim()) {
        await handleAddNoteToExistingVehicle();
      }
      sessionStorage.removeItem('ts-add-draft');
      onCreated();
      return;
    }

    const [finalBoard, finalStage] = needsBucketPicker ? destination.split('::') : [board!, stage!];

    const { created, error: insertError } = await createVehicle({
      dealershipId,
      board: finalBoard,
      stage: finalStage,
      createdById: session?.user.id ?? null,
      createdByEmail: session?.user.email ?? null,
      createdByName: userName,
      ...sharedFields,
    });

    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }
    if (created) {
      await notifyAssignee(created.id);
      // TEMPORARY diagnostic — fires every time, success or failure, to
      // pin down exactly what's happening after repeated reports of notes
      // not showing up with no visible error at all. Safe to simplify
      // back down once that's confirmed.
      // Whatever's still sitting in the note box at Save time gets
      // included too — typing a note and going straight to the main
      // Save button, without also tapping the smaller "+ Add note"
      // button first, is a completely natural thing to do. This is the
      // exact same fix already applied to editing an existing vehicle;
      // it just hadn't been applied here too.
      const allPendingNotes = noteDraft.trim()
        ? [...pendingNotes, { content: noteDraft.trim(), taggedIds: noteDraftTaggedIds }]
        : pendingNotes;

      if (allPendingNotes.length === 0) {
        // Nothing typed and nothing added — genuinely nothing to save.
      } else {
        const noteRows = allPendingNotes.map((note) => {
          const taggedMembers = members.filter((m) => note.taggedIds.includes(m.id));
          return {
            vehicle_id: created.id,
            content: note.content,
            author_email: session?.user.email ?? null,
            author_name: userName,
            tagged_user_ids: taggedMembers.map((m) => m.id),
            tagged_user_names: taggedMembers.map((m) => m.label),
          };
        });
        const { error: notesError } = await supabase.from('vehicle_notes').insert(noteRows);
        if (notesError) {
          window.alert(
            `DIAGNOSTIC: Tried to save ${noteRows.length} note(s) for vehicle ${created.id}.\n\nInsert FAILED: ${notesError.message} (code: ${notesError.code ?? 'none'})`
          );
        } else {
          const { count, error: verifyError } = await supabase
            .from('vehicle_notes')
            .select('id', { count: 'exact', head: true })
            .eq('vehicle_id', created.id);
          window.alert(
            `DIAGNOSTIC: Tried to save ${noteRows.length} note(s) for vehicle ${created.id}.\n\nInsert reported success. Reading back found ${count ?? 'null'} note(s) for this vehicle.${verifyError ? ` Verify read error: ${verifyError.message}` : ''}`
          );
          const notificationRows: { recipient_id: string; dealership_id: string; vehicle_id: string; message: string }[] = [];
          allPendingNotes.forEach((note) => {
            const taggedMembers = members.filter((m) => note.taggedIds.includes(m.id));
            taggedMembers.forEach((m) => {
              const preview = note.content.length > 80 ? note.content.slice(0, 80) + '…' : note.content;
              notificationRows.push({
                recipient_id: m.id,
                dealership_id: dealershipId,
                vehicle_id: created.id,
                message: `${userName ?? 'Someone'} tagged you on a note for ${vehicleLabelForNotification}: "${preview}"`,
              });
            });
          });
          if (notificationRows.length > 0) {
            await supabase.from('notifications').insert(notificationRows);
          }
        }
      }
    }
    sessionStorage.removeItem('ts-add-draft');
    onCreated(created?.id, finalBoard);
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
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-90 flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-ink">
            {isEditing ? 'Edit vehicle' : 'Add vehicle'}
          </h2>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="space-y-3 overflow-y-auto flex-1 px-5 py-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">VIN</label>
            <div className="flex gap-2">
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                onFocus={scrollFieldIntoView}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base uppercase"
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

          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={carryingCostExcluded}
              onChange={(e) => setCarryingCostExcluded(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm font-medium text-ink">Exclude from carrying cost</span>
          </label>
          {carryingCostExcluded && (
            <p className="text-xs text-steel -mt-2">
              e.g. an already-sold vehicle back in briefly for a re-detail — won't count toward carrying cost while this is checked.
            </p>
          )}

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

          {currentBoard === 'loaners' && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Due back (optional)</label>
              <input
                type="date"
                value={loanerReturnDate}
                onChange={(e) => setLoanerReturnDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-base bg-white"
              />
              <p className="text-xs text-steel mt-1">
                You'll get a notification once this date is reached — leave blank if there isn't one.
              </p>
            </div>
          )}

          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Notes (optional)</label>
              {pendingNotes.length > 0 && (
                <div className="space-y-1.5 mb-2">
                  {pendingNotes.map((note, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 bg-asphalt rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink whitespace-pre-wrap">{note.content}</p>
                        {note.taggedIds.length > 0 && (
                          <p className="text-[11px] text-signal-blue font-medium mt-0.5">
                            🏷️ Tagged: {members.filter((m) => note.taggedIds.includes(m.id)).map((m) => m.label).join(', ')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setPendingNotes((prev) => prev.filter((_, idx) => idx !== i))}
                        aria-label="Remove note"
                        className="text-steel flex-shrink-0"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full text-sm border border-gray-300 rounded-lg py-2 px-3 resize-none focus:outline-none focus:ring-2 focus:ring-signal-blue"
              />

              {noteDraftTaggedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {members
                    .filter((m) => noteDraftTaggedIds.includes(m.id))
                    .map((m) => (
                      <span
                        key={m.id}
                        className="text-xs bg-signal-blue/10 text-signal-blue font-medium rounded-full pl-2.5 pr-1.5 py-1 flex items-center gap-1"
                      >
                        {m.label}
                        <button
                          onClick={() => setNoteDraftTaggedIds((prev) => prev.filter((id) => id !== m.id))}
                          aria-label={`Remove ${m.label}`}
                          className="text-signal-blue"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              )}

              <div className="relative mt-2 flex items-center justify-between">
                <div className="relative">
                  <button
                    onClick={() => setNoteTagPickerOpen((o) => !o)}
                    className="text-xs text-steel font-medium flex items-center gap-1 py-1"
                  >
                    🏷️ {noteDraftTaggedIds.length > 0 ? `${noteDraftTaggedIds.length} tagged` : 'Tag people'}
                  </button>

                  {noteTagPickerOpen && (
                    <>
                      <button
                        className="fixed inset-0 z-40 cursor-default"
                        aria-label="Close tag picker"
                        onClick={() => setNoteTagPickerOpen(false)}
                      />
                      <div className="absolute left-0 bottom-full mb-1 bg-white rounded-lg shadow-lift border border-gray-200 w-56 max-h-56 overflow-y-auto z-50">
                        {members.length === 0 ? (
                          <p className="text-steel text-xs p-3">No other team members yet.</p>
                        ) : (
                          members.map((m) => (
                            <button
                              key={m.id}
                              onClick={() =>
                                setNoteDraftTaggedIds((prev) =>
                                  prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                )
                              }
                              className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-asphalt"
                            >
                              <span
                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                  noteDraftTaggedIds.includes(m.id) ? 'bg-signal-blue border-signal-blue' : 'border-gray-300'
                                }`}
                              >
                                {noteDraftTaggedIds.includes(m.id) && (
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                    <path
                                      d="M3 8.5L6.5 12L13 4"
                                      stroke="white"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="text-ink truncate">{m.label}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={() => {
                    if (!noteDraft.trim()) return;
                    setPendingNotes((prev) => [...prev, { content: noteDraft.trim(), taggedIds: noteDraftTaggedIds }]);
                    setNoteDraft('');
                    setNoteDraftTaggedIds([]);
                  }}
                  disabled={!noteDraft.trim()}
                  className="text-signal-blue text-sm font-medium disabled:opacity-40"
                >
                  + Add note
                </button>
              </div>
            </div>
          )}

          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Notes</label>

              {loadingNotes ? (
                <p className="text-steel text-sm">Loading notes…</p>
              ) : (
                existingNotes.length > 0 && (
                  <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto">
                    {existingNotes.map((n) => (
                      <div key={n.id} className="bg-asphalt rounded-lg px-3 py-2">
                        <p className="text-sm text-ink whitespace-pre-wrap">{n.content}</p>
                        {n.tagged_user_names && n.tagged_user_names.length > 0 && (
                          <p className="text-[11px] text-signal-blue font-medium mt-0.5">
                            🏷️ Tagged: {n.tagged_user_names.join(', ')}
                          </p>
                        )}
                        <p className="text-[11px] text-steel mt-0.5">
                          {n.author_name ?? 'Someone'} · {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}

              <textarea
                value={editNoteDraft}
                onChange={(e) => setEditNoteDraft(e.target.value)}
                placeholder="Add a note…"
                rows={2}
                className="w-full text-sm border border-gray-300 rounded-lg py-2 px-3 resize-none focus:outline-none focus:ring-2 focus:ring-signal-blue"
              />

              {editNoteTaggedIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {members
                    .filter((m) => editNoteTaggedIds.includes(m.id))
                    .map((m) => (
                      <span
                        key={m.id}
                        className="text-xs bg-signal-blue/10 text-signal-blue font-medium rounded-full pl-2.5 pr-1.5 py-1 flex items-center gap-1"
                      >
                        {m.label}
                        <button
                          onClick={() => setEditNoteTaggedIds((prev) => prev.filter((id) => id !== m.id))}
                          aria-label={`Remove ${m.label}`}
                          className="text-signal-blue"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                </div>
              )}

              <div className="relative mt-2 flex items-center justify-between">
                <div className="relative">
                  <button
                    onClick={() => setEditNoteTagPickerOpen((o) => !o)}
                    className="text-xs text-steel font-medium flex items-center gap-1 py-1"
                  >
                    🏷️ {editNoteTaggedIds.length > 0 ? `${editNoteTaggedIds.length} tagged` : 'Tag people'}
                  </button>

                  {editNoteTagPickerOpen && (
                    <>
                      <button
                        className="fixed inset-0 z-40 cursor-default"
                        aria-label="Close tag picker"
                        onClick={() => setEditNoteTagPickerOpen(false)}
                      />
                      <div className="absolute left-0 bottom-full mb-1 bg-white rounded-lg shadow-lift border border-gray-200 w-56 max-h-56 overflow-y-auto z-50">
                        {members.length === 0 ? (
                          <p className="text-steel text-xs p-3">No other team members yet.</p>
                        ) : (
                          members.map((m) => (
                            <button
                              key={m.id}
                              onClick={() =>
                                setEditNoteTaggedIds((prev) =>
                                  prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                                )
                              }
                              className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-asphalt"
                            >
                              <span
                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                  editNoteTaggedIds.includes(m.id) ? 'bg-signal-blue border-signal-blue' : 'border-gray-300'
                                }`}
                              >
                                {editNoteTaggedIds.includes(m.id) && (
                                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                                    <path
                                      d="M3 8.5L6.5 12L13 4"
                                      stroke="white"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="text-ink truncate">{m.label}</span>
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={handleAddNoteToExistingVehicle}
                  disabled={!editNoteDraft.trim() || savingEditNote}
                  className="text-signal-blue text-sm font-medium disabled:opacity-40"
                >
                  {savingEditNote ? 'Adding…' : '+ Add note'}
                </button>
              </div>
            </div>
          )}

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
