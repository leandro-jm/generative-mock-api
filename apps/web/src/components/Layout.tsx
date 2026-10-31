import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { BookOpen, Boxes, KeyRound, LayoutDashboard, LayoutGrid, LogOut, Menu, Settings, Sparkles, UserCircle, Users } from "lucide-react";
import { patch, post } from "../lib/api";
import { useSession } from "../lib/session";
import { Button, ErrorBox, Field, Input, Modal, cx, useToast } from "./ui";

const NAV = [
  { to: "/", label: "Painel", icon: LayoutDashboard, end: true },
  { to: "/modulos", label: "Módulos", icon: Boxes },
  { to: "/views", label: "Galeria de views", icon: LayoutGrid },
  { to: "/ia", label: "Gerar com IA", icon: Sparkles },
  { to: "/documentacao", label: "Documentação", icon: BookOpen },
  { to: "/api-keys", label: "API Keys", icon: KeyRound },
  { to: "/usuarios", label: "Usuários", icon: Users, admin: true },
  { to: "/configuracoes", label: "Configurações", icon: Settings, admin: true },
];

export function Layout() {
  const { user, appName, secretGenerated } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);

  const logout = async () => {
    await post("/admin-api/logout");
    qc.clear();
    navigate("/login");
    location.reload();
  };

  return (
    <div className="min-h-screen lg:flex">
      <aside className={cx("fixed inset-y-0 left-0 z-50 w-60 shrink-0 border-r border-slate-200 bg-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 dark:border-slate-800 dark:bg-slate-900", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="truncate font-semibold">{appName}</span>
        </div>
        <nav className="space-y-0.5 p-3">
          {NAV.filter((n) => !n.admin || user.role === "admin").map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)} className={({ isActive }) => cx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800")}>
              <n.icon className="size-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 p-3 dark:border-slate-800">
          <button onClick={() => setProfile(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
            <UserCircle className="size-8 text-slate-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{user.role}</span>
            </span>
          </button>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={logout}>
            <LogOut className="size-3.5" /> Sair
          </Button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden dark:border-slate-800 dark:bg-slate-900">
          <button onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="size-5" />
          </button>
          <span className="font-semibold">{appName}</span>
        </header>
        {secretGenerated && user.role === "admin" && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            APP_SECRET não está definido: o servidor gerou um e guardou no volume de dados. Em produção, defina APP_SECRET no ambiente (Dokploy → Environment).
          </div>
        )}
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <ProfileModal open={profile} onClose={() => setProfile(false)} />
    </div>
  );
}

function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(user.name);
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await patch("/admin-api/me", { name, ...(password ? { currentPassword, password } : {}) });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Perfil atualizado.");
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Meu perfil" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <div className="space-y-4">
        <ErrorBox error={error} />
        <p className="text-sm text-slate-500">{user.email}</p>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Senha atual" help="Só para trocar a senha."><Input type="password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
        <Field label="Nova senha" help="Mínimo de 8 caracteres."><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
      </div>
    </Modal>
  );
}
