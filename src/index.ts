import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { SYSTEM_FIELDS } from "./system_fields";
import { readFile, writeFile, unlink } from "fs/promises";
import { z } from "zod";
import tmp from "tmp";

tmp.setGracefulCleanup();

export type ReadSpecFileOptions = {
  readonly specFile?: string;
  readonly host?: string;
  readonly email?: string;
  readonly password?: string;
};

const DirectusAuthResponse = z.object({
  data: z.object({
    access_token: z.string(),
    expires: z.number().int(),
    refresh_token: z.string(),
  }),
});

type ExtendedSchemaObject = OpenAPIV3.SchemaObject & {
  "x-collection"?: string;
  "x-singleton"?: boolean;
  "meta"?: {
    locked?: boolean;
  };
};

type FieldItems = {
  oneOf?: { type: string; $ref: string }[];
  type?: string;
};

const isReferenceObject = (
  obj:
    | OpenAPIV3.ReferenceObject
    | OpenAPIV3.SchemaObject
    | OpenAPIV3.ResponseObject,
): obj is OpenAPIV3.ReferenceObject => {
  return "$ref" in obj;
};

const isArraySchema = (
  schema: OpenAPIV3.SchemaObject,
): schema is OpenAPIV3.ArraySchemaObject => {
  return schema.type === "array" && "items" in schema;
};

const extractRefFromPathItem = (
  pathItem: OpenAPIV3.PathItemObject,
): string | null => {
  const operation = pathItem.get;
  if (!operation) return null;

  const response200 = operation.responses["200"];
  if (!response200 || isReferenceObject(response200)) return null;

  const content = response200.content?.["application/json"];
  if (!content) return null;

  const schema = content.schema;
  if (!schema || isReferenceObject(schema)) return null;

  if (!("properties" in schema) || !schema.properties) return null;

  const dataProp = schema.properties["data"];
  if (!dataProp || isReferenceObject(dataProp)) return null;

  if (!isArraySchema(dataProp)) return null;

  const items = dataProp.items;
  if (!items || !isReferenceObject(items)) return null;

  const refPattern = /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/;
  const match = refPattern.exec(items.$ref);
  return match?.groups?.ref ?? null;
};

export const readSpecFile = async (
  options: ReadSpecFileOptions,
): Promise<OpenAPIV3.Document> => {
  if (typeof options.specFile === "string") {
    const fileContent = await readFile(options.specFile, { encoding: "utf-8" });
    return JSON.parse(fileContent) as OpenAPIV3.Document;
  }

  if (!options.host || !options.email || !options.password) {
    throw new Error(
      "Either specFile must be specified or host, email, and password must all be provided.",
    );
  }

  const loginResponse = await fetch(new URL("/auth/login", options.host), {
    body: JSON.stringify({
      email: options.email,
      password: options.password,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
    .then((response) => {
      if (!response.ok)
        throw new Error(`Authentication failed: ${response.statusText}`);
      return response.json();
    })
    .then((json) => DirectusAuthResponse.parse(json));

  const specResponse = await fetch(new URL("/server/specs/oas", options.host), {
    headers: {
      "Authorization": `Bearer ${loginResponse.data.access_token}`,
      "Content-Type": "application/json",
    },
  });

  if (!specResponse.ok) {
    throw new Error(`Failed to fetch OpenAPI spec: ${specResponse.statusText}`);
  }

  return specResponse.json() as Promise<OpenAPIV3.Document>;
};

export type GenerateTypeScriptOptions = {
  readonly typeName: string;
};

const toPascalCase = (str: string): string =>
  str
    .replace(/[_\- ]+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

const findSystemCollections = (spec: OpenAPIV3.Document): string[] => {
  const systemCollections: string[] = [];
  if (spec.components?.schemas) {
    for (const schema of Object.values(spec.components.schemas)) {
      const schemaObject = schema as ExtendedSchemaObject;
      if (schemaObject["x-collection"]) {
        const match = /^(directus_[a-zA-Z0-9_]+)$/.exec(
          schemaObject["x-collection"],
        );
        if (match?.[1]) {
          systemCollections.push(match[1]);
        }
      }
    }
  }
  return systemCollections;
};

const generateSDKInterface = (
  schema: OpenAPIV3.SchemaObject,
  refName: string,
  collectionName?: string,
  spec?: OpenAPIV3.Document,
): string => {
  if (!schema.properties) return "";

  const isSystemField = (fieldName: string, collection?: string): boolean => {
    if (!collection?.startsWith("directus_")) {
      return false;
    }

    if (collection && collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    }

    return false;
  };

  const nonSystemFields = Object.entries(schema.properties).filter(
    ([propName]) => !isSystemField(propName, collectionName),
  );

  if (nonSystemFields.length === 0) return "";

  let interfaceStr = `export type ${refName} = {\n`;

  const getRefType = (ref: string): string => {
    if (ref.startsWith("#/components/schemas/")) {
      const type = ref.split("/").pop() as string;
      const schemas = spec?.components?.schemas;
      const exists = schemas && type in schemas;

      writeFile("spec.json", JSON.stringify(spec), { encoding: "utf-8" });

      if (!exists) return "string";

      return type === "Users"
        ? "DirectusUsers"
        : type === "Files"
          ? "DirectusFiles"
          : type === "Roles"
            ? "DirectusRoles"
            : type === "Fields"
              ? "DirectusFields"
              : type === "Collections"
                ? "DirectusCollections"
                : type === "Operations"
                  ? "DirectusOperations"
                  : type === "Flows"
                    ? "DirectusFlows"
                    : type === "Versions"
                      ? "DirectusVersions"
                      : type;
    }
    return "string";
  };

  for (const [propName, propSchema] of nonSystemFields) {
    if (typeof propSchema !== "object") continue;

    if ("oneOf" in propSchema) {
      const ref = propSchema.oneOf?.find((item) => "$ref" in item)?.$ref;
      if (ref) {
        const refType = getRefType(ref);
        interfaceStr += `  ${propName}?: string${refType !== "string" ? ` | ${refType}` : ""};\n`;
      }
    } else if ("type" in propSchema) {
      if (propSchema.type === "array" && "items" in propSchema) {
        const items = propSchema.items as FieldItems;
        if (items.oneOf?.some((item) => item.$ref)) {
          const refIndex = items.oneOf.findIndex((item) => item.$ref);
          const refType = getRefType(items.oneOf[refIndex].$ref);
          const newRef = refType.includes("Items")
            ? refType
            : refType !== "string"
              ? `Directus${refType}`
              : refType;
          interfaceStr += `  ${propName}?: string[]${newRef !== "string" ? ` | ${newRef}[]` : ""};\n`;
        } else {
          if (items.type === "integer") {
            interfaceStr += `  ${propName}?: number[];\n`;
          } else if (items.type === "string") {
            interfaceStr += `  ${propName}?: string[];\n`;
          } else {
            interfaceStr += `  ${propName}?: unknown[];\n`;
          }
        }
      } else if (propName.endsWith("_id") || propName === "item") {
        const refCollectionName = propName.endsWith("_id")
          ? propName.replace(/_id$/, "")
          : propName;
        if (propName === "item") {
          interfaceStr += `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
        } else {
          const refType = toPascalCase(refCollectionName);
          const schemas = spec?.components?.schemas ?? {};
          const refTypeExists = Object.keys(schemas).some(
            (schemaName) => schemaName === refType,
          );
          interfaceStr += `  ${propName}?: string${refTypeExists ? ` | ${refType}` : ""};\n`;
        }
      } else {
        const type = propSchema.type === "integer" ? "number" : propSchema.type;
        const optional =
          "nullable" in propSchema && propSchema.nullable === true;
        interfaceStr += `  ${propName}${optional ? "?" : ""}: ${type};\n`;
      }
    }
  }

  interfaceStr += "}\n\n";
  return interfaceStr;
};

export const generateTypeScript = async (
  spec: OpenAPIV3.Document,
  { typeName }: GenerateTypeScriptOptions,
): Promise<string> => {
  const tempFile = tmp.fileSync({ postfix: ".json" });
  const tempFilePath = tempFile.name;

  try {
    await writeFile(tempFilePath, JSON.stringify(spec), { encoding: "utf-8" });
    let source = "";

    const interfaces: string[] = [];
    const collectionSchemas: Record<
      string,
      {
        ref: string;
        schema: OpenAPIV3.SchemaObject;
      }
    > = {};

    if (spec.paths) {
      for (const [path, pathItem] of Object.entries(spec.paths)) {
        const pathItemTyped = pathItem as OpenAPIV3.PathItemObject;
        const collectionMatch = /^\/items\/(?<collection>[a-zA-Z0-9_]+)$/.exec(
          path,
        );
        const collection = collectionMatch?.groups?.["collection"];

        if (!collection) continue;

        const ref = extractRefFromPathItem(pathItemTyped);
        if (!ref) continue;

        const schema = (spec.components?.schemas?.[ref] ??
          {}) as OpenAPIV3.SchemaObject;
        const refName = toPascalCase(ref);
        const sdkInterface = generateSDKInterface(
          schema,
          refName,
          collection,
          spec,
        );
        if (sdkInterface) {
          interfaces.push(sdkInterface);
          collectionSchemas[collection] = { ref, schema };
        }
      }
    }

    const systemCollections = findSystemCollections(spec);

    for (const collection of systemCollections) {
      const schema = Object.values(spec.components?.schemas ?? {}).find(
        (schema) => {
          const schemaObject = schema as ExtendedSchemaObject;
          return schemaObject["x-collection"] === collection;
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        const refName = toPascalCase(collection);
        const sdkInterface = generateSDKInterface(
          schema,
          refName,
          collection,
          spec,
        );
        if (sdkInterface) {
          interfaces.push(sdkInterface);
          collectionSchemas[collection] = { ref: collection, schema };
        }
      }
    }

    source += `\nexport type ${typeName} = {\n`;
    const collectionEntries = Object.entries(collectionSchemas);
    if (collectionEntries.length > 0) {
      for (const [collectionName, { ref }] of collectionEntries) {
        const pascalCaseName = toPascalCase(ref);
        const schema = (spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];
        source += `  ${collectionName}: ${pascalCaseName}${isSingleton ? "" : "[]"};\n`;
      }
    }
    source += `};\n\n`;

    source += interfaces.join("");
    source = source.replace(/\| \{\}\[\]/g, "");

    return source;
  } finally {
    try {
      await unlink(tempFilePath);
    } catch {
      // Ignore errors during cleanup
    }
  }
};
