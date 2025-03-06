import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import type {
  ExtendedSchemaObject,
  GenerateTypeScriptOptions,
  CollectionSchema,
} from "../types";
import { TypeTracker } from "./TypeTracker";
import { toPascalCase } from "../utils/string";
import {
  extractRefFromPathItem,
  findSystemCollections,
  isReferenceObject,
  isArraySchema,
  hasRef,
} from "../utils/schema";

/**
 * Processes OpenAPI schemas and generates TypeScript types
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private options: GenerateTypeScriptOptions;
  private MAX_NESTING_DEPTH = 2; // Control the maximum nesting depth for references

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = {
      ...options,
      maxNestedDepth: options.maxNestedDepth ?? this.MAX_NESTING_DEPTH,
    };
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

      interfaceStr += this.generatePropertyDefinition(propName, propSchema, 0);
    }

    interfaceStr += "};\n\n";
    this.typeTracker.addType(refName, interfaceStr, properties);
  }

  /**
   * Generates TypeScript definition for a property
   */
  private generatePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    nestingDepth: number,
  ): string {
    // Check if we've reached the max nesting depth
    const atMaxDepth = nestingDepth >= this.options.maxNestedDepth!;

    // Check if it's a reference object
    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(
        propName,
        propSchema,
        atMaxDepth,
      );
    }

    // Handle oneOf case - check safely if oneOf exists and is an array
    if ("oneOf" in propSchema && Array.isArray(propSchema.oneOf)) {
      const schemaWithOneOf = propSchema as OpenAPIV3.SchemaObject & {
        oneOf: any[];
      };
      return this.generateOneOfPropertyDefinition(
        propName,
        schemaWithOneOf,
        atMaxDepth,
      );
    }

    // Handle array case
    if (isArraySchema(propSchema)) {
      return this.generateArrayPropertyDefinition(
        propName,
        propSchema,
        nestingDepth,
      );
    }

    // Handle id fields (relations)
    if (
      (propName.endsWith("_id") || propName === "item") &&
      propSchema.type === "string"
    ) {
      return this.generateIdPropertyDefinition(
        propName,
        propSchema,
        atMaxDepth,
      );
    }

    // Handle basic types
    return this.generateBasicPropertyDefinition(propName, propSchema);
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

  /**
   * Generate property definition for a reference
   */
  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
    atMaxDepth: boolean,
  ): string {
    const refType = this.getRefType(propSchema.$ref);
    return `  ${propName}?: ${atMaxDepth ? "string" : refType};\n`;
  }

  /**
   * Generate property definition for a oneOf schema
   */
  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject & { oneOf: Array<unknown> },
    atMaxDepth: boolean,
  ): string {
    // Find an item with a $ref in the oneOf array
    const refItem = propSchema.oneOf.find((item) => hasRef(item));

    if (refItem && hasRef(refItem)) {
      const refType = this.getRefType(refItem.$ref);
      // If at max depth, only show string type, not the reference
      return `  ${propName}?: string${atMaxDepth ? "" : refType !== "string" ? ` | ${refType}` : ""};\n`;
    }

    return `  ${propName}?: unknown;\n`;
  }

  /**
   * Generate property definition for an array schema
   */
  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
    nestingDepth: number,
  ): string {
    const newNestingDepth = nestingDepth + 1;
    const atMaxDepth = newNestingDepth >= this.options.maxNestedDepth!;

    // Handle items - check if it's a reference object
    if (isReferenceObject(propSchema.items)) {
      const refType = this.getRefType(propSchema.items.$ref);
      return `  ${propName}?: string[]${atMaxDepth ? "" : refType !== "string" ? ` | ${refType}[]` : ""};\n`;
    }

    // Handle items with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => hasRef(item));

      if (refItem && hasRef(refItem)) {
        const refType = this.getRefType(refItem.$ref);
        const newRef = refType.includes("Items")
          ? refType
          : refType !== "string"
            ? `Directus${refType}`
            : refType;

        // Use type references if option is enabled
        if (this.options.useTypeReferences && newRef !== "string") {
          return `  ${propName}?: string[] | Array<{ id: string }>;\n`;
        } else {
          // If at max depth, only show string[] type
          return `  ${propName}?: string[]${atMaxDepth ? "" : newRef !== "string" ? ` | ${newRef}[]` : ""};\n`;
        }
      }
    }

    // Handle based on item type
    if ("type" in propSchema.items) {
      if (propSchema.items.type === "integer") {
        return `  ${propName}?: number[];\n`;
      } else if (propSchema.items.type === "string") {
        return `  ${propName}?: string[];\n`;
      }
    }

    return `  ${propName}?: unknown[];\n`;
  }

  /**
   * Generate property definition for an ID field (relation)
   */
  private generateIdPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    atMaxDepth: boolean,
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

    // Use type references if option is enabled
    if (this.options.useTypeReferences && refTypeExists) {
      return `  ${propName}?: string | { id: string };\n`;
    } else {
      // If at max depth, only show string type
      return `  ${propName}?: string${atMaxDepth ? "" : refTypeExists ? ` | ${refType}` : ""};\n`;
    }
  }

  /**
   * Generate property definition for basic type (string, number, etc.)
   */
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

  /**
   * Get normalized reference type from a $ref string
   */
  private getRefType(ref: string): string {
    if (ref.startsWith("#/components/schemas/")) {
      const type = ref.split("/").pop() as string;
      const schemas = this.spec.components?.schemas;
      const exists = schemas && type in schemas;

      if (!exists) return "string";

      // Map common Directus types
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
}
