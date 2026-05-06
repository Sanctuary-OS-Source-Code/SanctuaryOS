import { useState, useEffect } from 'react';

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  window.dispatchEvent(new CustomEvent('sanctuary-toast', { detail: { message, type } }));
}

export function ToastProvider() {
  const [toast, setToast] = useState<{message: string, type: string, id: number} | null>(null);

  useEffect(() => {
    const handler = (e: any) => {
      setToast({ message: e.detail.message, type: e.detail.type, id: Date.now() });
      setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener('sanctuary-toast', handler);
    return () => window.removeEventListener('sanctuary-toast', handler);
  }, []);

  if (!toast) return null;

  return (
    <div key={toast.id} className="fixed bottom-10 right-10 z-[99999] animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className={`px-6 py-4 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-4 ${
        toast.type === 'success' ? 'bg-green-500/20 border-green-500/50 text-green-400' : 
        toast.type === 'error' ? 'bg-red-500/20 border-red-500/50 text-red-400' : 
        'bg-[var(--accent)] border-transparent text-[var(--bg)]'
      }`}>
        <span className="text-xl">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
        <span className="font-black text-xs uppercase tracking-widest">{toast.message}</span>
      </div>
    </div>
  );
}
