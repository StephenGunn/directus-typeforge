import { TypeTracker } from "./TypeTracker";
import { PropertyGenerator } from "./PropertyGenerator";
import { TypeNameManager } from "./TypeNameManager";
import { SystemCollectionManager } from "./SystemCollectionManager";
import type { DirectusCollection, DirectusField } from "../types";

/**
 * Generates TypeScript interfaces for collections
 */
export class InterfaceGenerator {
  private typeTracker: TypeTracker;
  private propertyGenerator: PropertyGenerator;
  private typeNameManager: TypeNameManager;
  private systemCollectionManager: SystemCollectionManager;
  private options: {
    typeName: string;
    useTypes?: boolean;
  };

  constructor(
    typeTracker: TypeTracker,
    propertyGenerator: PropertyGenerator,
    typeNameManager: TypeNameManager,
    systemCollectionManager: SystemCollectionManager,
    options: {
      typeName: string;
      useTypes?: boolean;
    },
  ) {
    this.typeTracker = typeTracker;
    this.propertyGenerator = propertyGenerator;
    this.typeNameManager = typeNameManager;
    this.systemCollectionManager = systemCollectionManager;
    this.options = options;
  }

  /**
   * Generates TypeScript interface from schema fields
   */
  generateCollectionInterface(
    collection: DirectusCollection,
    fields: DirectusField[],
    idType: "string" | "number" = "string"
  ): void {
    const collectionName = collection.collection;
    const typeName = this.typeNameManager.getTypeNameForCollection(collectionName);
    const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);

    // Use type or interface keyword based on options
    const keyword = this.options.useTypes ? "type" : "interface";

    // Start building the interface
    let interfaceStr = `export ${keyword} ${cleanTypeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};\n`;

    // Track properties for the type tracker
    const properties: string[] = ["id"];

    // Process all fields except ID (which we already added)
    for (const field of fields) {
      if (field.field === "id") continue;

      // Skip system fields for non-system collections or if includeSystemFields is false
      if (this.systemCollectionManager.isSystemField(field.field, collectionName)) {
        continue;
      }

      // Add the field to properties
      properties.push(field.field);

      // Generate the property definition using PropertyGenerator
      interfaceStr += this.propertyGenerator.generateFieldDefinition(
        field,
        collectionName
      );
    }

    // Close the interface
    interfaceStr += "}\n\n";

    // Add the interface to TypeTracker
    this.typeTracker.addType(cleanTypeName, interfaceStr, properties);
  }

  /**
   * Generates the final TypeScript definitions including the root schema interface
   */
  generateRootType(collections: DirectusCollection[]): string {
    // First add all interfaces
    let source = "";
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }

    // Then create the main schema type
    if (collections.length > 0) {
      const keyword = this.options.useTypes ? "type" : "interface";
      source += `\nexport ${keyword} ${this.options.typeName} ${this.options.useTypes ? "= " : ""}{`;

      // First add non-system collections
      const nonSystemCollections = collections.filter(
        (collection) => !collection.collection.startsWith("directus_")
      );

      for (const collection of nonSystemCollections) {
        const collectionName = collection.collection;
        const typeName = this.typeNameManager.getTypeNameForCollection(collectionName);
        const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
        
        // Check for singleton collection
        const isSingleton = collection.meta.singleton === true;

        source += `\n  ${collectionName}: ${cleanTypeName}${isSingleton ? "" : "[]"};`;
      }

      // Then add system collections with custom fields
      const systemCollections = collections.filter(
        (collection) => collection.collection.startsWith("directus_")
      );

      if (systemCollections.length > 0 && nonSystemCollections.length > 0) {
        // Add separator if we have both system and non-system collections
        source += "\n";
      }

      for (const collection of systemCollections) {
        const collectionName = collection.collection;
        const typeName = this.typeNameManager.getTypeNameForCollection(collectionName);
        const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
        
        // Skip system collections that have no custom fields (empty interfaces)
        if (this.typeTracker.hasType(cleanTypeName)) {
          source += `\n  ${collectionName}: ${cleanTypeName}[];`;
        }
      }

      source += `\n}\n\n`;
    }

    return source;
  }
}
