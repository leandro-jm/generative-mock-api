import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { get, type Card as CardData, type PageMeta } from "../../lib/api";
import { Badge, Button, ErrorBox, Loading } from "../ui";

export function CardItem({ card }: { card: CardData }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-surface">
      {card.image && <img src={card.image} alt="" loading="lazy" className="aspect-[2/3] w-full bg-surface-2 object-cover" />}
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="leading-tight font-semibold">{card.title}</p>
          {card.subtitle && <p className="text-sm text-fg-2">{card.subtitle}</p>}
        </div>
        {card.badges.length > 0 && <div className="flex flex-wrap gap-1">{card.badges.slice(0, 4).map((b, i) => <Badge key={i} tone="accent">{b}</Badge>)}</div>}
        {card.description && <p className="line-clamp-3 text-xs text-fg-2">{card.description}</p>}
        <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-1 border-t border-line pt-2 text-xs">
          {card.fields.map((f) => (
            <div key={f.key} className="min-w-0">
              <dt className="text-fg-3">{f.label}</dt>
              <dd className="truncate font-medium">{f.value === null || f.value === undefined ? "—" : String(f.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** View card: grade paginada de /_views/card. */
export function CardGrid({ module, resource }: { module: string; resource: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useQuery({ queryKey: ["cards", module, resource, page], queryFn: () => get<{ data: CardData[]; meta: PageMeta }>(`/api/v1/${module}/${resource}/_views/card?limit=12&page=${page}`), placeholderData: (p) => p });
  if (isLoading) return <Loading />;
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data?.data.map((c) => <CardItem key={c.id} card={c} />)}
      </div>
      {data && data.meta.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="self-center text-sm text-fg-2">{page} / {data.meta.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}
