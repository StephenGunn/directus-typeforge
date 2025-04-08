#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readSchema, generateTypeScript } from "./index.js";
import fs from "fs/promises";
import { resolve } from "path";
import ora from "ora";

/**
 * Main function that runs the CLI
 */
const main = async (): Promise<void> => {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("directus-typeforge")
    .usage("$0 [options]")
    .option("snapshotFile", {
      alias: "i",
      type: "string",
      description: "Path to schema snapshot file",
    })
    .option("fieldsFile", {
      alias: "f",
      type: "string",
      description: "Path to fields data file (from /fields endpoint)",
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
        "Use interface references for relation types (string | User instead of just User)",
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
      default: true,
    })
    .option("includeSystemFields", {
      alias: "s",
      type: "boolean",
      description: "Include all system fields in system collections",
      default: true,
    })
    .option("addTypedocNotes", {
      alias: "d",
      type: "boolean",
      description: "Add JSDoc comments from field notes",
      default: true,
    })
    .check((argv) => {
      if (argv.snapshotFile) {
        // If snapshot file is provided, other options are not required
        return true;
      } else if (argv.host) {
        // If host is provided, either token or both email and password must be present
        if (argv.token || (argv.email && argv.password)) {
          return true;
        }
        throw new Error(
          "When using --host, either --token (-t) or both --email (-e) and --password (-p) must be specified.",
        );
      }
      throw new Error(
        "Either --snapshotFile (-i) or --host (-h) with appropriate authentication options must be specified.",
      );
    })
    .example(
      "$0 -i ./schema-snapshot.json -o ./types/schema.d.ts",
      "Generate types from a schema snapshot file",
    )
    .example(
      "$0 -h https://example.com -e admin@example.com -p password -o ./types/schema.d.ts",
      "Generate types from a live Directus server",
    )
    .example(
      "$0 -h https://example.com -t your-static-token -o ./types/schema.d.ts",
      "Generate types from a live Directus server using a token",
    )
    .example(
      "$0 -i ./schema-snapshot.json -m -o ./types/schema.d.ts",
      "Generate types with required fields (no optional '?' syntax)",
    )
    .example(
      "$0 -i ./schema-snapshot.json -d -o ./types/schema.d.ts",
      "Generate types with JSDoc comments from field notes",
    )
    .example(
      "$0 -i ./schema-snapshot.json -f ./all-fields.json -o ./types/schema.d.ts",
      "Generate types using dynamic system field detection from a fields file",
    )
    .strict()
    .help()
    .parseAsync();

  try {
    const spinner = ora("Processing Directus schema...").start();

    // Read schema data
    spinner.text = "Reading schema...";
    const schema = await readSchema({
      snapshotFile: argv.snapshotFile,
      fieldsFile: argv.fieldsFile,
      host: argv.host,
      email: argv.email,
      password: argv.password,
      token: argv.token,
    });

    // Create options object for schema functions
    const schemaOptions = {
      snapshotFile: argv.snapshotFile,
      fieldsFile: argv.fieldsFile,
      host: argv.host,
      email: argv.email,
      password: argv.password,
      token: argv.token,
    };

    // Generate TypeScript types with dynamic system field detection
    spinner.text = "Generating TypeScript types...";
    const ts = await generateTypeScript(
      schema, 
      {
        typeName: argv.typeName,
        useTypeReferences: argv.useTypeReferences,
        useTypes: argv.useTypes,
        makeRequired: argv.makeRequired,
        includeSystemFields: argv.includeSystemFields,
        addTypedocNotes: argv.addTypedocNotes,
      },
      schemaOptions
    );

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
