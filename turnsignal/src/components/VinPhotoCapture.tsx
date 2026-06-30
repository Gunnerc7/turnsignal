import { useEffect, useRef, useState } from 'react';

// The guide box now covers a generous block of the frame, not a thin
// single-line strip — pixel-perfect alignment to exactly one row was the
// root cause of bad reads whenever framing was even slightly off. Wider
// framing plus genuine multi-line OCR (see vinOcr.ts) means the system
// finds the right row itself instead of requiring the user to isolate it.
const GUIDE_WIDTH_FRACTION = 0.85;
const GUIDE_HEIGHT_FRACTION = 0.45;

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
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
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

    // The video is shown with object-cover, which crops the raw camera
    // frame to fill its on-screen box — so the green guide box (positioned
    // relative to that already-cropped display) does NOT line up with
    // simple percentages of the raw source frame unless the camera's
    // aspect ratio happens to exactly match the screen's. We have to work
    // out what's actually visible on screen first, then crop within that.
    const rect = video.getBoundingClientRect();
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const visibleSourceWidth = rect.width / scale;
    const visibleSourceHeight = rect.height / scale;
    const visibleSourceX = (video.videoWidth - visibleSourceWidth) / 2;
    const visibleSourceY = (video.videoHeight - visibleSourceHeight) / 2;

    // Crop to just the guide box's region within that visible area — this
    // is what strips out the surrounding sticker clutter (GVWR, tire
    // size, etc.) before OCR ever sees the image.
    const cropWidth = visibleSourceWidth * GUIDE_WIDTH_FRACTION;
    const cropHeight = visibleSourceHeight * GUIDE_HEIGHT_FRACTION;
    const cropX = visibleSourceX + (visibleSourceWidth - cropWidth) / 2;
    const cropY = visibleSourceY + (visibleSourceHeight - cropHeight) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Tesseract reads upscaled text more reliably than small source crops —
    // a documented accuracy factor for OCR engines. Bumped higher than
    // before since the capture region is now wider (more sticker, less
    // detail per character at native resolution) to compensate.
    const upscale = 3.2;
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = canvas.width * upscale;
    finalCanvas.height = canvas.height * upscale;
    const finalCtx = finalCanvas.getContext('2d');
    if (!finalCtx) return;
    finalCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height);

    onCapture(finalCanvas.toDataURL('image/jpeg', 0.95));
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center px-4 py-3 text-white flex-shrink-0">
        <p className="font-medium">Photograph the VIN</p>
        <button onClick={onClose} className="text-sm text-steel">
          Cancel
        </button>
      </div>

      {error ? (
        <p className="text-white text-sm p-4">{error}</p>
      ) : (
        <div className="relative flex-1 min-h-0">
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          <div
            className="absolute border-2 border-signal-green rounded-md pointer-events-none"
            style={{
              left: `${((1 - GUIDE_WIDTH_FRACTION) / 2) * 100}%`,
              top: `${((1 - GUIDE_HEIGHT_FRACTION) / 2) * 100}%`,
              width: `${GUIDE_WIDTH_FRACTION * 100}%`,
              height: `${GUIDE_HEIGHT_FRACTION * 100}%`,
            }}
          />
        </div>
      )}

      <div
        className="p-6 flex justify-center bg-black flex-shrink-0"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleCapture}
          disabled={!!error}
          aria-label="Capture photo"
          className="w-16 h-16 rounded-full bg-white border-4 border-gray-400 disabled:opacity-40 active:scale-90 transition flex-shrink-0"
        />
      </div>
      <p
        className="text-center text-steel text-sm px-4 bg-black"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        Fit the whole VIN sticker in the box — we'll find the right row for you, fill the frame, hold steady
      </p>
    </div>
  );
}
