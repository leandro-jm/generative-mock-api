import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, get, type FormView, type UiField } from "../../lib/api";
import { applyMask } from "../../lib/format";
import { Button, ErrorBox, Field, Input, Loading, Select, Switch, Tabs, Textarea, cx } from "../ui";

function Widget({ name, ui, value, onChange }: { name: string; ui: UiField; value: unknown; onChange: (v: unknown) => void }) {
  const str = value === null || value === undefined ? "" : String(value);
  switch (ui.widget) {
    case "textarea":
      return <Textarea value={str} onChange={(e) => onChange(e.target.value || null)} />;
    case "number":
    case "currency":
      return (
        <div className="flex items-center gap-2">
          {ui.prefix && <span className="text-sm text-fg-2">{ui.prefix}</span>}
          <Input type="number" step={ui.widget === "currency" ? "0.01" : "any"} min={ui.min} max={ui.max} value={str} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
          {ui.suffix && <span className="text-sm text-fg-2">{ui.suffix}</span>}
        </div>
      );
    case "switch":
      return <div><Switch checked={Boolean(value)} onChange={onChange} label={ui.label} /></div>;
    case "date":
      return <Input type="date" value={str.slice(0, 10)} onChange={(e) => onChange(e.target.value || null)} />;
    case "datetime":
      return <Input type="datetime-local" value={str ? str.slice(0, 16) : ""} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
    case "time":
      return <Input type="time" value={str} onChange={(e) => onChange(e.target.value || null)} />;
    case "radio":
      return (
        <div className="flex flex-wrap gap-3 pt-1">
          {ui.options?.map((o) => (
            <label key={String(o.value)} className="flex items-center gap-1.5 text-sm">
              <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-[var(--accent)]" />
              {o.label}
            </label>
          ))}
        </div>
      );
    case "select":
      return (
        <Select value={str} onChange={(e) => { const o = ui.options?.find((x) => String(x.value) === e.target.value); onChange(o ? o.value : null); }}>
          <option value="">— selecione —</option>
          {ui.options?.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </Select>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? value : [];
      return (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-line-strong p-2">
          {ui.options?.map((o) => (
            <label key={String(o.value)} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-[var(--accent)]" checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case "tags":
      return <Input value={Array.isArray(value) ? value.join(", ") : ""} onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="separe por vírgula" />;
    case "map-point": {
      const c = (value as { coordinates?: number[] } | null)?.coordinates ?? [];
      const set = (i: number, v: string) => {
        const next = [c[0] ?? 0, c[1] ?? 0];
        next[i] = Number(v);
        onChange({ type: "Point", coordinates: next });
      };
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input type="number" step="any" placeholder="latitude" value={c[1] ?? ""} onChange={(e) => set(1, e.target.value)} />
          <Input type="number" step="any" placeholder="longitude" value={c[0] ?? ""} onChange={(e) => set(0, e.target.value)} />
        </div>
      );
    }
    case "map-line":
    case "map-polygon":
    case "json":
      return <JsonInput value={value} onChange={onChange} />;
    case "email":
    case "tel":
    case "url":
      return <Input type={ui.widget} value={str} onChange={(e) => onChange(e.target.value || null)} />;
    default:
      return <Input value={str} onChange={(e) => onChange(ui.mask ? applyMask(ui.mask, e.target.value) || null : e.target.value || null)} placeholder={ui.mask} />;
  }
}

function JsonInput({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <Textarea
      className={cx("font-mono text-xs", bad && "border-danger-border")}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        try {
          onChange(e.target.value.trim() ? JSON.parse(e.target.value) : null);
          setBad(false);
        } catch {
          setBad(true);
        }
      }}
    />
  );
}

/** View form: monta o formulário a partir de /_views/form (schema + uiSchema + etapas) e envia para a API. */
export function DynamicForm({ module, resource, id, onSaved, onCancel }: { module: string; resource: string; id?: number; onSaved?: (rec: Record<string, unknown>) => void; onCancel?: () => void }) {
  const url = `/api/v1/${module}/${resource}/_views/form?mode=${id ? `edit&id=${id}` : "create"}`;
  const { data, error, isLoading } = useQuery({ queryKey: ["form", module, resource, id], queryFn: () => get<FormView>(url) });
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setValues(data.initialValues);
  }, [data]);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;

  const fieldErrors = saveError instanceof ApiError ? Object.fromEntries(saveError.errors.map((e) => [e.field.split(".")[0], e.message])) : {};
  const stepHasError = (i: number) => data.steps[i].fields.some((f) => fieldErrors[f]);

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      // Campos opcionais vazios não vão no corpo (o schema não aceita string vazia em formatos).
      const body = Object.fromEntries(Object.entries(values).filter(([k, v]) => !(v === null && !data.uiSchema[k]?.required)));
      const rec = await api<Record<string, unknown>>(data.submit.url, { method: data.submit.method, body });
      onSaved?.(rec);
    } catch (e) {
      setSaveError(e);
      if (e instanceof ApiError) {
        const first = data.steps.findIndex((s) => s.fields.some((f) => e.errors.some((x) => x.field.startsWith(f))));
        if (first >= 0) setStep(first);
      }
    } finally {
      setSaving(false);
    }
  };

  const current = data.steps[step] ?? data.steps[0];
  return (
    <div className="space-y-4">
      {data.steps.length > 1 && <Tabs tabs={data.steps.map((s, i) => ({ value: String(i), label: <span className={stepHasError(i) ? "text-danger" : ""}>{i + 1}. {s.title}</span> }))} value={String(step)} onChange={(v) => setStep(Number(v))} />}
      <ErrorBox error={saveError} />
      <div className="grid gap-4 sm:grid-cols-2">
        {current.fields.map((name) => {
          const ui = data.uiSchema[name];
          if (!ui) return null;
          const wide = ["textarea", "multiselect", "json", "map-line", "map-polygon"].includes(ui.widget);
          return (
            <Field key={name} label={ui.label} required={ui.required} help={ui.help} error={fieldErrors[name]} className={wide ? "sm:col-span-2" : ""}>
              <Widget name={name} ui={ui} value={values[name]} onChange={(v) => setValues((x) => ({ ...x, [name]: v }))} />
            </Field>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 border-t border-line pt-4">
        <div>{onCancel && <Button variant="ghost" onClick={onCancel}>Cancelar</Button>}</div>
        <div className="flex gap-2">
          {step > 0 && <Button variant="secondary" onClick={() => setStep(step - 1)}>Voltar</Button>}
          {step < data.steps.length - 1 && <Button variant="secondary" onClick={() => setStep(step + 1)}>Próxima etapa</Button>}
          <Button loading={saving} onClick={submit}>{data.mode === "create" ? "Criar" : "Salvar"}</Button>
        </div>
      </div>
    </div>
  );
}
