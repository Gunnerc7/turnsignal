import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import ModalCloseButton from './ModalCloseButton';

type Photo = { id: string; storage_path: string; uploaded_by_name: string | null };

const BUCKET = 'vehicle-photos';

function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function PhotosModal({
  vehicleId,
  dealershipId,
  vehicleLabel,
  onClose,
}: {
  vehicleId: string;
  dealershipId: string;
  vehicleLabel: string;
  onClose: () => void;
}) {
  const { userName } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingPhoto, setViewingPhoto] = useState<Photo | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadPhotos() {
    setLoading(true);
    const { data } = await supabase
      .from('vehicle_photos')
      .select('id, storage_path, uploaded_by_name')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false });
    setPhotos(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadPhotos();
  }, [vehicleId]);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    // Copy into a plain array before touching the input's value — resetting
    // it (needed so the same files can be picked again later) can empty out
    // a FileList we're still holding a live reference to on some browsers.
    const files = Array.from(fileList);
    e.target.value = '';

    setUploading(true);
    setError(null);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${dealershipId}/${vehicleId}/${Date.now()}-${i}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);

      if (uploadError) {
        setError(uploadError.message);
        continue; // keep trying the rest even if one fails
      }

      await supabase.from('vehicle_photos').insert({
        vehicle_id: vehicleId,
        storage_path: path,
        uploaded_by_name: userName,
      });
    }

    setUploading(false);
    loadPhotos();
  }

  async function handleDelete(photo: Photo) {
    const confirmed = window.confirm('Delete this photo? This cannot be undone.');
    if (!confirmed) return;

    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    await supabase.from('vehicle_photos').delete().eq('id', photo.id);
    setViewingPhoto(null);
    loadPhotos();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md modal-h-85 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Photos</h2>
            <p className="text-xs text-steel">{vehicleLabel}</p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="text-signal-red text-sm mb-3">{error}</p>}

          {loading ? (
            <p className="text-steel text-sm">Loading photos…</p>
          ) : photos.length === 0 ? (
            <p className="text-steel text-sm mb-3">No photos yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 mb-3">
              {photos.map((p) => (
                <div key={p.id} className="relative">
                  <button onClick={() => setViewingPhoto(p)} className="block w-full">
                    <img
                      src={publicUrl(p.storage_path)}
                      alt="Vehicle"
                      className="w-full h-32 object-cover rounded-lg border border-gray-200"
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(p)}
                    aria-label="Delete photo"
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                  {p.uploaded_by_name && (
                    <p className="text-[10px] text-steel mt-0.5 truncate">{p.uploaded_by_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full bg-signal-blue text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : '+ Add photos'}
          </button>
          <p className="text-center text-xs text-steel mt-1.5">
            Tap a photo to view it larger. You can select more than one at once from your library.
          </p>
        </div>
      </div>

      {viewingPhoto && (
        <div
          className="fixed inset-0 bg-black z-50 flex flex-col"
          onClick={() => setViewingPhoto(null)}
        >
          <div className="flex justify-end p-3">
            <button
              onClick={() => setViewingPhoto(null)}
              aria-label="Close"
              className="w-9 h-9 rounded-full bg-white/10 text-white text-lg flex items-center justify-center"
            >
              ✕
            </button>
          </div>
          {/* overflow-auto + a slightly oversized image lets native pinch-to-zoom
              and panning work — this is real browser zoom, not a fake CSS scale,
              so it stays sharp at any zoom level. */}
          <div className="flex-1 overflow-auto flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={publicUrl(viewingPhoto.storage_path)}
              alt="Vehicle, enlarged"
              className="max-w-none w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
