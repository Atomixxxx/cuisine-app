import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { cn, vibrate, fileToBlob } from '../../utils';

interface BarcodeScannerProps {
  onScanComplete: (barcode: string | undefined, photo: Blob | undefined) => void;
  onCancel: () => void;
}

const SCANNER_REGION_ID = 'barcode-scanner-region';

export default function BarcodeScanner({ onScanComplete, onCancel }: BarcodeScannerProps) {
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerStartedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current && scannerStartedRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        scannerStartedRef.current = false;
      } catch {
        // Scanner may already be stopped
      }
    }
    setIsScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    setScannerError(null);

    if (!html5QrCodeRef.current) {
      html5QrCodeRef.current = new Html5Qrcode(SCANNER_REGION_ID);
    }

    if (scannerStartedRef.current) {
      await stopScanner();
    }

    try {
      setIsScanning(true);
      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.5,
        },
        (decodedText) => {
          vibrate(100);
          setScannedBarcode(decodedText);
          setManualBarcode(decodedText);
          stopScanner();
        },
        () => {
          // Ignore scan failures (no QR found in frame)
        }
      );
      scannerStartedRef.current = true;
    } catch (err) {
      setIsScanning(false);
      setScannerError(
        'Impossible d\'accéder à la caméra. Vérifiez les permissions ou saisissez le code manuellement.'
      );
    }
  }, [stopScanner]);

  useEffect(() => {
    startScanner();

    return () => {
      if (html5QrCodeRef.current && scannerStartedRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        scannerStartedRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  const handleTakePhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blob = await fileToBlob(file);
    setCapturedPhoto(blob);
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoPreviewUrl(URL.createObjectURL(blob));
  }, [photoPreviewUrl]);

  const handleContinue = useCallback(() => {
    const barcode = scannedBarcode || manualBarcode || undefined;
    onScanComplete(barcode, capturedPhoto ?? undefined);
  }, [scannedBarcode, manualBarcode, capturedPhoto, onScanComplete]);

  return (
    <div className="flex flex-col gap-4">
      {/* Scanner area */}
      <div className="relative rounded-xl overflow-hidden bg-[#1d1d1f]">
        <div id={SCANNER_REGION_ID} className="w-full" />
        {!isScanning && !scannerError && !scannedBarcode && (
          <div className="flex items-center justify-center h-48 text-[#86868b]">
            <svg className="w-12 h-12 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Scanned result */}
      {scannedBarcode && (
        <div aria-live="polite" className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg">
          <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-green-800 dark:text-green-200">
            Code détecté : <span className="font-mono">{scannedBarcode}</span>
          </span>
        </div>
      )}

      {/* Error */}
      {scannerError && (
        <div aria-live="assertive" className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
          {scannerError}
        </div>
      )}

      {/* Manual entry */}
      <div>
        <label className="block text-sm font-medium text-[#1d1d1f] dark:text-[#86868b] mb-1">
          Saisie manuelle du code-barres
        </label>
        <input
          type="text"
          value={manualBarcode}
          onChange={(e) => {
            setManualBarcode(e.target.value);
            if (!scannedBarcode) setScannedBarcode('');
          }}
          placeholder="Entrez le code-barres..."
          className="w-full px-3 py-2.5 border border-[#d1d1d6] dark:border-[#38383a] rounded-lg bg-white dark:bg-[#1d1d1f] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] focus:ring-2 focus:ring-[#2997FF] focus:border-transparent"
        />
      </div>

      {/* Photo capture */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {photoPreviewUrl ? (
          <div className="relative">
            <img
              src={photoPreviewUrl}
              alt="Photo produit"
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={handleTakePhoto}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-[#1d1d1f]/90 rounded-lg text-sm font-medium text-[#1d1d1f] dark:text-[#f5f5f7] shadow"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reprendre
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleTakePhoto}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[#d1d1d6] dark:border-[#38383a] rounded-lg text-[#86868b] dark:text-[#86868b] active:border-[#2997FF] hover:text-[#2997FF] dark:hover:border-[#2997FF] dark:hover:text-[#2997FF] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Prendre photo
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 border border-[#d1d1d6] dark:border-[#38383a] rounded-lg text-[#1d1d1f] dark:text-[#86868b] font-medium hover:bg-[#f5f5f7] dark:hover:bg-[#38383a] transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors',
            'bg-[#2997FF] text-white hover:bg-[#2997FF] active:opacity-70'
          )}
        >
          Continuer
        </button>
      </div>
    </div>
  );
}
