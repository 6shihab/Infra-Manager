import { createContext, useCallback, useContext, useReducer, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration: number;
}

interface ToastState {
    toasts: Toast[];
}

type ToastAction =
    | { type: 'ADD'; toast: Toast }
    | { type: 'REMOVE'; id: string };

// ─── Reducer ─────────────────────────────────────────────────────────────────

const MAX_TOASTS = 5;

function reducer(state: ToastState, action: ToastAction): ToastState {
    switch (action.type) {
        case 'ADD': {
            const toasts = [...state.toasts, action.toast];
            return { toasts: toasts.length > MAX_TOASTS ? toasts.slice(toasts.length - MAX_TOASTS) : toasts };
        }
        case 'REMOVE':
            return { toasts: state.toasts.filter(t => t.id !== action.id) };
        default:
            return state;
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface ToastContextValue {
    dispatch: React.Dispatch<ToastAction>;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// ─── Individual Toast Item ────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />,
    error:   <XCircle    className="h-5 w-5 text-red-400 shrink-0" />,
    info:    <Info       className="h-5 w-5 text-blue-400 shrink-0" />,
    warning: <AlertTriangle className="h-5 w-5 text-yellow-400 shrink-0" />,
};

const BORDER: Record<ToastType, string> = {
    success: 'border-l-emerald-500',
    error:   'border-l-red-500',
    info:    'border-l-blue-500',
    warning: 'border-l-yellow-500',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        timerRef.current = setTimeout(() => onRemove(toast.id), toast.duration);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [toast.id, toast.duration, onRemove]);

    return (
        <div
            className={`flex items-start gap-3 w-full sm:w-80 max-w-full px-4 py-3 rounded-xl border border-white/10 border-l-4 ${BORDER[toast.type]} bg-black/60 backdrop-blur-md shadow-2xl animate-in slide-in-from-right-5 duration-300`}
        >
            {ICONS[toast.type]}
            <p className="flex-1 text-sm text-gray-200 leading-snug break-words">{toast.message}</p>
            <button
                onClick={() => onRemove(toast.id)}
                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors mt-0.5"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, { toasts: [] });

    const remove = useCallback((id: string) => {
        dispatch({ type: 'REMOVE', id });
    }, []);

    return (
        <ToastContext.Provider value={{ dispatch }}>
            {children}
            <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:right-5 sm:bottom-5 z-50 flex flex-col gap-3 items-end pointer-events-none">
                {state.toasts.map(toast => (
                    <div key={toast.id} className="pointer-events-auto">
                        <ToastItem toast={toast} onRemove={remove} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

let _id = 0;
function nextId() { return String(++_id); }

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside ToastProvider');

    const add = useCallback((type: ToastType, message: string, duration?: number) => {
        const defaultDuration = type === 'error' ? 5000 : 4000;
        ctx.dispatch({
            type: 'ADD',
            toast: { id: nextId(), type, message, duration: duration ?? defaultDuration },
        });
    }, [ctx]);

    return {
        success: (message: string, duration?: number) => add('success', message, duration),
        error:   (message: string, duration?: number) => add('error',   message, duration),
        info:    (message: string, duration?: number) => add('info',    message, duration),
        warning: (message: string, duration?: number) => add('warning', message, duration),
    };
}
