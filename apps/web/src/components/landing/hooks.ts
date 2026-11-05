import { useCallback, useEffect, useRef, useState } from "react";

/** true quando o usuário pediu menos movimento no SO. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Índice que avança sozinho a cada `ms` (pausa com a aba oculta e com movimento reduzido).
 * `select(i)` fixa um item e segura o ciclo por `holdMs` antes de voltar a avançar.
 */
export function useCycle(count: number, ms: number, holdMs = 9000): [number, (i: number) => void] {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const holdUntil = useRef(0);
  useEffect(() => {
    if (reduced || count < 2) return;
    const id = setInterval(() => {
      if (document.hidden || Date.now() < holdUntil.current) return;
      setIndex((i) => (i + 1) % count);
    }, ms);
    return () => clearInterval(id);
  }, [count, ms, reduced]);
  const select = useCallback(
    (i: number) => {
      holdUntil.current = Date.now() + holdMs;
      setIndex(i);
    },
    [holdMs],
  );
  return [index, select];
}

/** Digita e apaga as palavras em ciclo. Com movimento reduzido, mostra a última fixa. */
export function useTypewriter(words: string[], { type = 75, erase = 35, hold = 1700 } = {}): string {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ word: 0, chars: 0, erasing: false });
  useEffect(() => {
    if (reduced) return;
    const current = words[state.word];
    let delay = state.erasing ? erase : type;
    let next = state;
    if (!state.erasing && state.chars < current.length) next = { ...state, chars: state.chars + 1 };
    else if (!state.erasing) {
      delay = hold;
      next = { ...state, erasing: true };
    } else if (state.chars > 0) next = { ...state, chars: state.chars - 1 };
    else {
      delay = 250;
      next = { word: (state.word + 1) % words.length, chars: 0, erasing: false };
    }
    const id = setTimeout(() => setState(next), delay);
    return () => clearTimeout(id);
  }, [state, words, type, erase, hold, reduced]);
  if (reduced) return words[words.length - 1];
  return words[state.word].slice(0, state.chars);
}

/** Atualiza --mx/--my (posição do ponteiro em %) no elemento, no máximo uma vez por frame. */
export function usePointerSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}
