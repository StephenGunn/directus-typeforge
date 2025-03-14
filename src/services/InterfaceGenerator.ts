import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import { TypeTracker } from "./TypeTracker";
import { PropertyGenerator } from "./PropertyGenerator";
import { TypeNameManager } from "./TypeNameManager";
import { SystemCollectionManager } from "./SystemCollectionManager";

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
   * Generates TypeScript interface from schema
   */
  generateSDKInterface(
    schema: OpenAPIV3.SchemaObject,
    refName: string,
    collectionName?: string,
  ): void {
    if (!schema.properties) return;

    // Clean the type name to remove Items prefix
    const typeName = this.typeNameManager.cleanTypeName(refName);

    const nonSystemFields = Object.entries(schema.properties).filter(
      ([propName]) =>
        !this.systemCollectionManager.isSystemField(propName, collectionName),
    );

    if (nonSystemFields.length === 0) {
      // If no properties, add default id field for regular collections
      const keyword = this.options.useTypes ? "type" : "interface";
      const interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: string;
}\n\n`;
      this.typeTracker.addType(typeName, interfaceStr, ["id"]);
      return;
    }

    const keyword = this.options.useTypes ? "type" : "interface";
    let interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: string;\n`;
    const properties: string[] = [];

    // Always add id field first for regular collections
    properties.push("id");

    for (const [propName, propSchema] of nonSystemFields) {
      if (typeof propSchema !== "object" || propName === "id") continue;
      properties.push(propName);

      interfaceStr += this.propertyGenerator.generatePropertyDefinition(
        propName,
        propSchema,
        false,
        collectionName,
      );
    }

    interfaceStr += "}\n\n";
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }

  /**
   * Generates the final TypeScript definitions including the root schema interface
   */
  generateTypeDefinitions(
    collectionSchemas: Record<
      string,
      { ref: string; schema: OpenAPIV3.SchemaObject }
    >,
  ): string {
    const validCollections = Object.entries(collectionSchemas).filter(
      ([, { ref }]) => {
        const typeName = this.typeNameManager.getTypeNameForCollection(ref);
        const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
        return this.typeTracker.hasValidContent(cleanTypeName);
      },
    );

    // First add all interfaces
    let source = "";
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }

    // Then create the main schema type
    if (validCollections.length > 0) {
      const keyword = this.options.useTypes ? "type" : "interface";
      source += `\nexport ${keyword} ${this.options.typeName} ${this.options.useTypes ? "= " : ""}{`;

      // First add non-system collections
      const nonSystemCollections = validCollections.filter(
        ([collectionName]) => !collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { schema }] of nonSystemCollections) {
        // Use the ExtendedSchemaObject type for checking x-singleton
        const extendedSchema =
          schema as import("../types").ExtendedSchemaObject;
        const isSingleton = !!extendedSchema["x-singleton"];

        // Use type name from our map, ensuring it's clean
        const typeName =
          this.typeNameManager.getTypeNameForCollection(collectionName);
        const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);

        source += `\n  ${collectionName}: ${cleanTypeName}${isSingleton ? "" : "[]"};`;
      }

      // Then add system collections with custom fields
      const systemCollections = validCollections.filter(([collectionName]) =>
        collectionName.startsWith("directus_"),
      );

      for (const [collectionName, { ref }] of systemCollections) {
        const typeName = this.typeNameManager.getSystemCollectionTypeName(ref);
        // Skip system collections that have no custom fields (empty interfaces)
        if (this.typeTracker.hasType(typeName)) {
          source += `\n  ${collectionName}: ${typeName}[];`;
        }
      }

      source += `\n}\n\n`;
    }

    return source;
  }
}
