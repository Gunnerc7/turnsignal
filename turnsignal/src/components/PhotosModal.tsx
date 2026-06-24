import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

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

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);

    const path = `${dealershipId}/${vehicleId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);

    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }

    await supabase.from('vehicle_photos').insert({
      vehicle_id: vehicleId,
      storage_path: path,
      uploaded_by_name: userName,
    });

    setUploading(false);
    loadPhotos();
  }

  async function handleDelete(photo: Photo) {
    const confirmed = window.confirm('Delete this photo? This cannot be undone.');
    if (!confirmed) return;

    await supabase.storage.from(BUCKET).remove([photo.storage_path]);
    await supabase.from('vehicle_photos').delete().eq('id', photo.id);
    loadPhotos();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="font-display text-base font-semibold text-ink">Photos</h2>
            <p className="text-xs text-steel">{vehicleLabel}</p>
          </div>
          <button onClick={onClose} className="text-steel text-sm py-2">
            Close
          </button>
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
                  <img
                    src={publicUrl(p.storage_path)}
                    alt="Vehicle"
                    className="w-full h-32 object-cover rounded-lg border border-gray-200"
                  />
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
            capture="environment"
            onChange={handleFileSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full bg-signal-blue text-white font-medium rounded-lg py-2.5 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : '+ Add photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
