import type { BuiltinModule } from "../engine/types.ts";
import { filmesModule } from "./filmes/index.ts";
import { livrosModule } from "./livros/index.ts";
import { rhModule } from "./rh/index.ts";

export const BUILTIN_MODULES: BuiltinModule[] = [rhModule, filmesModule, livrosModule];
