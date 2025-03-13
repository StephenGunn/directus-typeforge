import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type {
  GenerateTypeScriptOptions,
  CollectionSchema,
  ExtendedSchemaObject,
} from "../types";
import { TypeTracker } from "./TypeTracker";
import { extractRefFromPathItem, isReferenceObject } from "../utils/schema";
import { TypeNameManager } from "./TypeNameManager";
import { PropertyGenerator } from "./PropertyGenerator";
import { SystemCollectionManager } from "./SystemCollectionManager";
import { InterfaceGenerator } from "./InterfaceGenerator";
import { RelationshipTracker } from "./RelationshipTracker";

/**
 * Processes OpenAPI schemas and generates TypeScript interfaces
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private typeNameManager: TypeNameManager;
  private relationshipTracker: RelationshipTracker;
  private propertyGenerator: PropertyGenerator;
  private systemCollectionManager: SystemCollectionManager;
  private interfaceGenerator: InterfaceGenerator;
  private options: {
    typeName: string;
    useTypeReferences: boolean;
    useTypes: boolean;
  };

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
      useTypes: options.useTypes ?? false,
    };

    // Initialize the relationship tracker first
    this.relationshipTracker = new RelationshipTracker();

    // Initialize the type name manager
    this.typeNameManager = new TypeNameManager();

    // Initialize the system collection manager
    this.systemCollectionManager = new SystemCollectionManager(
      this.spec,
      this.typeTracker,
      this.typeNameManager,
      { useTypes: this.options.useTypes },
    );

    // Initialize the property generator with system collection manager reference
    this.propertyGenerator = new PropertyGenerator(
      this.typeNameManager,
      this.options.useTypeReferences,
      this.systemCollectionManager,
    );

    // Initialize the interface generator
    this.interfaceGenerator = new InterfaceGenerator(
      this.typeTracker,
      this.propertyGenerator,
      this.typeNameManager,
      this.systemCollectionManager,
      {
        typeName: this.options.typeName,
        useTypes: this.options.useTypes,
      },
    );
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    // First, analyze relationships in the schema
    this.analyzeRelations();

    // Now analyze with the relationship tracker for more accurate typing
    this.relationshipTracker.analyzeSchema(this.spec);

    // Collect all schemas and process them
    const collectionSchemas = this.collectSchemas();

    // Generate the final type definitions
    return this.interfaceGenerator.generateTypeDefinitions(collectionSchemas);
  }

  /**
   * Analyzes the OpenAPI schema to identify and register relations between collections
   */
  private analyzeRelations(): void {
    // First, register all collection names
    if (this.spec.components?.schemas) {
      for (const [schemaName, schema] of Object.entries(
        this.spec.components.schemas,
      )) {
        // Register the schema name as a collection
        this.typeNameManager.registerCollection(schemaName);

        // Check if there's an x-collection property
        const extendedSchema = schema as ExtendedSchemaObject;
        if (extendedSchema["x-collection"]) {
          this.typeNameManager.registerCollection(
            extendedSchema["x-collection"],
          );
        }
      }
    }

    // Then, analyze path endpoints to identify relationships
    if (this.spec.paths) {
      for (const [path, pathItem] of Object.entries(this.spec.paths)) {
        // Try to extract collection name from path
        const collectionMatch = /^\/items\/(?<collection>[a-zA-Z0-9_]+)$/.exec(
          path,
        );
        const collection = collectionMatch?.groups?.["collection"];

        if (collection) {
          // Find related reference
          const ref = extractRefFromPathItem(
            pathItem as OpenAPIV3.PathItemObject,
          );
          if (ref && this.spec.components?.schemas?.[ref]) {
            const schema = this.spec.components.schemas[
              ref
            ] as OpenAPIV3.SchemaObject;

            // Process properties to identify relation fields
            if (schema.properties) {
              this.processRelationProperties(collection, schema.properties);
            }
          }
        }
      }
    }
  }

  /**
   * Process properties of a schema to identify relation fields
   */
  private processRelationProperties(
    collectionName: string,
    properties: Record<
      string,
      OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject
    >,
  ): void {
    for (const [propName, propSchema] of Object.entries(properties)) {
      // Check for direct references
      if (isReferenceObject(propSchema)) {
        const refMatch = /^#\/components\/schemas\/([^/]+)$/.exec(
          propSchema.$ref,
        );
        if (refMatch && refMatch[1]) {
          // This is a relation field
          this.typeNameManager.registerRelation(collectionName, propName);
        }
      }
      // Check for oneOf references
      else if ("oneOf" in propSchema && Array.isArray(propSchema.oneOf)) {
        const hasRef = propSchema.oneOf.some((item) => isReferenceObject(item));
        if (hasRef) {
          // This is a relation field
          this.typeNameManager.registerRelation(collectionName, propName);
        }
      }
      // Check for array of references
      else if (
        "type" in propSchema &&
        propSchema.type === "array" &&
        propSchema.items
      ) {
        if (isReferenceObject(propSchema.items)) {
          // This is a relation field
          this.typeNameManager.registerRelation(collectionName, propName);
        } else if (
          typeof propSchema.items === "object" &&
          "oneOf" in propSchema.items &&
          Array.isArray(propSchema.items.oneOf)
        ) {
          const hasRef = propSchema.items.oneOf.some((item) =>
            isReferenceObject(item),
          );
          if (hasRef) {
            // This is a relation field
            this.typeNameManager.registerRelation(collectionName, propName);
          }
        }
      }
    }
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
    this.systemCollectionManager.processSystemCollections(schemas);

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

      // Always include system collections (we'll handle them differently in the output)
      const isSystemCollection = collection.startsWith("directus_");

      const ref = extractRefFromPathItem(pathItem as OpenAPIV3.PathItemObject);
      if (!ref) continue;

      const schema = (this.spec.components?.schemas?.[ref] ??
        {}) as OpenAPIV3.SchemaObject;

      // Generate type name for the collection
      const typeName =
        this.typeNameManager.getTypeNameForCollection(collection);

      // Map the collection to its clean type name
      const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);

      if (!this.typeNameManager.hasProcessedType(cleanTypeName)) {
        this.typeNameManager.addProcessedType(cleanTypeName);

        // For system collections, we'll only include custom fields
        if (isSystemCollection) {
          this.systemCollectionManager.generateSystemCollectionInterface(
            schema,
            collection,
          );
        } else {
          // Generate interface for regular collection
          this.interfaceGenerator.generateSDKInterface(
            schema,
            typeName,
            collection,
          );
        }
      }

      if (this.typeTracker.hasValidContent(cleanTypeName)) {
        schemas[collection] = { ref, schema };
      }
    }
  }
}
