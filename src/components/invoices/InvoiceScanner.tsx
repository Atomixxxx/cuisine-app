import React, { useState, useRef, useCallback, useEffect } from 'react';
import { analyzeInvoiceImages, hasApiKey, getApiKey, setApiKey } from '../../services/ocr';
import { pdfToImages } from '../../services/pdfReader';
import type { OCRResult } from '../../services/ocr';
import { cn, vibrate, blobToUrl, compressImage } from '../../utils';
import { logger } from '../../services/logger';
import InvoiceForm from './InvoiceForm';

interface InvoiceScannerProps {
  onComplete: () => void;
}

interface PageImage {
  id: string;
  blob: Blob;
  url: string;
}

const CameraIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const FileIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
    <polyline points="13,2 13,9 20,9" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18,15 12,9 6,15" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6,9 12,15 18,9" />
  </svg>
);

const KeyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const ACCEPTED_TYPES = 'image/*,.pdf,application/pdf';

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function ApiKeySetup({ onSaved, isOnline }: { onSaved: () => void; isOnline: boolean }) {
  const [key, setKey] = useState('');

  useEffect(() => {
    getApiKey().then(k => setKey(k));
  }, []);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSave = async () => {
    if (!isOnline) {
      setTestResult('error');
      return;
    }
    if (!key.trim()) return;
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key.trim(),
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Dis "OK" en un mot.' }] }],
            generationConfig: { maxOutputTokens: 10 },
          }),
        },
      );

      if (res.ok) {
        await setApiKey(key);
        setTestResult('ok');
        setTimeout(onSaved, 500);
      } else {
        const err = await res.text();
        if (res.status === 400 || err.includes('API_KEY')) {
          setTestResult('invalid');
        } else {
          setTestResult('error');
        }
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-[color:var(--app-accent)]/10 flex items-center justify-center text-[color:var(--app-accent)]">
          <KeyIcon />
        </div>
        <h3 className="ios-title3 app-text">
          Configuration Gemini
        </h3>
        <p className="ios-body app-muted">
          Pour analyser vos factures avec precision, entrez votre cle API Google Gemini.
        </p>
        <a
          href="https://aistudio.google.com/apikey"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block ios-body text-[color:var(--app-accent)] font-medium"
        >
          Obtenir une cle gratuite
        </a>
      </div>

      <div className="space-y-2">
        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setTestResult(null); }}
          placeholder="AIzaSy..."
          className="w-full px-4 py-3 rounded-xl app-surface-2 app-text text-[17px] border-0 focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]"
        />

        {testResult === 'invalid' && (
          <p className="ios-caption text-[color:var(--app-danger)]">Cle API invalide. Verifiez et reessayez.</p>
        )}
        {testResult === 'error' && (
          <p className="ios-caption text-[color:var(--app-danger)]">Erreur de connexion. Verifiez votre internet.</p>
        )}
        {testResult === 'ok' && (
          <p className="ios-caption text-[color:var(--app-success)]">Cle valide !</p>
        )}

        <button
          onClick={handleSave}
          disabled={!key.trim() || testing || !isOnline}
          className={cn(
            'w-full py-3 rounded-xl font-semibold text-[17px] active:opacity-70 transition-opacity',
            'app-accent-bg',
            (!key.trim() || testing || !isOnline) && 'opacity-40 cursor-not-allowed',
          )}
        >
          {testing ? 'Verification...' : 'Valider la cle'}
        </button>
      </div>
    </div>
  );
}

export default function InvoiceScanner({ onComplete }: InvoiceScannerProps) {
  const [pages, setPages] = useState<PageImage[]>([]);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showApiSetup, setShowApiSetup] = useState(true);
  const [apiKeyLoaded, setApiKeyLoaded] = useState(false);
  const [apiKeyExists, setApiKeyExists] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const pagesRef = useRef<PageImage[]>([]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    return () => {
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.url));
    };
  }, []);

  useEffect(() => {
    hasApiKey().then(has => {
      setShowApiSetup(!has);
      setApiKeyExists(has);
      setApiKeyLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const addImages = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setIsImporting(true);

    try {
      const newPages: PageImage[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (isPdf(file)) {
          const pdfBlobs = await pdfToImages(file, (current, total) => {
            setError(null);
            if (total > 1) {
              setOcrProgress(Math.round((current / total) * 100));
            }
          });
          for (const blob of pdfBlobs) {
            const compressed = await compressImage(blob);
            const url = blobToUrl(compressed);
            newPages.push({
              id: crypto.randomUUID(),
              blob: compressed,
              url,
            });
          }
          setOcrProgress(0);
        } else if (file.type.startsWith('image/')) {
          const compressed = await compressImage(file);
          const url = blobToUrl(compressed);
          newPages.push({
            id: crypto.randomUUID(),
            blob: compressed,
            url,
          });
        } else {
          setError(`Format non supporte : ${file.name}. Utilisez des images (JPG, PNG) ou des fichiers PDF.`);
        }
      }

      if (newPages.length > 0) {
        setPages((prev) => [...prev, ...newPages]);
      }
    } catch (err) {
      logger.error('Invoice import error', { err });
      setError(
        err instanceof Error
          ? `Erreur d'import : ${err.message}`
          : "Erreur lors de l'import du fichier. Verifiez que le fichier n'est pas corrompu."
      );
    } finally {
      setIsImporting(false);
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addImages(e.target.files);
      e.target.value = '';
    },
    [addImages]
  );

  const handleDeletePage = useCallback((id: string) => {
    vibrate();
    setPages((prev) => {
      const page = prev.find((p) => p.id === id);
      if (page) URL.revokeObjectURL(page.url);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const handleMovePage = useCallback((id: string, direction: 'up' | 'down') => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[targetIdx]] = [copy[targetIdx], copy[idx]];
      return copy;
    });
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (pages.length === 0) return;
    if (!isOnline) {
      setError("Mode hors ligne: l'analyse OCR n'est pas disponible.");
      return;
    }
    const keyReady = await hasApiKey();
    if (!keyReady) {
      setShowApiSetup(true);
      return;
    }

    setIsProcessing(true);
    setOcrProgress(0);
    setError(null);

    try {
      const blobs = pages.map((p) => p.blob);
      const result = await analyzeInvoiceImages(blobs, (progress) => {
        setOcrProgress(progress);
      });
      setOcrResult(result);
    } catch (err) {
      logger.error('Invoice analysis error', { err });
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'analyse. Veuillez reessayer."
      );
    } finally {
      setIsProcessing(false);
    }
  }, [isOnline, pages]);

  const handleReset = useCallback(() => {
    pages.forEach((p) => URL.revokeObjectURL(p.url));
    setPages([]);
    setOcrResult(null);
    setOcrProgress(0);
    setError(null);
  }, [pages]);

  const handleFormSave = useCallback(() => {
    handleReset();
    onComplete();
  }, [handleReset, onComplete]);

  const handleFormCancel = useCallback(() => {
    setOcrResult(null);
  }, []);

  // Wait for API key check
  if (!apiKeyLoaded) {
    return (
      <div className="p-4 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show API key setup
  if (showApiSetup) {
    return (
      <div>
        {!isOnline && (
          <p className="px-4 pb-2 ios-caption text-[color:var(--app-warning)]">
            Mode hors ligne: verification de cle indisponible
          </p>
        )}
        <ApiKeySetup onSaved={() => { setShowApiSetup(false); setApiKeyExists(true); }} isOnline={isOnline} />
        {apiKeyExists && (
          <div className="px-4 pb-4">
            <button
              onClick={() => setShowApiSetup(false)}
              className="w-full py-2 ios-body app-muted active:opacity-70"
            >
              Retour
            </button>
          </div>
        )}
      </div>
    );
  }

  // Show InvoiceForm after analysis
  if (ocrResult) {
    return (
      <InvoiceForm
        initialData={ocrResult}
        images={pages.map((p) => p.blob)}
        onSave={handleFormSave}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* API key status + settings */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 ios-caption app-muted">
            <div className={cn(
              'w-2 h-2 rounded-full',
              apiKeyExists ? 'bg-[color:var(--app-success)]' : 'bg-[color:var(--app-danger)]'
            )} />
            <span>{apiKeyExists ? 'Gemini connecte' : 'Cle API manquante'}</span>
          </div>
        <button
          onClick={() => setShowApiSetup(true)}
          className="ios-caption text-[color:var(--app-accent)] font-medium active:opacity-70"
        >
          {apiKeyExists ? 'Modifier la cle' : 'Configurer'}
        </button>
      </div>

      {!isOnline && (
        <div className="p-3 rounded-2xl bg-[color:var(--app-warning)]/12 text-[color:var(--app-warning)] ios-caption">
          Hors ligne: scan IA indisponible jusqu'au retour de la connexion.
        </div>
      )}

      {/* Capture buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => {
            vibrate();
            cameraInputRef.current?.click();
          }}
          disabled={isProcessing || isImporting}
          className={cn(
            'flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed active:opacity-70 transition-opacity',
            'border-[color:var(--app-accent)]/30 bg-[color:var(--app-accent)]/6',
            'text-[color:var(--app-accent)]',
            (isProcessing || isImporting) && 'opacity-40 cursor-not-allowed'
          )}
        >
          <CameraIcon />
          <span className="ios-body font-semibold">Prendre photo</span>
        </button>

        <button
          onClick={() => {
            vibrate();
            fileInputRef.current?.click();
          }}
          disabled={isProcessing || isImporting}
          className={cn(
            'flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed active:opacity-70 transition-opacity',
            'border-[color:var(--app-border)] bg-[color:var(--app-surface-2)]/70',
            'app-muted',
            (isProcessing || isImporting) && 'opacity-40 cursor-not-allowed'
          )}
        >
          <FileIcon />
          <span className="ios-body font-semibold">Importer fichier</span>
          <span className="text-[12px] opacity-60">PDF, JPG, PNG</span>
        </button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Import progress */}
      {isImporting && (
        <div className="flex items-center gap-3 p-3 rounded-2xl app-card">
          <div className="w-6 h-6 border-2 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
          <p className="ios-body app-text">
            Import du fichier en cours...
          </p>
        </div>
      )}

      {/* Pages thumbnails */}
      {pages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="ios-body font-semibold app-text">
              Pages capturees ({pages.length})
            </h3>
            <button
              onClick={handleReset}
              disabled={isProcessing || isImporting}
              className="ios-caption text-[color:var(--app-danger)] font-medium active:opacity-70"
            >
              Tout supprimer
            </button>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className="relative group rounded-2xl overflow-hidden app-card"
              >
                <img
                  src={page.url}
                  alt={`Page ${index + 1}`}
                  className="w-full aspect-[3/4] object-cover"
                />
                <div className="absolute top-1 left-1 bg-black/60 text-white text-[12px] rounded-lg px-1.5 py-0.5">
                  {index + 1}
                </div>

                {/* Controls overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center gap-1 p-1 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => handleMovePage(page.id, 'up')}
                    disabled={index === 0}
                    className="p-1 bg-[color:var(--app-surface)]/90 rounded-lg app-text disabled:opacity-30"
                  >
                    <ArrowUpIcon />
                  </button>
                  <button
                    onClick={() => handleMovePage(page.id, 'down')}
                    disabled={index === pages.length - 1}
                    className="p-1 bg-[color:var(--app-surface)]/90 rounded-lg app-text disabled:opacity-30"
                  >
                    <ArrowDownIcon />
                  </button>
                  <button
                    onClick={() => handleDeletePage(page.id)}
                    className="p-1 bg-[color:var(--app-danger)]/90 rounded-lg text-white"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 rounded-2xl bg-[color:var(--app-danger)]/10 text-[color:var(--app-danger)] ios-body">
          {error}
        </div>
      )}

      {/* Processing state */}
      {isProcessing && (
        <div className="space-y-3 p-4 rounded-2xl app-card">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 border-3 border-[color:var(--app-accent)] border-t-transparent rounded-full animate-spin" />
            <div>
              <p className="ios-body font-semibold app-text">
                Analyse en cours...
              </p>
              <p className="ios-caption app-muted">
                Lecture intelligente via Gemini
              </p>
            </div>
          </div>
          <div className="w-full app-surface-3 rounded-full h-2">
            <div
              className="bg-[color:var(--app-accent)] h-2 rounded-full transition-all duration-300"
              style={{ width: `${ocrProgress}%` }}
            />
          </div>
          <p className="ios-caption text-center app-muted">
            {ocrProgress}%
          </p>
        </div>
      )}

      {/* Analyze button */}
      {pages.length > 0 && !isProcessing && !isImporting && (
        <button
          onClick={handleAnalyze}
          disabled={!isOnline}
          className={cn(
            'w-full py-3 px-4 app-accent-bg font-semibold text-[17px] rounded-xl active:opacity-70 transition-opacity flex items-center justify-center gap-2',
            !isOnline && 'opacity-45 cursor-not-allowed',
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Analyser ({pages.length} page{pages.length > 1 ? 's' : ''})
        </button>
      )}

      {/* Empty state */}
      {pages.length === 0 && !isProcessing && !isImporting && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="app-muted mb-4"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
          <p className="ios-title3 app-muted">
            Prenez en photo ou importez vos factures
          </p>
          <p className="ios-body app-muted mt-1">
            PDF, JPG, PNG — plusieurs pages possibles
          </p>
        </div>
      )}
    </div>
  );
}

