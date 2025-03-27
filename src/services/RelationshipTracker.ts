import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { ExtendedSchemaObject } from "../types";
import { isReferenceObject } from "../utils/schema";

/**
 * Relationship information structure
 */
export interface RelationshipInfo {
  sourceCollection: string;
  sourceField: string;
  targetCollection: string;
  isJunctionTable?: boolean;
  isM2M?: boolean;
  isO2M?: boolean;
}

/**
 * Tracks relationships between collections for accurate type generation
 */
export class RelationshipTracker {
  // Store all relationships between collections
  private relationships: RelationshipInfo[] = [];

  // Map of collection names to their ID types
  private collectionIdTypes: Map<string, "string" | "number"> = new Map();

  // System collections with number IDs
  private readonly numberIdCollections = new Set([
    "directus_permissions",
    "directus_activity",
    "directus_presets",
    "directus_revisions",
    "directus_webhooks",
    "directus_settings",
    "directus_operations",
  ]);

  constructor() {
    // Initialize standard system collections ID types
    this.initializeSystemCollectionIdTypes();
  }

  /**
   * Initialize system collection ID types
   */
  private initializeSystemCollectionIdTypes(): void {
    // Set up known system collections with number IDs
    for (const collection of this.numberIdCollections) {
      this.collectionIdTypes.set(collection, "number");
    }
  }

  /**
   * Register a collection and its ID type
   */
  registerCollection(
    collectionName: string,
    idType: "string" | "number" = "string",
  ): void {
    this.collectionIdTypes.set(collectionName, idType);

    // If this is a system collection with a prefix, also register the shorthand
    if (collectionName.startsWith("directus_")) {
      const shortName = collectionName.replace("directus_", "");
      if (!this.collectionIdTypes.has(shortName)) {
        this.collectionIdTypes.set(shortName, idType);
      }
    }
  }

  /**
   * Register a relationship between collections
   */
  registerRelationship(
    sourceCollection: string,
    sourceField: string,
    targetCollection: string,
    isJunctionTable: boolean = false,
    isM2M: boolean = false,
    isO2M: boolean = false,
  ): void {
    // Normalize collection names (remove directus_ prefix if present)
    const normalizedSource = this.normalizeCollectionName(sourceCollection);
    const normalizedTarget = this.normalizeCollectionName(targetCollection);

    this.relationships.push({
      sourceCollection: normalizedSource,
      sourceField,
      targetCollection: normalizedTarget,
      isJunctionTable,
      isM2M,
      isO2M,
    });
  }

  /**
   * Normalize collection name by removing directus_ prefix if present
   */
  private normalizeCollectionName(collectionName: string): string {
    return collectionName.startsWith("directus_")
      ? collectionName
      : collectionName;
  }

  /**
   * Analyze an OpenAPI schema to extract and register relationships
   */
  analyzeSchema(spec: OpenAPIV3.Document): void {
    // First register all collections and their ID types
    if (spec.components?.schemas) {
      for (const [schemaName, schema] of Object.entries(
        spec.components.schemas,
      )) {
        // Skip reference objects
        if (isReferenceObject(schema)) continue;

        // Check for ID field to determine the ID type
        if (schema.properties && "id" in schema.properties) {
          const idProp = schema.properties.id;

          if (!isReferenceObject(idProp)) {
            // If ID is integer or number, register as number ID
            if (idProp.type === "integer" || idProp.type === "number") {
              this.registerCollection(schemaName, "number");
            } else {
              // Otherwise register with string ID
              this.registerCollection(schemaName, "string");
            }
          } else {
            // Default to string if ID is a reference
            this.registerCollection(schemaName, "string");
          }
        } else {
          // No ID property found, register with default string ID
          this.registerCollection(schemaName, "string");
        }

        // Register system collections with their known ID types
        if (
          schemaName.startsWith("directus_") &&
          this.numberIdCollections.has(schemaName)
        ) {
          this.registerCollection(schemaName, "number");
        }

        // Check for x-collection property
        const extendedSchema = schema as ExtendedSchemaObject;
        if (extendedSchema["x-collection"]) {
          // Also register the x-collection value with the same ID type
          const idType = this.getCollectionIdType(schemaName);
          this.registerCollection(extendedSchema["x-collection"], idType);
        }

        // Analyze schema properties for relationships
        if (schema.properties) {
          this.analyzeSchemaProperties(schemaName, schema.properties);
        }
      }
    }

    // Then examine paths for more relationship clues
    if (spec.paths) {
      for (const [path, pathItem] of Object.entries(spec.paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;

        // Check for collection patterns in paths
        const collectionMatch = /^\/items\/([a-zA-Z0-9_]+)/.exec(path);
        if (collectionMatch && collectionMatch[1]) {
          const collectionName = collectionMatch[1];

          // Ensure we have this collection registered
          if (!this.collectionIdTypes.has(collectionName)) {
            // Default to string ID unless we know it's a system collection with number ID
            const idType =
              collectionName.startsWith("directus_") &&
              this.numberIdCollections.has(collectionName)
                ? "number"
                : "string";
            this.registerCollection(collectionName, idType);
          }
        }
      }
    }
  }

  /**
   * Analyze schema properties to identify relationships
   */
  private analyzeSchemaProperties(
    collectionName: string,
    properties: Record<
      string,
      OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject
    >,
  ): void {
    for (const [propName, propSchema] of Object.entries(properties)) {
      // Skip id field
      if (propName === "id") continue;

      // Handle direct references (M2O relationships)
      if (isReferenceObject(propSchema)) {
        const refMatch = /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/.exec(
          propSchema.$ref,
        );
        if (refMatch && refMatch[1]) {
          const targetCollection = refMatch[1];
          this.registerRelationship(collectionName, propName, targetCollection);
        }
      }
      // Handle array references (O2M or M2M relationships)
      else if (propSchema.type === "array" && propSchema.items) {
        if (isReferenceObject(propSchema.items)) {
          const refMatch =
            /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/.exec(
              propSchema.items.$ref,
            );
          if (refMatch && refMatch[1]) {
            const targetCollection = refMatch[1];
            // Likely a O2M relationship
            this.registerRelationship(
              collectionName,
              propName,
              targetCollection,
              false,
              false,
              true,
            );
          }
        }
        // Handle oneOf arrays which might indicate M2M relationships
        else if (
          typeof propSchema.items === "object" &&
          "oneOf" in propSchema.items
        ) {
          const oneOfArray = propSchema.items.oneOf;
          if (Array.isArray(oneOfArray)) {
            for (const item of oneOfArray) {
              if (isReferenceObject(item)) {
                const refMatch =
                  /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/.exec(
                    item.$ref,
                  );
                if (refMatch && refMatch[1]) {
                  const targetCollection = refMatch[1];
                  // This is likely a M2M relationship
                  this.registerRelationship(
                    collectionName,
                    propName,
                    targetCollection,
                    false,
                    true,
                  );
                }
              }
            }
          }
        }
      }
      // Handle oneOf references which might also indicate relationships
      else if ("oneOf" in propSchema && Array.isArray(propSchema.oneOf)) {
        for (const item of propSchema.oneOf) {
          if (isReferenceObject(item)) {
            const refMatch =
              /^#\/components\/schemas\/(?<ref>[a-zA-Z0-9_]+)$/.exec(item.$ref);
            if (refMatch && refMatch[1]) {
              const targetCollection = refMatch[1];
              this.registerRelationship(
                collectionName,
                propName,
                targetCollection,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Determine if a collection is a junction table
   * Junction tables typically have fields referencing both sides of a M2M relationship
   */
  isJunctionTable(collectionName: string): boolean {
    // Count reference fields in this collection
    const relationships = this.relationships.filter(
      (r) => r.sourceCollection === collectionName && !r.isM2M && !r.isO2M,
    );

    // A junction table typically has at least 2 reference fields to other collections
    return relationships.length >= 2;
  }

  /**
   * Get the ID type for a collection
   */
  getCollectionIdType(collectionName: string): "string" | "number" {
    // First check our explicit map
    if (this.collectionIdTypes.has(collectionName)) {
      return this.collectionIdTypes.get(collectionName)!;
    }

    // Check if it's a system collection with number ID
    if (
      collectionName.startsWith("directus_") &&
      this.numberIdCollections.has(collectionName)
    ) {
      return "number";
    }

    // Default to string ID for all other collections
    return "string";
  }

  /**
   * Determine the appropriate type for a relationship field
   */
  getRelationshipFieldType(collectionName: string, fieldName: string): string {
    // Find direct relationships where this collection is the target
    const directRelationships = this.relationships.filter(
      (r) =>
        r.targetCollection === collectionName && r.sourceField === fieldName,
    );

    if (directRelationships.length > 0) {
      // Use the ID type of the source collection
      const idType = this.getCollectionIdType(
        directRelationships[0].sourceCollection,
      );
      return `${idType}[]`;
    }

    // Look for junction table relationships
    const junctionRelationships = this.relationships.filter(
      (r) => r.isM2M && r.targetCollection === collectionName,
    );

    if (junctionRelationships.length > 0) {
      // For M2M relations, the ID type should be that of the junction table
      const junctionTable = junctionRelationships[0].sourceCollection;
      const idType = this.getCollectionIdType(junctionTable);
      return `${idType}[]`;
    }

    // If we can't determine the relationship precisely, default to string[]
    // This is the safest default as most Directus collections use string UUIDs
    return "string[]";
  }

  /**
   * Get all relationships where a collection is the source
   */
  getRelationshipsFromCollection(collectionName: string): RelationshipInfo[] {
    return this.relationships.filter(
      (r) => r.sourceCollection === collectionName,
    );
  }

  /**
   * Get all relationships where a collection is the target
   */
  getRelationshipsToCollection(collectionName: string): RelationshipInfo[] {
    return this.relationships.filter(
      (r) => r.targetCollection === collectionName,
    );
  }

  /**
   * Debug method to print all tracked relationships
   */
  debugPrintRelationships(): void {
    console.log("Tracked Relationships:");
    for (const rel of this.relationships) {
      console.log(
        `${rel.sourceCollection}.${rel.sourceField} -> ${rel.targetCollection} ${rel.isM2M ? "(M2M)" : rel.isO2M ? "(O2M)" : ""}`,
      );
    }
  }

  /**
   * Debug method to print all tracked ID types
   */
  debugPrintIdTypes(): void {
    console.log("Collection ID Types:");
    this.collectionIdTypes.forEach((type, collection) => {
      console.log(`${collection}: ${type}`);
    });
  }
}
