import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { cn, vibrate, fileToBlob, compressImage } from '../../utils';

interface BarcodeScannerProps {
  onScanComplete: (barcode: string | undefined, photo: Blob | undefined) => void;
  onCancel: () => void;
  onAnalyzeLabel?: (photo: Blob) => Promise<void>;
}

const SCANNER_REGION_ID = 'barcode-scanner-region';
const MAX_CAPTURE_WIDTH = 1600;

export default function BarcodeScanner({ onScanComplete, onCancel, onAnalyzeLabel }: BarcodeScannerProps) {
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [analyzingLabel, setAnalyzingLabel] = useState(false);
  const [labelAnalyzed, setLabelAnalyzed] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerStartedRef = useRef(false);
  const lastScannedBarcodeRef = useRef('');
  const lastScannedAtRef = useRef(0);
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
          const now = Date.now();
          if (
            decodedText === lastScannedBarcodeRef.current &&
            now - lastScannedAtRef.current < 1500
          ) {
            return;
          }
          lastScannedBarcodeRef.current = decodedText;
          lastScannedAtRef.current = now;
          vibrate(100);
          setScannedBarcode(decodedText);
          setManualBarcode(decodedText);
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

  const runAutoOcr = useCallback(async (photo: Blob) => {
    if (!onAnalyzeLabel) return;
    setAnalyzingLabel(true);
    try {
      await onAnalyzeLabel(photo);
      setLabelAnalyzed(true);
    } catch {
      // Silent fail - user can retry manually
    } finally {
      setAnalyzingLabel(false);
    }
  }, [onAnalyzeLabel]);

  const applyCapturedPhoto = useCallback(async (sourcePhoto: Blob) => {
    const compressedPhoto = await compressImage(sourcePhoto, 1024, 0.65);
    setCapturedPhoto(compressedPhoto);
    setLabelAnalyzed(false);
    setPhotoPreviewUrl((previousUrl) => {
      if (previousUrl) URL.revokeObjectURL(previousUrl);
      return URL.createObjectURL(compressedPhoto);
    });
    await runAutoOcr(compressedPhoto);
  }, [runAutoOcr]);

  const handleTakeFallbackPhoto = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blob = await fileToBlob(file);
    await applyCapturedPhoto(blob);
    e.target.value = '';
  }, [applyCapturedPhoto]);

  const capturePhotoFromStream = useCallback(async () => {
    const scannerRegion = document.getElementById(SCANNER_REGION_ID);
    const scannerVideo = scannerRegion?.querySelector('video');
    if (!(scannerVideo instanceof HTMLVideoElement)) {
      setScannerError('Flux camera indisponible. Utilisez le mode photo de secours.');
      return;
    }

    const { videoWidth, videoHeight } = scannerVideo;
    if (!videoWidth || !videoHeight) {
      setScannerError('La camera est en cours d\'initialisation. Reessayez dans un instant.');
      return;
    }

    const scale = videoWidth > MAX_CAPTURE_WIDTH ? MAX_CAPTURE_WIDTH / videoWidth : 1;
    const captureWidth = Math.round(videoWidth * scale);
    const captureHeight = Math.round(videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = captureWidth;
    canvas.height = captureHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      canvas.width = 0;
      canvas.height = 0;
      setScannerError('Impossible de capturer la photo depuis le flux camera.');
      return;
    }

    let frameBlob: Blob | null = null;
    try {
      context.drawImage(scannerVideo, 0, 0, captureWidth, captureHeight);
      frameBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.92);
      });
    } finally {
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }

    if (!frameBlob) {
      setScannerError('La capture photo a echoue. Reessayez.');
      return;
    }

    await applyCapturedPhoto(frameBlob);
  }, [applyCapturedPhoto]);
  const handleContinue = useCallback(() => {
    const barcode = scannedBarcode || manualBarcode || undefined;
    onScanComplete(barcode, capturedPhoto ?? undefined);
  }, [scannedBarcode, manualBarcode, capturedPhoto, onScanComplete]);

  return (
    <div className="flex flex-col gap-4">
      {/* Scanner area */}
      <div className="relative rounded-xl overflow-hidden app-surface-3">
        <div id={SCANNER_REGION_ID} className="w-full" />
        {!isScanning && !scannerError && !scannedBarcode && (
          <div className="flex items-center justify-center h-48 app-muted">
            <svg className="w-12 h-12 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Scanned result */}
      {scannedBarcode && (
        <div aria-live="polite" className="flex items-center gap-2 p-3 rounded-lg border border-[color:var(--app-success)]/30 bg-[color:var(--app-success)]/10">
          <svg className="w-5 h-5 text-[color:var(--app-success)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium text-[color:var(--app-success)]">
            Code détecté : <span className="font-mono">{scannedBarcode}</span>
          </span>
        </div>
      )}

      {/* Error */}
      {scannerError && (
        <div aria-live="assertive" className="p-3 rounded-lg text-sm border border-[color:var(--app-warning)]/30 bg-[color:var(--app-warning)]/10 text-[color:var(--app-warning)]">
          {scannerError}
        </div>
      )}

      {/* Manual entry */}
      <div>
        <label className="block text-sm font-medium app-muted mb-1">
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
          className="w-full px-3 py-2.5 rounded-lg app-surface-2 app-text placeholder-[color:var(--app-muted)] border app-border focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
        />
      </div>

      {/* Photo capture */}
      <div>
        {scannerError && (
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileChange}
            className="hidden"
          />
        )}

        {photoPreviewUrl ? (
          <div className="relative">
            <img
              src={photoPreviewUrl}
              alt="Photo produit"
              className="w-full h-48 object-cover rounded-lg"
            />
            <button
              type="button"
              onClick={scannerError ? handleTakeFallbackPhoto : capturePhotoFromStream}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 app-surface app-border rounded-lg text-sm font-medium app-text shadow"
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
            onClick={scannerError ? handleTakeFallbackPhoto : capturePhotoFromStream}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed app-border rounded-lg app-muted active:border-[color:var(--app-accent)] hover:text-[color:var(--app-accent)] hover:border-[color:var(--app-accent)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {scannerError ? 'Prendre photo' : "Capturer l'etiquette"}
          </button>
        )}
      </div>

      {/* Analyze label OCR */}
      {capturedPhoto && onAnalyzeLabel && (
        <button
          type="button"
          disabled={analyzingLabel}
          onClick={async () => {
            setAnalyzingLabel(true);
            try {
              await onAnalyzeLabel(capturedPhoto);
              setLabelAnalyzed(true);
            } finally {
              setAnalyzingLabel(false);
            }
          }}
          className={cn(
            'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors',
            labelAnalyzed
              ? 'border border-[color:var(--app-success)]/30 bg-[color:var(--app-success)]/10 text-[color:var(--app-success)]'
              : 'app-accent-bg',
            analyzingLabel && 'opacity-60 cursor-not-allowed'
          )}
        >
          {analyzingLabel ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
              Analyse en cours...
            </>
          ) : labelAnalyzed ? (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Etiquette analysee
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Analyser l'etiquette (OCR)
            </>
          )}
        </button>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 rounded-lg app-surface-2 app-border app-text font-medium hover:bg-[color:var(--app-surface-3)] transition-colors"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className={cn(
            'flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors',
            'app-accent-bg active:opacity-70'
          )}
        >
          Continuer
        </button>
      </div>
    </div>
  );
}

