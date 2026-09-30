export type ClassValue =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | { [key: string]: boolean | null | undefined }
  | ClassValue[];

function flatten(value: ClassValue, output: string[]): void {
  if (!value) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    output.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flatten(item, output);
    return;
  }
  for (const [key, enabled] of Object.entries(value)) {
    if (enabled) output.push(key);
  }
}

export function cn(...values: ClassValue[]): string {
  const output: string[] = [];
  for (const value of values) flatten(value, output);
  return output.join(" ");
}
