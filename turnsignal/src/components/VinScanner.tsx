import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ELEMENT_ID = 'vin-scanner-region';

export default function VinScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        (decodedText) => {
          onScan(decodedText);
        },
        () => {
          // ignore per-frame "no code found" noise
        }
      )
      .catch(() => {
        // Camera failed to start (permissions denied, no camera, etc.)
        // The parent component should let the user fall back to typing the VIN.
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex justify-between items-center px-4 py-3 text-white">
        <p className="font-medium">Scan VIN barcode</p>
        <button onClick={onClose} className="text-sm text-steel">
          Cancel
        </button>
      </div>
      <div id={SCANNER_ELEMENT_ID} className="flex-1" />
      <p className="text-center text-steel text-sm py-3 px-4">
        Line up the barcode on the door jamb or dash sticker
      </p>
    </div>
  );
}
