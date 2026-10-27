// Sem @types/node no projeto: especificadores não literais, tipados localmente (como em skills-install.test.ts).
interface Fs {
  readFileSync(file: string, encoding: "utf8"): string;
  readdirSync(dir: string): string[];
  statSync(file: string): { isDirectory(): boolean };
}
interface Path {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
  dirname(p: string): string;
  relative(from: string, to: string): string;
  sep: string;
}
const load = async <T,>(name: string) => (await import(/* @vite-ignore */ name)) as T;
const [fs, path, url] = await Promise.all([
  load<Fs>("node:fs"),
  load<Path>("node:path"),
  load<{ fileURLToPath(url: string): string }>("node:url"),
]);

/** Raiz de `src/`. */
export const SRC = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
export { fs, path };

/** Arquivos `.ts`/`.tsx` que não são teste, recursivamente. */
export function walkSources(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return walkSources(full);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}
