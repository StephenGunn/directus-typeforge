import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { GenerateTypeScriptOptions, CollectionSchema } from "../types";
import { TypeTracker } from "./TypeTracker";
import { extractRefFromPathItem } from "../utils/schema";
import { TypeNameManager } from "./TypeNameManager";
import { PropertyGenerator } from "./PropertyGenerator";
import { SystemCollectionManager } from "./SystemCollectionManager";
import { InterfaceGenerator } from "./InterfaceGenerator";

/**
 * Processes OpenAPI schemas and generates TypeScript interfaces
 */
export class SchemaProcessor {
  private spec: OpenAPIV3.Document;
  private typeTracker: TypeTracker;
  private typeNameManager: TypeNameManager;
  private propertyGenerator: PropertyGenerator;
  private systemCollectionManager: SystemCollectionManager;
  private interfaceGenerator: InterfaceGenerator;
  private options: {
    typeName: string;
    useTypeReferences: boolean;
  };

  constructor(spec: OpenAPIV3.Document, options: GenerateTypeScriptOptions) {
    this.spec = spec;
    this.typeTracker = new TypeTracker();
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
    };

    // Initialize all components
    this.typeNameManager = new TypeNameManager();
    this.propertyGenerator = new PropertyGenerator(
      this.typeNameManager,
      this.options.useTypeReferences,
    );
    this.systemCollectionManager = new SystemCollectionManager(
      this.spec,
      this.typeTracker,
      this.typeNameManager,
    );
    this.interfaceGenerator = new InterfaceGenerator(
      this.typeTracker,
      this.propertyGenerator,
      this.typeNameManager,
      this.systemCollectionManager,
      this.options,
    );
  }

  /**
   * Processes the schema and generates TypeScript definitions
   */
  processSchema(): string {
    // Collect all schemas and process them
    const collectionSchemas = this.collectSchemas();

    // Generate the final type definitions
    return this.interfaceGenerator.generateTypeDefinitions(collectionSchemas);
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
