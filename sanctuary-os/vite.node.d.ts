declare const __dirname: string;
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number): any;
declare function clearTimeout(handle: any): void;

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function statSync(path: string): { mtimeMs: number };
  const fsDefault: {
    existsSync: typeof existsSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    mkdirSync: typeof mkdirSync;
    statSync: typeof statSync;
  };
  export default fsDefault;
}

declare module "path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(p: string): string;
  export const sep: string;
  const pathDefault: {
    resolve: typeof resolve;
    join: typeof join;
    dirname: typeof dirname;
    sep: string;
  };
  export default pathDefault;
}

