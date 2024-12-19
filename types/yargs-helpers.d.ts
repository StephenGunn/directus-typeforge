declare module "yargs/helpers" {
  import { ArgumentsCamelCase } from "yargs";

  export function hideBin(argv: string[]): string[];
}
