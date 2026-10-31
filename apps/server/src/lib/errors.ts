// Erros no formato application/problem+json (RFC 9457).
export class HttpError extends Error {
  status: number;
  title: string;
  extra?: Record<string, unknown>;
  constructor(status: number, title: string, detail?: string, extra?: Record<string, unknown>) {
    super(detail ?? title);
    this.status = status;
    this.title = title;
    this.extra = extra;
  }
}

export const badRequest = (detail: string, extra?: Record<string, unknown>) => new HttpError(400, "Requisição inválida", detail, extra);
export const unauthorized = (detail = "Envie X-API-Key ou Authorization: Bearer <token>.") => new HttpError(401, "Não autenticado", detail);
export const forbidden = (detail = "Sem permissão para esta operação.") => new HttpError(403, "Acesso negado", detail);
export const notFound = (detail = "Recurso não encontrado.") => new HttpError(404, "Não encontrado", detail);
export const conflict = (detail: string, extra?: Record<string, unknown>) => new HttpError(409, "Conflito", detail, extra);

const STATUS_TITLES: Record<number, string> = {
  400: "Requisição inválida",
  401: "Não autenticado",
  403: "Acesso negado",
  404: "Não encontrado",
  409: "Conflito",
  410: "Expirado",
  422: "Entidade não processável",
  428: "Confirmação necessária",
  429: "Muitas requisições",
  500: "Erro interno",
  502: "Bad gateway",
  503: "Serviço indisponível",
  504: "Gateway timeout",
};

export function statusTitle(status: number): string {
  return STATUS_TITLES[status] ?? "Erro";
}

export function problem(status: number, title: string, detail: string, instance?: string, extra?: Record<string, unknown>) {
  return { type: "about:blank", title, status, detail, ...(instance ? { instance } : {}), ...extra };
}
