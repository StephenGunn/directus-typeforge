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
} from "../utils/schema";

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

      // For system collections, we'll only include custom fields
      if (collection.startsWith("directus_")) {
        this.generateSystemCollectionFields(schema, collection);
      } else {
        this.generateSDKInterface(schema, refName, collection);
      }

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
        this.generateSystemCollectionFields(schema, collection);

        const refName = toPascalCase(collection);
        if (this.typeTracker.hasValidContent(refName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }
  }

  /**
   * Generates interface for system collection's custom fields
   */
  private generateSystemCollectionFields(
    schema: OpenAPIV3.SchemaObject,
    collection: string,
  ): void {
    if (!schema.properties) return;

    // Get only non-system fields for the system collection
    const customFields = Object.entries(schema.properties).filter(
      ([propName]) => !this.isSystemField(propName, collection),
    );

    if (customFields.length === 0) {
      // No custom fields
      return;
    }

    // Use the collection name directly for type naming
    const typeName = toPascalCase(collection);
    let interfaceStr = `export type ${typeName} = {\n`;
    const properties: string[] = [];

    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);
      interfaceStr += this.generatePropertyDefinition(propName, propSchema);
    }

    interfaceStr += "};\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
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
    propSchema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  ): string {
    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(propName);
    }

    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(propName, propSchema);
    }

    if (propSchema.type === "array" && "items" in propSchema) {
      return this.generateArrayPropertyDefinition(
        propName,
        propSchema as OpenAPIV3.ArraySchemaObject,
      );
    }

    if (propName.endsWith("_id") || propName === "item") {
      return this.generateIdPropertyDefinition(propName, propSchema);
    }

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
        const schema = (this.spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];
        const pascalCaseName = toPascalCase(ref);

        // System collections are not arrays
        if (collectionName.startsWith("directus_")) {
          source += `  ${collectionName}: ${pascalCaseName};\n`;
        } else {
          source += `  ${collectionName}: ${pascalCaseName}${isSingleton ? "" : "[]"};\n`;
        }
      }
      source += `};\n\n`;
    }

    source += this.typeTracker.getAllValidTypes();
    return source.replace(/\| \{\}\[\]/g, "");
  }

  private generateReferencePropertyDefinition(propName: string): string {
    // We're simply using string type for references
    return `  ${propName}?: string;\n`;
  }

  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem) {
      return `  ${propName}?: string;\n`;
    }

    return `  ${propName}?: unknown;\n`;
  }

  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
  ): string {
    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      return `  ${propName}?: string[];\n`;
    }

    // Handle arrays with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => "$ref" in item);

      if (refItem && "$ref" in refItem) {
        // For arrays of items, we'll use string[] or object references
        if (this.options.useTypeReferences) {
          return `  ${propName}?: string[] | Array<{ id: string }>;\n`;
        } else {
          return `  ${propName}?: string[];\n`;
        }
      }
    }

    // Handle simple array types
    if ("type" in propSchema.items) {
      if (propSchema.items.type === "integer") {
        return `  ${propName}?: number[];\n`;
      } else if (propSchema.items.type === "string") {
        return `  ${propName}?: string[];\n`;
      }
    }

    return `  ${propName}?: unknown[];\n`;
  }

  private generateIdPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // For ID fields that reference other collections
    if (this.options.useTypeReferences) {
      return `  ${propName}?: string | { id: string };\n`;
    } else {
      return `  ${propName}?: string;\n`;
    }
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
        return `  ${propName}${optional ? "?" : ""}: string;\n`;
      }
      if (format === "json") {
        return `  ${propName}${optional ? "?" : ""}: unknown;\n`;
      }
      if (format === "csv") {
        return `  ${propName}${optional ? "?" : ""}: string;\n`;
      }
    }

    // Handle object type
    if (baseType === "object") {
      return `  ${propName}${optional ? "?" : ""}: Record<string, unknown>;\n`;
    }

    // Handle array type
    if (baseType === "array") {
      return `  ${propName}${optional ? "?" : ""}: unknown[];\n`;
    }

    return `  ${propName}${optional ? "?" : ""}: ${baseType ?? "unknown"};\n`;
  }
}
