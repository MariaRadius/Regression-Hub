'use client';

import { useState, useCallback, useEffect } from 'react';

let toastListeners = [];

export function showToast(message, type = 'success', duration = 3000) {
  const id = Date.now() + Math.random();
  toastListeners.forEach((fn) => fn({ id, message, type, duration }));
}

export default function ToastProvider() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.map((t) => t.id === toast.id ? { ...t, leaving: true } : t));
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 220);
      }, toast.duration);
    };
    toastListeners.push(handler);
    return () => { toastListeners = toastListeners.filter((fn) => fn !== handler); };
  }, []);

  if (!toasts.length) return null;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type} ${t.leaving ? 'leaving' : ''}`}>
          <span style={{ fontWeight: 700 }}>{icons[t.type] || '•'}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
