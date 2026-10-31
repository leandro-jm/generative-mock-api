// Títulos fictícios em português (filmes e livros), montados de listas de palavras.
import type { Faker } from "@faker-js/faker";

const M = ["Farol", "Silêncio", "Horizonte", "Labirinto", "Inverno", "Segredo", "Eclipse", "Abismo", "Relógio", "Espelho", "Navio", "Deserto", "Jardim", "Pacto", "Código", "Oráculo", "Vento", "Rio", "Cais", "Último Verão", "Sinal", "Destino", "Retrato", "Mapa", "Eco"];
const F = ["Cidade", "Sombra", "Noite", "Estrada", "Fronteira", "Ilha", "Tempestade", "Memória", "Promessa", "Chave", "Torre", "Maré", "Estação", "Lua", "Ponte", "Floresta", "Carta", "Voz", "Herança", "Fuga"];
const ADJ: [string, string][] = [["Perdido", "Perdida"], ["Esquecido", "Esquecida"], ["Silencioso", "Silenciosa"], ["Proibido", "Proibida"], ["Eterno", "Eterna"], ["Vermelho", "Vermelha"], ["Secreto", "Secreta"], ["Partido", "Partida"], ["Invisível", "Invisível"], ["Distante", "Distante"], ["Selvagem", "Selvagem"], ["Dourado", "Dourada"]];
const PLACES = ["Vila Serena", "Porto Escuro", "Santa Aurora", "Monte Claro", "Lagoa Funda", "Vale do Eco", "Pedra Branca", "Rio das Almas", "Serra Alta", "Baía Quieta", "Campo Largo", "Ilha do Norte"];
const EN_N = ["Lighthouse", "Silence", "Horizon", "Maze", "Winter", "Secret", "Eclipse", "Abyss", "Mirror", "Harbor", "Garden", "Signal", "Shadow", "Night", "Road", "Border", "Island", "Storm", "Memory", "Tower", "Tide", "Bridge"];
const EN_A = ["Lost", "Forgotten", "Silent", "Forbidden", "Eternal", "Crimson", "Secret", "Broken", "Invisible", "Distant", "Wild", "Golden"];

export function filmTitle(f: Faker): { titulo: string; original: string } {
  const masc = f.datatype.boolean();
  const noun = masc ? f.helpers.arrayElement(M) : f.helpers.arrayElement(F);
  const art = masc ? "O" : "A";
  const adj = f.helpers.arrayElement(ADJ)[masc ? 0 : 1];
  const place = f.helpers.arrayElement(PLACES);
  const other = f.helpers.arrayElement(F);
  const titulo = f.helpers.arrayElement([
    `${art} ${noun} ${adj}`,
    `${art} ${noun} de ${place}`,
    `Além d${art.toLowerCase()} ${noun}`,
    `Os Últimos Dias de ${place}`,
    `${noun} e ${other}`,
    `${art} ${adj === "Invisível" ? noun : noun} Sem Nome`,
    `Quando ${art.toLowerCase()} ${noun} Acordar`,
    `${place}`,
    `${art} ${noun} ${adj}: Parte ${f.helpers.arrayElement(["II", "III"])}`,
  ]);
  const original = `The ${f.helpers.arrayElement(EN_A)} ${f.helpers.arrayElement(EN_N)}`;
  return { titulo, original };
}

const TEMAS = ["Arquitetura de Software", "Finanças Pessoais", "Gestão de Pessoas", "Astronomia Amadora", "Culinária Regional", "Jardinagem Urbana", "Fotografia Digital", "Filosofia Estoica", "História do Brasil Colonial", "Programação Funcional", "Design de Interfaces", "Psicologia Positiva", "Economia Comportamental", "Liderança Remota", "Ciência de Dados"];

export function bookTitle(f: Faker, genero: string): { titulo: string; subtitulo: string | null } {
  if (["Técnico", "Negócios", "Autoajuda", "Divulgação científica", "História"].includes(genero)) {
    const tema = f.helpers.arrayElement(TEMAS);
    const titulo = f.helpers.arrayElement([`${tema} na Prática`, `Introdução à ${tema}`, `Guia Completo de ${tema}`, `${tema} para Iniciantes`, `O Livro da ${tema}`, `Pequeno Manual de ${tema}`]);
    return { titulo, subtitulo: f.helpers.arrayElement(["Conceitos, exemplos e exercícios", "Do básico ao avançado", "Um guia para o dia a dia", null, "Edição revista e ampliada"]) };
  }
  const masc = f.datatype.boolean();
  const noun = masc ? f.helpers.arrayElement(M) : f.helpers.arrayElement(F);
  const art = masc ? "O" : "A";
  const adj = f.helpers.arrayElement(ADJ)[masc ? 0 : 1];
  const titulo = f.helpers.arrayElement([
    `${art} ${noun} ${adj}`,
    `Crônicas de ${f.helpers.arrayElement(PLACES)}`,
    `Cartas para ${f.helpers.arrayElement(["Ninguém", "Amanhã", "o Mar", "a Lua", "Você"])}`,
    `${art} Biblioteca das ${f.helpers.arrayElement(["Horas Perdidas", "Vozes", "Marés", "Sombras"])}`,
    `${noun} de ${f.helpers.arrayElement(["Papel", "Vidro", "Sal", "Areia", "Cinzas"])}`,
    `Tudo o que ${art.toLowerCase()} ${noun} Guardou`,
    `${f.helpers.arrayElement(PLACES)}, ${f.number.int({ min: 1890, max: 1999 })}`,
  ]);
  return { titulo, subtitulo: f.helpers.arrayElement([null, null, "Um romance", "Contos", "Uma história de família"]) };
}
