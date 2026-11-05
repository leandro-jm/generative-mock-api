// Aplica o tema antes do primeiro paint (mesma chave do ThemeProvider em src/lib/theme.tsx).
(function () {
  var t = null;
  try {
    t = localStorage.getItem("mock-api:theme");
  } catch (e) {}
  if (t !== "light" && t !== "dark") t = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
})();
