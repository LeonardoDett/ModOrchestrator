declare const process: { env: { NODE_ENV?: string } } | undefined;

/** Verdadeiro fora de produção; sem `process` (navegador puro) conta como produção. */
export function isDev(): boolean {
  return typeof process !== "undefined" && process.env.NODE_ENV !== "production";
}
