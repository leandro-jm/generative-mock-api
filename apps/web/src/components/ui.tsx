import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Check, Copy, Loader2, Monitor, Moon, Sun, X } from "lucide-react";
import { ApiError } from "../lib/api";
import { useTheme, type ThemePref } from "../lib/theme";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50",
  secondary: "border border-line bg-surface text-fg hover:border-line-strong hover:bg-hover disabled:opacity-50",
  ghost: "text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-50",
  danger: "border border-danger-border bg-danger-dim text-danger hover:brightness-110 disabled:opacity-50",
};

export function Button({ variant = "primary", size = "md", loading, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed", size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3.5 text-sm", VARIANTS[variant], className)}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

// Sem largura explícita no className, ocupa a linha toda.
const width = (className?: string) => (/(^|\s)(w-|max-w-|flex-1)/.test(className ?? "") ? "" : "w-full");
const inputCls = "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 hover:border-line-strong focus:border-fg-3 focus:ring-2 focus:ring-fg/10 focus-visible:outline-none disabled:bg-surface-2 disabled:text-fg-3";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, width(className), className)} />;
}
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, "w-full min-h-24", className)} />;
}
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputCls, width(className), "pr-8", className)}>
      {children}
    </select>
  );
}

export function Field({ label, help, error, required, children, className }: { label: string; help?: ReactNode; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cx("block space-y-1.5", className)}>
      <span className="text-sm font-medium text-fg-2">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
      {children}
      {error ? <span className="block text-xs text-danger">{error}</span> : help ? <span className="block text-xs text-fg-3">{help}</span> : null}
    </label>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={cx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", checked ? "bg-primary" : "bg-surface-3 ring-1 ring-line-strong ring-inset")}>
      <span className={cx("inline-block size-4 rounded-full shadow transition-transform", checked ? "bg-primary-fg" : "bg-fg-3", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-[10px] border border-line bg-surface shadow-[var(--shadow)]", className)}>{children}</div>;
}

const TONES = {
  slate: "border-line bg-surface-2 text-fg-2",
  accent: "border-line-strong bg-surface-3 text-fg",
  green: "border-success-border bg-success-dim text-success",
  amber: "border-warning-border bg-warning-dim text-warning",
  rose: "border-danger-border bg-danger-dim text-danger",
  sky: "border-sky-border bg-sky-dim text-sky",
};
export type Tone = keyof typeof TONES;
export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-xs font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-fg-3", className)} />;
}

export function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-8 text-sm text-fg-2">
      <Spinner /> {label}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div className="rounded-lg border border-danger-border bg-danger-dim p-3 text-sm text-danger">
      <p className="font-medium">{e.message ?? String(error)}</p>
      {e.errors?.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {e.errors.slice(0, 8).map((x, i) => (
            <li key={i}>{x.field ? <b>{x.field}: </b> : null}{x.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line-strong p-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-fg-2">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-[var(--backdrop)] p-4 backdrop-blur-[2px] sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={cx("w-full rounded-[10px] border border-line bg-surface shadow-[var(--shadow-pop)]", wide ? "max-w-4xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-fg-3 hover:bg-hover hover:text-fg" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} disabled={t.disabled} onClick={() => onChange(t.value)} className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-40", value === t.value ? "border-fg text-fg" : "border-transparent text-fg-3 hover:text-fg")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {label ?? (done ? "Copiado" : "Copiar")}
    </Button>
  );
}

export function Code({ children }: { children: string }) {
  return (
    <div className="group relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-fg">{children}</pre>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={children} />
      </div>
    </div>
  );
}

// ---------- Avisos ----------
type Toast = { id: number; tone: "ok" | "error"; text: string };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, tone, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed right-4 bottom-4 z-[2000] space-y-2">
        {items.map((t) => (
          <div key={t.id} className={cx("anim-fade-up max-w-sm rounded-lg border px-4 py-2.5 text-sm shadow-[var(--shadow-pop)]", t.tone === "ok" ? "border-line-strong bg-surface-3 text-fg" : "border-danger-border bg-danger-dim text-danger")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Marca e tema ----------
/** Logo do painel (as linhas do favicon), em currentColor para seguir o tema. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cx("size-7", className)}>
      <rect x="1.25" y="1.25" width="29.5" height="29.5" rx="7" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M9 11h14M9 16h10M9 21h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

const THEME_OPTIONS: { id: ThemePref; label: string; icon: typeof Sun }[] = [
  { id: "system", label: "Sistema", icon: Monitor },
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
];

/** Seletor de tema (Sistema / Claro / Escuro), como o do MCP Gateway. */
export function ThemeSelector({ align = "right", up }: { align?: "left" | "right"; up?: boolean }) {
  const { pref, resolved, setPref } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const Icon = pref === "system" ? Monitor : resolved === "light" ? Sun : Moon;
  const current = THEME_OPTIONS.find((o) => o.id === pref)!;
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Tema" aria-haspopup="menu" aria-expanded={open} title={`Tema: ${current.label}`} className="inline-flex size-8 items-center justify-center rounded-lg text-fg-2 transition-colors hover:bg-hover hover:text-fg">
        <Icon className="size-4" />
      </button>
      {open && (
        <div role="menu" aria-label="Tema" className={cx("anim-fade-in absolute z-[1500] w-40 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]", align === "right" ? "right-0" : "left-0", up ? "bottom-full mb-1" : "top-full mt-1")}>
          <div className="px-2 py-1 text-[11px] font-medium tracking-wider text-fg-3 uppercase">Tema</div>
          {THEME_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="menuitemradio" aria-checked={pref === o.id} onClick={() => { setPref(o.id); setOpen(false); }} className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-hover", pref === o.id ? "text-fg" : "text-fg-2")}>
              <o.icon className="size-4" />
              <span className="flex-1 text-left">{o.label}</span>
              {pref === o.id && <Check className="size-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
