// Tipos para el motor de cálculo de pesadas (implementación en calculo.mjs).
// Mantener en sync con las funciones exportadas de ese archivo.

export interface TaraConfig {
  plastico: number;
  yute: number;
  henequen: number;
}

export const TARA_DEFAULT: TaraConfig;

export interface CalculoConfig {
  /** Tara en kg por unidad de cada material. Default = TARA_DEFAULT. */
  tara?: Partial<TaraConfig>;
  /** kg por quintal según el tipo. null/0 = no aplica (cacao) → quintales null. */
  factorQuintal?: number | null;
}

/** Captura cruda de una pesada (lo que teclea el pesador). */
export interface PesadaInput {
  m1_sacos?: number | string;
  m1_kgs?: number | string;
  m2_sacos?: number | string;
  m2_kgs?: number | string;
  plastico?: number | string;
  yute?: number | string;
  henequen?: number | string;
}

/** Derivados de una pesada, listos para persistir. */
export interface PesadaDerivados {
  sacos_total: number;
  kg_brutos: number;
  desc_plastico: number;
  desc_yute: number;
  desc_henequen: number;
  tara_kg: number;
  kg_netos: number;
  /** null cuando el tipo no aplica (cacao). */
  quintales: number | null;
}

export interface EntradaTotales {
  total_sacos: number;
  kg_brutos: number;
  tara_kg: number;
  kg_netos: number;
  plastico: number;
  yute: number;
  henequen: number;
  quintales: number | null;
}

export function redondear(n: number, d?: number): number;
export function calcularPesada(p: PesadaInput, cfg?: CalculoConfig): PesadaDerivados;
export function validarPesada(
  p: PesadaInput,
  cfg?: CalculoConfig,
): { ok: boolean; errores: string[] };
export function totalizarEntrada(
  pesadas: Array<PesadaDerivados & Partial<Pick<PesadaInput, 'plastico' | 'yute' | 'henequen'>>>,
): EntradaTotales;
