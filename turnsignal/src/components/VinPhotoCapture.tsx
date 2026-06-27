import { useEffect, useRef, useState } from 'react';

// The guide box is expressed as a fraction of the video frame — wide and
// short, matching a single line of VIN text rather than a whole label.
const GUIDE_WIDTH_FRACTION = 0.82;
const GUIDE_HEIGHT_FRACTION = 0.14;

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

    // Crop to just the guide box's region of the actual source frame —
    // this is what strips out the surrounding sticker clutter (GVWR, tire
    // size, etc.) before OCR ever sees the image.
    const cropWidth = video.videoWidth * GUIDE_WIDTH_FRACTION;
    const cropHeight = video.videoHeight * GUIDE_HEIGHT_FRACTION;
    const cropX = (video.videoWidth - cropWidth) / 2;
    const cropY = (video.videoHeight - cropHeight) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Tesseract reads upscaled text more reliably than small source crops —
    // this is a specifically documented accuracy factor for OCR engines.
    // (We previously also applied a manual contrast boost here, but under
    // strong lighting that can blow out highlights and crush shadows
    // before Tesseract even sees the image — actively destroying detail
    // rather than helping. Tesseract already does its own adaptive
    // thresholding internally, so we let it handle that instead.)
    const upscale = 2.5;
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
        Fit just the VIN line inside the green box, fill the frame, hold steady
      </p>
    </div>
  );
}
