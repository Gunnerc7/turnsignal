import { useEffect, useRef, useState } from 'react';

export default function VinPhotoCapture({
  onCapture,
  onClose,
}: {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => setError("Couldn't access the camera. Check your browser's camera permission."));

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function handleCapture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL('image/jpeg', 0.92));
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center px-4 py-3 text-white">
        <p className="font-medium">Photograph the VIN</p>
        <button onClick={onClose} className="text-sm text-steel">
          Cancel
        </button>
      </div>

      {error ? (
        <p className="text-white text-sm p-4">{error}</p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="flex-1 object-cover" />
      )}

      <div className="p-6 flex justify-center bg-black">
        <button
          onClick={handleCapture}
          disabled={!!error}
          aria-label="Capture photo"
          className="w-16 h-16 rounded-full bg-white border-4 border-gray-400 disabled:opacity-40 active:scale-90 transition"
        />
      </div>
      <p className="text-center text-steel text-sm pb-4 px-4 bg-black">
        Line up the VIN plate or door sticker, hold steady, then tap to capture
      </p>
    </div>
  );
}
