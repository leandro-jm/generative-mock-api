import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react";
import { get, type TableColumn, type TableView } from "../../lib/api";
import { date, dateTime, money, number } from "../../lib/format";
import { Badge, Button, ErrorBox, Input, Loading, cx } from "../ui";

function cell(col: TableColumn, row: TableView["data"][0]) {
  const v = row[col.key];
  const label = row._labels?.[col.key];
  if (v === null || v === undefined || v === "") return <span className="text-fg-3">—</span>;
  switch (col.format) {
    case "currency": return money(v);
    case "number": return <span className="tabular-nums">{number(v)}{col.unit ? ` ${col.unit}` : ""}</span>;
    case "date": return date(v);
    case "datetime": return dateTime(v);
    case "boolean": return v ? <Badge tone="green">Sim</Badge> : <Badge>Não</Badge>;
    case "image": return <img src={String(v)} alt="" className="h-10 w-auto rounded" loading="lazy" />;
    case "badge": return <Badge tone="accent">{String(v)}</Badge>;
    case "tags": return <span className="flex flex-wrap gap-1">{(v as string[]).map((t) => <Badge key={t}>{t}</Badge>)}</span>;
    case "ref": return <span title={`#${v}`}>{String(label ?? `#${v}`)}</span>;
    case "refs": return <span className="flex flex-wrap gap-1">{((label as string[]) ?? (v as number[])).map((t, i) => <Badge key={i}>{String(t)}</Badge>)}</span>;
    case "email": return <a href={`mailto:${v}`} className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">{String(v)}</a>;
    case "link": return <a href={String(v)} target="_blank" rel="noreferrer" className="text-fg underline decoration-line-strong underline-offset-2 hover:decoration-fg">{String(v)}</a>;
    default: return <span className="line-clamp-2">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>;
  }
}

/** View table: consome /_views/table com busca, ordenação e paginação. */
export function DataTable({ module, resource, onEdit, onDelete, extraQuery = "" }: { module: string; resource: string; onEdit?: (id: number) => void; onDelete?: (id: number) => void; extraQuery?: string }) {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>("");
  const params = new URLSearchParams({ page: String(page), limit: "15", ...(search ? { q: search } : {}), ...(sort ? { sort } : {}) });
  const url = `/api/v1/${module}/${resource}/_views/table?${params}${extraQuery}`;
  const { data, error, isLoading, isFetching } = useQuery({ queryKey: ["table", module, resource, page, search, sort, extraQuery], queryFn: () => get<TableView>(url), placeholderData: (prev) => prev });

  const toggleSort = (key: string) => {
    setPage(1);
    setSort(sort === key ? `-${key}` : sort === `-${key}` ? "" : key);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(q); }} className="flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-fg-3" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="pl-8" />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>
      <ErrorBox error={error} />
      {isLoading ? <Loading /> : data && (
        <>
          <div className={cx("overflow-x-auto rounded-xl border border-line", isFetching && "opacity-70")}>
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-left text-xs tracking-wide text-fg-3 uppercase">
                <tr>
                  {data.columns.map((c) => (
                    <th key={c.key} className="px-3 py-2 font-medium whitespace-nowrap">
                      {c.sortable ? (
                        <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          {sort === c.key && <ArrowUp className="size-3" />}
                          {sort === `-${c.key}` && <ArrowDown className="size-3" />}
                        </button>
                      ) : c.label}
                    </th>
                  ))}
                  {(onEdit || onDelete) && <th className="w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {data.data.map((row) => (
                  <tr key={row.id} className="hover:bg-hover">
                    {data.columns.map((c) => <td key={c.key} className="max-w-xs px-3 py-2 align-middle">{cell(c, row)}</td>)}
                    {(onEdit || onDelete) && (
                      <td className="px-2 text-right whitespace-nowrap">
                        {onEdit && <button className="rounded p-1.5 text-fg-3 hover:bg-hover" onClick={() => onEdit(row.id)} aria-label="Editar"><Pencil className="size-4" /></button>}
                        {onDelete && <button className="rounded p-1.5 text-danger hover:bg-danger-dim" onClick={() => onDelete(row.id)} aria-label="Excluir"><Trash2 className="size-4" /></button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {data.data.length === 0 && <p className="p-6 text-center text-sm text-fg-2">Nenhum registro.</p>}
          </div>
          <div className="flex items-center justify-between text-sm text-fg-2">
            <span>{number(data.meta.total)} registros</span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
              <span>{data.meta.page} / {data.meta.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
