#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readSpecFile, generateTypeScript } from "./index.js"; // Adjust the import path as needed
import fs from "fs/promises";
import { resolve } from "path";
import type { OpenAPI3 } from "openapi-typescript"; // Adjust if necessary

// Define the shape of the options object based on your ReadSpecFileOptions type
//interface ReadSpecFileOptions {
//  specFile?: string;
//  host?: string;
//  email?: string;
//  password?: string;
//}
//
//// Define the shape of the argv object based on your GenerateTypeScriptOptions type
//interface GenerateTypeScriptOptions {
//  includeSystemCollections?: boolean;
//  typeName: string;
//}
//
// Combine all options into a single type
//type CLIOptions = ReadSpecFileOptions &
//  GenerateTypeScriptOptions & {
//    outFile?: string;
//  };

// Initialize yargs with hideBin to process command-line arguments
const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("directus-typeforge") // Set script name for help messages
    .usage("$0 [options]")
    .option("specFile", {
      alias: "i",
      type: "string",
      description: "Path to OpenAPI spec file",
    })
    .option("host", {
      alias: "h",
      type: "string",
      description: "Directus host URL",
    })
    .option("email", {
      alias: "e",
      type: "string",
      description: "Email for authentication",
    })
    .option("password", {
      alias: "p",
      type: "string",
      description: "Password for authentication",
    })
    .option("outFile", {
      alias: "o",
      type: "string",
      description: "Output file for TypeScript types",
    })
    .option("typeName", {
      alias: "t",
      type: "string",
      description: "Root type name",
      default: "Schema",
    })
    .check((argv) => {
      if (argv.specFile) {
        // If specFile is provided, host, email, and password are not required
        return true;
      } else if (argv.host && argv.email && argv.password) {
        // If specFile is not provided, host, email, and password must be present
        return true;
      }
      throw new Error(
        "Either --specFile (-i) must be provided or --host (-h), --email (-e), and --password (-p) must all be specified.",
      );
    })
    .strict()
    .help()
    .parseAsync();

  try {
    // Read the OpenAPI spec
    // @ts-expect-error: The specFile option is required
    const spec: OpenAPI3 = await readSpecFile(argv);

    // Generate TypeScript types
    // @ts-expect-error: The typeName option is required
    const ts: string = await generateTypeScript(spec, {
      includeSystemCollections: argv.includeSystemCollections,
      typeName: argv.typeName,
    });

    // Output the generated types
    if (typeof argv.outFile === "string") {
      const outPath = resolve(process.cwd(), argv.outFile);
      await fs.writeFile(outPath, ts, "utf-8");
      console.log(`TypeScript types have been written to ${outPath}`);
    } else {
      console.log(ts);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unexpected error occurred.");
    }
    process.exit(1);
  }
};

// Execute the main function
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
