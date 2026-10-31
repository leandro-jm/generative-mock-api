import { useQuery } from "@tanstack/react-query";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { ApiError, get } from "./lib/api";
import { SessionCtx, type Session } from "./lib/session";
import { Loading } from "./components/ui";
import { Layout } from "./components/Layout";
import { SetupPage } from "./pages/Setup";
import { LoginPage } from "./pages/Login";
import { DashboardPage } from "./pages/Dashboard";
import { ModulesPage } from "./pages/Modules";
import { ModulePage } from "./pages/Module";
import { GalleryPage } from "./pages/Gallery";
import { AiPage } from "./pages/Ai";
import { DocsPage } from "./pages/Docs";
import { ApiKeysPage } from "./pages/ApiKeys";
import { UsersPage } from "./pages/Users";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const location = useLocation();
  const setup = useQuery({ queryKey: ["setup-status"], queryFn: () => get<{ needsSetup: boolean; setupTokenRequired: boolean; appName: string }>("/admin-api/setup/status") });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await get<Session>("/admin-api/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    enabled: setup.data?.needsSetup === false,
  });

  if (setup.isLoading || (setup.data?.needsSetup === false && me.isLoading)) return <Loading />;
  if (setup.data?.needsSetup) return location.pathname === "/setup" ? <SetupPage tokenRequired={setup.data.setupTokenRequired} /> : <Navigate to="/setup" replace />;
  if (!me.data) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage appName={setup.data?.appName ?? "Mock API"} />} />
        <Route path="*" element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />} />
      </Routes>
    );
  }
  const admin = me.data.user.role === "admin";
  return (
    <SessionCtx.Provider value={me.data}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="modulos" element={<ModulesPage />} />
          <Route path="modulos/:slug" element={<ModulePage />} />
          <Route path="views" element={<GalleryPage />} />
          <Route path="ia" element={<AiPage />} />
          <Route path="documentacao" element={<DocsPage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          {admin && <Route path="usuarios" element={<UsersPage />} />}
          {admin && <Route path="configuracoes" element={<SettingsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SessionCtx.Provider>
  );
}
