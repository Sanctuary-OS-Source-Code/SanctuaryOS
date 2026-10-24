declare const __dirname: string;

declare const process: {
  env: Record<string, string | undefined>;
  cwd(): string;
};

declare module "fs" {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding?: string): void;
  export function statSync(path: string): { mtimeMs: number };
  const fsDefault: {
    existsSync: typeof existsSync;
    readFileSync: typeof readFileSync;
    writeFileSync: typeof writeFileSync;
    statSync: typeof statSync;
  };
  export default fsDefault;
}

declare module "path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  const pathDefault: {
    resolve: typeof resolve;
    join: typeof join;
  };
  export default pathDefault;
}

