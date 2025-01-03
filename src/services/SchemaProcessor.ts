/* eslint-disable @typescript-eslint/no-explicit-any */

import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import type {
  ExtendedSchemaObject,
  FieldItems,
  GenerateTypeScriptOptions,
  CollectionSchema,
} from "../types";
import { TypeTracker } from "./TypeTracker";
import { toPascalCase } from "../utils/string";
import { extractRefFromPathItem, findSystemCollections } from "../utils/schema";

/**
 * Processes OpenAPI schemas and generates TypeScript types
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private options: GenerateTypeScriptOptions;

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = options;
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    const collectionSchemas = this.collectSchemas();
    return this.generateTypeDefinitions(collectionSchemas);
  }

  /**
   * Collects all schemas from the spec
   */
  private collectSchemas(): Record<string, CollectionSchema> {
    const schemas: Record<string, CollectionSchema> = {};

    // Process path schemas
    if (this.spec.paths) {
      this.processPathSchemas(schemas);
    }

    // Process system collections
    this.processSystemCollections(schemas);

    return schemas;
  }

  /**
   * Processes schemas from paths
   */
  private processPathSchemas(schemas: Record<string, CollectionSchema>): void {
    for (const [path, pathItem] of Object.entries(this.spec.paths ?? {})) {
      const collectionMatch = /^\/items\/(?<collection>[a-zA-Z0-9_]+)$/.exec(
        path,
      );
      const collection = collectionMatch?.groups?.["collection"];
      if (!collection) continue;

      const ref = extractRefFromPathItem(pathItem as OpenAPIV3.PathItemObject);
      if (!ref) continue;

      const schema = (this.spec.components?.schemas?.[ref] ??
        {}) as OpenAPIV3.SchemaObject;
      const refName = toPascalCase(ref);
      this.generateSDKInterface(schema, refName, collection);
      if (this.typeTracker.hasValidContent(refName)) {
        schemas[collection] = { ref, schema };
      }
    }
  }

  /**
   * Processes system collection schemas
   */
  private processSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    const systemCollections = findSystemCollections(this.spec);
    for (const collection of systemCollections) {
      const schema = Object.values(this.spec.components?.schemas ?? {}).find(
        (schema) => {
          const schemaObject = schema as ExtendedSchemaObject;
          return schemaObject["x-collection"] === collection;
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        const refName = toPascalCase(collection);
        this.generateSDKInterface(schema, refName, collection);
        if (this.typeTracker.hasValidContent(refName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }
  }

  /**
   * Generates TypeScript interface from schema
   */
  private generateSDKInterface(
    schema: OpenAPIV3.SchemaObject,
    refName: string,
    collectionName?: string,
  ): void {
    if (!schema.properties) return;

    const nonSystemFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collectionName),
    );

    if (nonSystemFields.length === 0) return;

    let interfaceStr = `export type ${refName} = {\n`;
    const properties: string[] = [];

    for (const [propName, propSchema] of nonSystemFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      interfaceStr += this.generatePropertyDefinition(propName, propSchema);
    }

    interfaceStr += "};\n\n";
    this.typeTracker.addType(refName, interfaceStr, properties);
  }

  /**
   * Generates TypeScript definition for a property
   */
  private generatePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(propName, propSchema);
    }

    if ("type" in propSchema) {
      if (propSchema.type === "array" && "items" in propSchema) {
        return this.generateArrayPropertyDefinition(propName, propSchema);
      }

      if (propName.endsWith("_id") || propName === "item") {
        return this.generateIdPropertyDefinition(propName, propSchema);
      }

      return this.generateBasicPropertyDefinition(propName, propSchema);
    }

    return `  ${propName}?: unknown;\n`;
  }

  /**
   * Checks if a field is a system field
   */
  private isSystemField(fieldName: string, collection?: string): boolean {
    if (fieldName === "id") return false;
    if (!collection?.startsWith("directus_")) return false;

    if (collection && collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    }

    return false;
  }

  /**
   * Generates final type definitions
   */
  private generateTypeDefinitions(
    collectionSchemas: Record<string, CollectionSchema>,
  ): string {
    const validCollections = Object.entries(collectionSchemas).filter(
      ([, { ref }]) => this.typeTracker.hasValidContent(toPascalCase(ref)),
    );

    let source = "";
    if (validCollections.length > 0) {
      source += `\nexport type ${this.options.typeName} = {\n`;
      for (const [collectionName, { ref }] of validCollections) {
        const pascalCaseName = toPascalCase(ref);
        const schema = (this.spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];
        source += `  ${collectionName}: ${pascalCaseName}${isSingleton ? "" : "[]"};\n`;
      }
      source += `};\n\n`;
    }

    source += this.typeTracker.getAllValidTypes();
    return source.replace(/\| \{\}\[\]/g, "");
  }

  private getRefType(ref: string): string {
    if (ref.startsWith("#/components/schemas/")) {
      const type = ref.split("/").pop() as string;
      const schemas = this.spec.components?.schemas;
      const exists = schemas && type in schemas;

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
  }

  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    // TODO: Improve type safety here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (propSchema as any).oneOf?.find(
      (item: any) => "$ref" in item,
    )?.$ref;
    if (ref) {
      const refType = this.getRefType(ref);
      return `  ${propName}?: string${refType !== "string" ? ` | ${refType}` : ""};\n`;
    }
    return `  ${propName}?: unknown;\n`;
  }

  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    // TODO: Improve type safety here
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (propSchema as any).items as FieldItems;
    if (items.oneOf?.some((item) => item.$ref)) {
      const refIndex = items.oneOf.findIndex((item) => item.$ref);
      const refType = this.getRefType(items.oneOf[refIndex].$ref);
      const newRef = refType.includes("Items")
        ? refType
        : refType !== "string"
          ? `Directus${refType}`
          : refType;
      return `  ${propName}?: string[]${newRef !== "string" ? ` | ${newRef}[]` : ""};\n`;
    } else {
      if (items.type === "integer") {
        return `  ${propName}?: number[];\n`;
      } else if (items.type === "string") {
        return `  ${propName}?: string[];\n`;
      }
      return `  ${propName}?: unknown[];\n`;
    }
  }

  private generateIdPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    const refCollectionName = propName.replace(/_id$/, "");
    const refType = toPascalCase(refCollectionName);
    const schemas = this.spec.components?.schemas ?? {};
    const refTypeExists = Object.keys(schemas).some(
      (schemaName) => schemaName === refType,
    );
    return `  ${propName}?: string${refTypeExists ? ` | ${refType}` : ""};\n`;
  }

  private generateBasicPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    const baseType = propSchema.type === "integer" ? "number" : propSchema.type;
    const optional = "nullable" in propSchema && propSchema.nullable === true;

    // Handle special string formats
    if (baseType === "string" && "format" in propSchema) {
      const format = propSchema.format;
      if (
        format === "date" ||
        format === "time" ||
        format === "date-time" ||
        format === "timestamp"
      ) {
        return `  ${propName}${optional ? "?" : ""}: 'datetime';\n`;
      }
      if (format === "json") {
        return `  ${propName}${optional ? "?" : ""}: 'json';\n`;
      }
      if (format === "csv") {
        return `  ${propName}${optional ? "?" : ""}: 'csv';\n`;
      }
    }

    // Handle object type as json
    if (baseType === "object") {
      return `  ${propName}${optional ? "?" : ""}: 'json';\n`;
    }

    // Handle array type as csv
    if (baseType === "array") {
      return `  ${propName}${optional ? "?" : ""}: 'csv';\n`;
    }

    return `  ${propName}${optional ? "?" : ""}: ${baseType};\n`;
  }
}
