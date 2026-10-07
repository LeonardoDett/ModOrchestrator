declare const process: { env: { NODE_ENV?: string } };

/**
 * Verdadeiro fora de produção. Lê o texto literal `process.env.NODE_ENV`, que bundlers
 * (Vite, tsup/esbuild, webpack) substituem; sem substituição e sem `process` (navegador
 * puro) o acesso lança e conta como produção.
 */
export function isDev(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    return false;
  }
}
