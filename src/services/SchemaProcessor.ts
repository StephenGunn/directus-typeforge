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
  private processedTypes: Set<string> = new Set();
  private typeCircularDependencies: Map<string, Set<string>> = new Map();
  private circularReferenceTypes: Set<string> = new Set();
  private systemCollectionMap: Map<string, string> = new Map();

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
    };

    // Initialize system collection mapping
    this.initializeSystemCollectionMap();
  }

  /**
   * Initialize the mapping between collection names and their type names
   */
  private initializeSystemCollectionMap(): void {
    // Map standard Directus system collections to their Type names
    this.systemCollectionMap.set("users", "DirectusUsers");
    this.systemCollectionMap.set("files", "DirectusFiles");
    this.systemCollectionMap.set("folders", "DirectusFolders");
    this.systemCollectionMap.set("roles", "DirectusRoles");
    this.systemCollectionMap.set("activity", "DirectusActivity");
    this.systemCollectionMap.set("permissions", "DirectusPermissions");
    this.systemCollectionMap.set("fields", "DirectusFields");
    this.systemCollectionMap.set("collections", "DirectusCollections");
    this.systemCollectionMap.set("presets", "DirectusPresets");
    this.systemCollectionMap.set("relations", "DirectusRelations");
    this.systemCollectionMap.set("revisions", "DirectusRevisions");
    this.systemCollectionMap.set("webhooks", "DirectusWebhooks");
    this.systemCollectionMap.set("flows", "DirectusFlows");
    this.systemCollectionMap.set("operations", "DirectusOperations");
    this.systemCollectionMap.set("versions", "DirectusVersions");
    this.systemCollectionMap.set("extensions", "DirectusExtensions");
    this.systemCollectionMap.set("comments", "DirectusComments");
    this.systemCollectionMap.set("settings", "DirectusSettings");
  }

  /**
   * Gets the correct type name for a system collection
   */
  private getSystemCollectionTypeName(collectionNameOrRef: string): string {
    // If it's a short name like 'users', map it to 'DirectusUsers'
    const mappedName = this.systemCollectionMap.get(collectionNameOrRef);
    if (mappedName) {
      return mappedName;
    }

    // If it's a full name like 'directus_users', convert to 'DirectusUsers'
    if (collectionNameOrRef.startsWith("directus_")) {
      const baseName = collectionNameOrRef.replace("directus_", "");
      const mappedBaseName = this.systemCollectionMap.get(baseName);
      if (mappedBaseName) {
        return mappedBaseName;
      }
      // If not found in map, use PascalCase
      return toPascalCase(collectionNameOrRef);
    }

    // Not a system collection
    return toPascalCase(collectionNameOrRef);
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    // First pass - collect all schemas and build dependency graph
    const collectionSchemas = this.collectSchemas();

    // Second pass - detect circular dependencies
    this.detectCircularDependencies(collectionSchemas);

    // Third pass - generate types with proper recursion handling
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
   * Detects circular dependencies between types
   */
  private detectCircularDependencies(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // Build the dependency graph for all types
    for (const [, { ref }] of Object.entries(schemas)) {
      const typeName = toPascalCase(ref);
      const dependencies = this.findTypeDependencies(typeName);
      this.typeCircularDependencies.set(typeName, dependencies);
    }

    // Find circular references using depth-first search
    for (const typeName of this.typeCircularDependencies.keys()) {
      this.findCircularReferences(typeName, new Set());
    }
  }

  /**
   * Finds type dependencies
   */
  private findTypeDependencies(typeName: string): Set<string> {
    const dependencies = new Set<string>();
    const typeDefinition = this.typeTracker.getType(typeName);

    if (!typeDefinition) return dependencies;

    // For each property, check if it references another type
    for (const prop of typeDefinition.properties) {
      // Check for direct references
      const refMatch = typeDefinition.content.match(
        new RegExp(`${prop}\\?:\\s*string\\s*\\|\\s*([A-Za-z0-9_]+)`, "g"),
      );

      if (refMatch) {
        for (const match of refMatch) {
          const refTypeName = match.split("|")[1]?.trim();
          if (refTypeName && this.typeTracker.hasType(refTypeName)) {
            dependencies.add(refTypeName);
          }
        }
      }

      // Check for array references
      const arrayRefMatch = typeDefinition.content.match(
        new RegExp(
          `${prop}\\?:\\s*string\\[\\]\\s*\\|\\s*Array<([A-Za-z0-9_]+)>`,
          "g",
        ),
      );

      if (arrayRefMatch) {
        for (const match of arrayRefMatch) {
          const arrayType = match.match(/Array<([A-Za-z0-9_]+)>/);
          if (
            arrayType &&
            arrayType[1] &&
            this.typeTracker.hasType(arrayType[1])
          ) {
            dependencies.add(arrayType[1]);
          }
        }
      }
    }

    return dependencies;
  }

  /**
   * Finds circular references using depth-first search
   */
  private findCircularReferences(
    typeName: string,
    visited: Set<string>,
    path: string[] = [],
  ): void {
    // If we've seen this type in the current path, we have a cycle
    if (path.includes(typeName)) {
      // Mark the type in the cycle as circular
      const cycleStart = path.indexOf(typeName);
      const cycle = path.slice(cycleStart).concat(typeName);

      for (const typeInCycle of cycle) {
        this.circularReferenceTypes.add(typeInCycle);
      }
      return;
    }

    // If we've already completely visited this type, skip
    if (visited.has(typeName)) {
      return;
    }

    // Visit the current type
    visited.add(typeName);
    path.push(typeName);

    // Visit all dependencies
    const dependencies =
      this.typeCircularDependencies.get(typeName) || new Set();
    for (const dependency of dependencies) {
      this.findCircularReferences(dependency, visited, [...path]);
    }
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

      // Always include system collections (we'll handle them differently in the output)
      const isSystemCollection = collection.startsWith("directus_");

      const ref = extractRefFromPathItem(pathItem as OpenAPIV3.PathItemObject);
      if (!ref) continue;

      const schema = (this.spec.components?.schemas?.[ref] ??
        {}) as OpenAPIV3.SchemaObject;
      const refName = toPascalCase(ref);

      if (!this.processedTypes.has(refName)) {
        this.processedTypes.add(refName);

        // For system collections, we'll only include custom fields
        if (isSystemCollection) {
          this.generateSystemCollectionFields(schema, collection);
        } else {
          this.generateSDKInterface(schema, refName, collection);
        }
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
    // Always process system collections
    const systemCollections = findSystemCollections(this.spec);
    for (const collection of systemCollections) {
      const schema = Object.values(this.spec.components?.schemas ?? {}).find(
        (schema) => {
          const schemaObject = schema as ExtendedSchemaObject;
          return schemaObject["x-collection"] === collection;
        },
      ) as OpenAPIV3.SchemaObject;

      if (schema) {
        const refName = this.getSystemCollectionTypeName(collection);

        if (!this.processedTypes.has(refName)) {
          this.processedTypes.add(refName);
          this.generateSystemCollectionFields(schema, collection);
        }

        if (this.typeTracker.hasValidContent(refName)) {
          schemas[collection] = { ref: collection, schema };
        }
      }
    }

    // Ensure all standard system collections are defined even if not explicitly in the schema
    this.ensureStandardSystemCollections(schemas);
  }

  /**
   * Ensure all standard system collections are defined
   */
  private ensureStandardSystemCollections(
    schemas: Record<string, CollectionSchema>,
  ): void {
    // For each standard system collection
    for (const [shortName, typeName] of this.systemCollectionMap) {
      const collectionName = `directus_${shortName}`;

      // If it's not already processed and not already in schemas
      if (!this.processedTypes.has(typeName) && !schemas[collectionName]) {
        this.processedTypes.add(typeName);

        // Create a minimal schema for the system collection
        const minimalSchema = {
          type: "object",
          properties: {
            id: {
              type:
                shortName === "permissions" ||
                shortName === "activity" ||
                shortName === "presets" ||
                shortName === "revisions" ||
                shortName === "webhooks" ||
                shortName === "settings"
                  ? "integer"
                  : "string",
            },
          },
        } as OpenAPIV3.SchemaObject;

        this.generateSystemCollectionFields(minimalSchema, collectionName);

        if (this.typeTracker.hasValidContent(typeName)) {
          schemas[collectionName] = {
            ref: collectionName,
            schema: minimalSchema,
          };
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

    // Use the system collection type name
    const typeName = this.getSystemCollectionTypeName(collection);
    let interfaceStr = `export type ${typeName} = {\n`;

    // Check if customFields already has an ID field
    const hasCustomId = customFields.some(
      ([propName]) => propName.toLowerCase() === "id",
    );

    // Only add the ID field if not already present in customFields
    if (!hasCustomId) {
      interfaceStr += `  id: ${this.getSystemCollectionIdType(collection)};\n`;
    }

    const properties: string[] = hasCustomId ? [] : ["id"];

    for (const [propName, propSchema] of customFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      // Generate property with proper handling for system collections
      interfaceStr += this.generatePropertyDefinition(
        propName,
        propSchema,
        true,
        typeName,
      );
    }

    interfaceStr += "};\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Get the appropriate ID type for system collections
   */
  private getSystemCollectionIdType(collection: string): string {
    // Most system collections have string ids, except for specific ones
    if (
      collection === "directus_permissions" ||
      collection === "directus_activity" ||
      collection === "directus_presets" ||
      collection === "directus_revisions" ||
      collection === "directus_webhooks" ||
      collection === "directus_settings"
    ) {
      return "number";
    }
    return "string";
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

    if (nonSystemFields.length === 0) {
      // If no properties, add default id field for regular collections
      const interfaceStr = `export type ${refName} = {\n  id: string;\n};\n\n`;
      this.typeTracker.addType(refName, interfaceStr, ["id"]);
      return;
    }

    let interfaceStr = `export type ${refName} = {\n`;
    const properties: string[] = [];

    for (const [propName, propSchema] of nonSystemFields) {
      if (typeof propSchema !== "object") continue;
      properties.push(propName);

      interfaceStr += this.generatePropertyDefinition(
        propName,
        propSchema,
        false,
        refName,
      );
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
    isSystemCollection: boolean = false,
    parentTypeName: string = "",
  ): string {
    if (isReferenceObject(propSchema)) {
      return this.generateReferencePropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentTypeName,
      );
    }

    if ("oneOf" in propSchema) {
      return this.generateOneOfPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentTypeName,
      );
    }

    if (propSchema.type === "array" && "items" in propSchema) {
      return this.generateArrayPropertyDefinition(
        propName,
        propSchema as OpenAPIV3.ArraySchemaObject,
        isSystemCollection,
        parentTypeName,
      );
    }

    if (propName.endsWith("_id") || propName === "item") {
      return this.generateIdPropertyDefinition(
        propName,
        propSchema,
        isSystemCollection,
        parentTypeName,
      );
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
      ([, { ref }]) =>
        this.typeTracker.hasValidContent(this.getSystemCollectionTypeName(ref)),
    );

    // First create the main schema type
    let source = "";
    if (validCollections.length > 0) {
      source += `\nexport type ${this.options.typeName} = {\n`;

      // First add non-system collections (as arrays)
      const nonSystemCollections = validCollections.filter(
        ([collectionName]) => !collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of nonSystemCollections) {
        const schema = (this.spec.components?.schemas?.[ref] ??
          {}) as ExtendedSchemaObject;
        const isSingleton = !!schema?.["x-singleton"];
        const pascalCaseName = toPascalCase(ref);

        source += `  ${collectionName}: ${pascalCaseName}${isSingleton ? "" : "[]"};\n`;
      }

      // Then add system collections (as singular types) if they should be included
      const systemCollections = validCollections.filter(([collectionName]) =>
        collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of systemCollections) {
        const typeName = this.getSystemCollectionTypeName(ref);
        source += `  ${collectionName}: ${typeName};\n`;
      }

      source += `};\n\n`;
    }

    // Generate recursive interfaces for types with circular references
    for (const typeName of this.circularReferenceTypes) {
      const originalType = this.typeTracker.getType(typeName);
      if (!originalType) continue;

      // Create a recursive version of the type
      const recursiveType = this.createRecursiveType(typeName, originalType);
      source += recursiveType;
    }

    // Add all remaining types
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      if (!this.circularReferenceTypes.has(typeName)) {
        source += this.typeTracker.getTypeContent(typeName);
      }
    }

    return source.replace(/\| \{\}\[\]/g, "");
  }

  /**
   * Creates a recursive version of a type to handle circular references
   */
  private createRecursiveType(
    typeName: string,
    original: { content: string; properties: string[] },
  ): string {
    // Extract the type definition body between braces
    const typeBodyMatch = original.content.match(
      /export type [A-Za-z0-9_]+ = \{([\s\S]*?)\};/,
    );
    if (!typeBodyMatch || !typeBodyMatch[1]) {
      return original.content;
    }

    const typeBody = typeBodyMatch[1];

    // Get the dependencies for this type
    const dependencies =
      this.typeCircularDependencies.get(typeName) || new Set();

    // Replace recursive references with Omit<Type, never> to create proper recursion
    let updatedBody = typeBody;
    for (const dependency of dependencies) {
      if (this.circularReferenceTypes.has(dependency)) {
        // Replace reference in property definitions
        const regex = new RegExp(`(\\b${dependency}\\b)(?!\\[])`, "g");
        updatedBody = updatedBody.replace(regex, `Omit<$1, never>`);

        // Replace array references
        const arrayRegex = new RegExp(`Array<(${dependency})>`, "g");
        updatedBody = updatedBody.replace(arrayRegex, `Array<Omit<$1, never>>`);
      }
    }

    // Recreate the type definition with the updated body
    return `export type ${typeName} = {${updatedBody}};\n\n`;
  }

  private generateReferencePropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ReferenceObject,
    isSystemCollection: boolean = false,
    parentTypeName: string = "",
  ): string {
    // Extract reference type name
    const refPath = propSchema.$ref;
    const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

    if (!refMatch || !refMatch[1]) {
      return `  ${propName}?: string;\n`;
    }

    let refTypeName = refMatch[1];

    // Check if the reference is to a system collection and use the correct name
    if (refTypeName === "Users") {
      refTypeName = "DirectusUsers";
    } else if (refTypeName === "Files") {
      refTypeName = "DirectusFiles";
    } else if (refTypeName === "Folders") {
      refTypeName = "DirectusFolders";
    } else if (refTypeName === "Roles") {
      refTypeName = "DirectusRoles";
    } else {
      // For other potential system collections
      const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
      if (systemTypeName !== refTypeName) {
        refTypeName = systemTypeName;
      }
    }

    // Check if this would create a circular reference
    const isCircular = this.wouldCreateCircularReference(
      parentTypeName,
      refTypeName,
    );

    // For system collections or circular references, use string type
    if (isSystemCollection || isCircular) {
      return `  ${propName}?: string;\n`;
    }

    // Otherwise, use the type reference if enabled
    if (this.options.useTypeReferences) {
      return `  ${propName}?: string | ${refTypeName};\n`;
    }

    return `  ${propName}?: string;\n`;
  }

  private generateOneOfPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.SchemaObject,
    isSystemCollection: boolean = false,
    parentTypeName: string = "",
  ): string {
    // Find a $ref in the oneOf array
    const refItem = propSchema.oneOf?.find((item) => "$ref" in item);

    if (refItem && "$ref" in refItem) {
      const refPath = refItem.$ref;
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

      if (refMatch && refMatch[1]) {
        let refTypeName = refMatch[1];

        // Adjust for system collections
        if (refTypeName === "Users") {
          refTypeName = "DirectusUsers";
        } else if (refTypeName === "Files") {
          refTypeName = "DirectusFiles";
        } else if (refTypeName === "Folders") {
          refTypeName = "DirectusFolders";
        } else if (refTypeName === "Roles") {
          refTypeName = "DirectusRoles";
        } else {
          // For other potential system collections
          const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
          if (systemTypeName !== refTypeName) {
            refTypeName = systemTypeName;
          }
        }

        // Check if this would create a circular reference
        const isCircular = this.wouldCreateCircularReference(
          parentTypeName,
          refTypeName,
        );

        // Use type references if enabled and not circular
        if (
          this.options.useTypeReferences &&
          !isSystemCollection &&
          !isCircular
        ) {
          return `  ${propName}?: string | ${refTypeName};\n`;
        }
      }

      return `  ${propName}?: string;\n`;
    }

    return `  ${propName}?: unknown;\n`;
  }

  private generateArrayPropertyDefinition(
    propName: string,
    propSchema: OpenAPIV3.ArraySchemaObject,
    isSystemCollection: boolean = false,
    parentTypeName: string = "",
  ): string {
    // Handle arrays of references
    if (isReferenceObject(propSchema.items)) {
      const refPath = propSchema.items.$ref;
      const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

      if (refMatch && refMatch[1]) {
        let refTypeName = refMatch[1];

        // Adjust for system collections
        if (refTypeName === "Users") {
          refTypeName = "DirectusUsers";
        } else if (refTypeName === "Files") {
          refTypeName = "DirectusFiles";
        } else {
          // For other potential system collections
          const systemTypeName = this.getSystemCollectionTypeName(refTypeName);
          if (systemTypeName !== refTypeName) {
            refTypeName = systemTypeName;
          }
        }

        // Check if this would create a circular reference
        const isCircular = this.wouldCreateCircularReference(
          parentTypeName,
          refTypeName,
        );

        // For regular collections with non-circular references, use both types
        if (
          this.options.useTypeReferences &&
          !isSystemCollection &&
          !isCircular
        ) {
          return `  ${propName}?: string[] | Array<{ id: string }>;\n`;
        }
      }

      return `  ${propName}?: string[];\n`;
    }

    // Handle arrays with oneOf
    if ("oneOf" in propSchema.items && Array.isArray(propSchema.items.oneOf)) {
      const refItem = propSchema.items.oneOf.find((item) => "$ref" in item);

      if (refItem && "$ref" in refItem) {
        const refPath = refItem.$ref;
        const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(refPath);

        if (refMatch && refMatch[1]) {
          let refTypeName = refMatch[1];

          // Adjust for system collections
          if (refTypeName === "Users") {
            refTypeName = "DirectusUsers";
          } else if (refTypeName === "Files") {
            refTypeName = "DirectusFiles";
          } else {
            // For other potential system collections
            const systemTypeName =
              this.getSystemCollectionTypeName(refTypeName);
            if (systemTypeName !== refTypeName) {
              refTypeName = systemTypeName;
            }
          }

          // Check if this would create a circular reference
          const isCircular = this.wouldCreateCircularReference(
            parentTypeName,
            refTypeName,
          );

          // For arrays of items with oneOf, use both types if not circular
          if (
            this.options.useTypeReferences &&
            !isSystemCollection &&
            !isCircular
          ) {
            return `  ${propName}?: string[] | Array<{ id: string }>;\n`;
          }
        }
      }

      return `  ${propName}?: string[];\n`;
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
    isSystemCollection: boolean = false,
    parentTypeName: string = "",
  ): string {
    if (propName === "item") {
      return `  ${propName}?: ${propSchema.type ?? "unknown"};\n`;
    }

    // Extract potential related collection name from field name (removing _id suffix)
    const relatedCollectionName = propName.endsWith("_id")
      ? propName.replace(/_id$/, "")
      : "";

    // Check if this is a reference to a system collection
    const systemTypeName = this.systemCollectionMap.get(relatedCollectionName);

    // For ID fields that reference other collections
    if (
      this.options.useTypeReferences &&
      relatedCollectionName &&
      !isSystemCollection
    ) {
      // If it's a reference to a system collection, use the system type name
      if (systemTypeName) {
        // Check if this would create a circular reference
        const isCircular = this.wouldCreateCircularReference(
          parentTypeName,
          systemTypeName,
        );
        if (!isCircular) {
          return `  ${propName}?: string | ${systemTypeName};\n`;
        }
      } else {
        // Convert related collection name to PascalCase for type reference
        const relatedTypeName = toPascalCase(relatedCollectionName);

        // Check if related type exists in spec components
        const relatedTypeExists =
          !!this.spec.components?.schemas?.[relatedTypeName];

        // Check if this would create a circular reference
        const isCircular =
          relatedTypeExists &&
          this.wouldCreateCircularReference(parentTypeName, relatedTypeName);

        if (relatedTypeExists && !isCircular) {
          return `  ${propName}?: string | { id: string };\n`;
        }
      }
    }

    return `  ${propName}?: string;\n`;
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

  /**
   * Checks if adding a reference from parent to child would create a circular reference
   */
  private wouldCreateCircularReference(
    parentTypeName: string,
    childTypeName: string,
  ): boolean {
    if (!parentTypeName || !childTypeName) return false;
    if (parentTypeName === childTypeName) return true;

    // Check if child is already part of a known circular reference
    if (this.circularReferenceTypes.has(childTypeName)) {
      // Get dependencies of child to see if parent is in the chain
      const dependencies = this.findDependencyPath(
        childTypeName,
        parentTypeName,
        new Set(),
      );
      return dependencies.length > 0;
    }

    return false;
  }

  /**
   * Finds a dependency path between two types if one exists
   */
  private findDependencyPath(
    from: string,
    to: string,
    visited: Set<string>,
    path: string[] = [],
  ): string[] {
    // If we've found the target, return the path
    if (from === to) {
      return [...path, from];
    }

    // If we've already visited this type, skip it
    if (visited.has(from)) {
      return [];
    }

    // Mark as visited and add to path
    visited.add(from);
    path.push(from);

    // Check all dependencies
    const dependencies = this.typeCircularDependencies.get(from) || new Set();
    for (const dependency of dependencies) {
      const result = this.findDependencyPath(dependency, to, visited, [
        ...path,
      ]);
      if (result.length > 0) {
        return result;
      }
    }

    // No path found
    return [];
  }
}
