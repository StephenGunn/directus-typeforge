#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readSpecFile, generateTypeScript } from "./index.js";
import fs from "fs/promises";
import { resolve } from "path";
import ora from "ora";

// Initialize yargs with hideBin to process command-line arguments
const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("directus-typeforge")
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
    .option("token", {
      alias: "t",
      type: "string",
      description: "Admin bearer token for authentication",
    })
    .option("outFile", {
      alias: "o",
      type: "string",
      description: "Output file for TypeScript types",
    })
    .option("typeName", {
      alias: "n",
      type: "string",
      description: "Root type name",
      default: "ApiCollections",
    })
    .option("useTypeReferences", {
      alias: "r",
      type: "boolean",
      description:
        "Use interface references for relation types - only turn off for debugging",
      default: true,
    })
    .option("useTypes", {
      alias: "u",
      type: "boolean",
      description: "Use 'type' instead of 'interface' for type definitions",
      default: false,
    })
    .option("makeRequired", {
      alias: "m",
      type: "boolean",
      description: "Make all fields required (no optional '?' syntax)",
      default: false,
    })
    .option("includeSystemFields", {
      alias: "s",
      type: "boolean",
      description: "Include all system fields in system collections",
      default: false,
    })
    .check((argv) => {
      if (argv.specFile) {
        // If specFile is provided, host, email, password, and token are not required
        return true;
      } else if (argv.host) {
        // If host is provided, either token or both email and password must be present
        if (argv.token || (argv.email && argv.password)) {
          return true;
        }
        throw new Error(
          "When using --host, either --token (-k) or both --email (-e) and --password (-p) must be specified.",
        );
      }
      throw new Error(
        "Either --specFile (-i) must be provided or --host (-h) with appropriate authentication options must be specified.",
      );
    })
    .example(
      "$0 -i ./directus.oas.json -o ./types/schema.d.ts",
      "Generate types from a spec file",
    )
    .example(
      "$0 -h https://example.com -e admin@example.com -p password -o ./types/schema.d.ts",
      "Generate types from a live Directus server using email/password",
    )
    .example(
      "$0 -h https://example.com -k your-static-token -o ./types/schema.d.ts",
      "Generate types from a live Directus server using a static token",
    )
    .example(
      "$0 -i ./directus.oas.json -m -o ./types/schema.d.ts",
      "Generate types with required fields (no optional modifiers)",
    )
    .example(
      "$0 -i ./directus.oas.json -s -o ./types/schema.d.ts",
      "Generate types with all system fields included",
    )
    .strict()
    .help()
    .parseAsync();

  try {
    const spinner = ora("Processing Directus schema...").start();

    // Read the OpenAPI spec
    spinner.text = "Reading OpenAPI schema...";
    const spec = await readSpecFile({
      specFile: argv.specFile,
      host: argv.host,
      email: argv.email,
      password: argv.password,
      token: argv.token,
    });

    // Generate TypeScript types
    spinner.text = "Generating TypeScript types...";
    const ts = await generateTypeScript(spec, {
      typeName: argv.typeName,
      useTypeReferences: argv.useTypeReferences,
      useTypes: argv.useTypes,
      makeRequired: argv.makeRequired,
      includeSystemFields: argv.includeSystemFields,
    });

    // Output the generated types
    if (typeof argv.outFile === "string") {
      const outPath = resolve(process.cwd(), argv.outFile);
      await fs.writeFile(outPath, ts, "utf-8");
      spinner.succeed(`TypeScript types have been written to ${outPath}`);
    } else {
      spinner.stop();
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
