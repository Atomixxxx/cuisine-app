import { useEffect, useMemo, useState } from 'react';
import { showError } from '../../stores/toastStore';
import {
  clearPinUnlocked,
  getPinLockRemainingMs,
  isPinConfigured,
  isPinUnlocked,
  markPinUnlocked,
  PIN_LENGTH,
  registerPinFailure,
  resetPinFailures,
  verifyPinCode,
} from '../../services/pin';

function formatSeconds(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
}

export default function PinLockScreen({ children }: { children: React.ReactNode }) {
  const [pinInput, setPinInput] = useState('');
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (!isPinConfigured()) return true;
    return isPinUnlocked();
  });
  const [lockRemainingMs, setLockRemainingMs] = useState<number>(() => getPinLockRemainingMs());

  const hasPin = useMemo(() => isPinConfigured(), [unlocked]);

  useEffect(() => {
    const onStorage = () => {
      if (!isPinConfigured()) {
        setUnlocked(true);
        setLockRemainingMs(0);
        return;
      }
      setUnlocked(isPinUnlocked());
      setLockRemainingMs(getPinLockRemainingMs());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isPinConfigured()) {
        clearPinUnlocked();
        setUnlocked(false);
        setPinInput('');
      }
      if (document.visibilityState === 'visible') {
        setLockRemainingMs(getPinLockRemainingMs());
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (lockRemainingMs <= 0) return;
    const timer = window.setInterval(() => {
      setLockRemainingMs(getPinLockRemainingMs());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockRemainingMs]);

  const verifyPin = async (value: string) => {
    if (value.length !== PIN_LENGTH) return;
    const remaining = getPinLockRemainingMs();
    if (remaining > 0) {
      setLockRemainingMs(remaining);
      showError(`Trop de tentatives. Reessaie dans ${formatSeconds(remaining)}s.`);
      setPinInput('');
      return;
    }

    try {
      const valid = await verifyPinCode(value);
      if (valid) {
        markPinUnlocked();
        resetPinFailures();
        setUnlocked(true);
        setPinInput('');
        setLockRemainingMs(0);
        return;
      }

      const lockMs = registerPinFailure();
      if (lockMs > 0) {
        setLockRemainingMs(lockMs);
        showError(`PIN bloque pendant ${formatSeconds(lockMs)}s.`);
      } else {
        showError('Code PIN incorrect');
      }
      setPinInput('');
    } catch {
      showError('Verification du PIN indisponible');
      setPinInput('');
    }
  };

  const appendDigit = (digit: string) => {
    if (lockRemainingMs > 0 || pinInput.length >= PIN_LENGTH) return;
    const next = `${pinInput}${digit}`;
    setPinInput(next);
    if (next.length === PIN_LENGTH) {
      void verifyPin(next);
    }
  };

  if (!hasPin || unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen app-bg app-text flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl app-card p-6">
        <p className="text-[13px] app-muted text-center">Securite</p>
        <h1 className="text-[24px] font-semibold text-center mt-1">Entrez votre PIN</h1>
        {lockRemainingMs > 0 && (
          <p className="text-[13px] text-[color:var(--app-danger)] text-center mt-2">
            Verrouille - reessayez dans {formatSeconds(lockRemainingMs)}s
          </p>
        )}
        <div className="flex justify-center gap-3 mt-6 mb-5">
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <span
              key={i}
              className={`w-3 h-3 rounded-full ${i < pinInput.length ? 'bg-[color:var(--app-accent)]' : 'app-surface-3'}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => (
            <button
              key={digit}
              onClick={() => appendDigit(digit)}
              disabled={lockRemainingMs > 0}
              className="min-h-[52px] rounded-xl app-surface-2 text-[20px] font-semibold active:opacity-70 disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={() => setPinInput((v) => v.slice(0, -1))}
            disabled={lockRemainingMs > 0}
            className="min-h-[52px] rounded-xl app-surface-2 text-[14px] font-semibold active:opacity-70 disabled:opacity-50"
          >
            Effacer
          </button>
          <button
            onClick={() => {
              void verifyPin(pinInput);
            }}
            disabled={lockRemainingMs > 0}
            className="min-h-[52px] rounded-xl app-accent-bg text-[14px] font-semibold active:opacity-70 disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
