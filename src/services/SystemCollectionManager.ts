import { SYSTEM_FIELDS } from "../constants/system_fields";
import { TypeTracker } from "./TypeTracker";
import { TypeNameManager } from "./TypeNameManager";
import { SystemFieldDetector } from "./SystemFieldDetector";

/**
 * Handles processing of system collections
 */
export class SystemCollectionManager {
  private typeTracker: TypeTracker;
  private typeNameManager: TypeNameManager;
  private systemFieldDetector?: SystemFieldDetector;
  private options: {
    useTypes?: boolean;
    includeSystemFields?: boolean;
    makeRequired?: boolean;
  };
  private referencedSystemCollections: Set<string> = new Set();

  constructor(
    typeTracker: TypeTracker,
    typeNameManager: TypeNameManager,
    options?: {
      useTypes?: boolean;
      includeSystemFields?: boolean;
      makeRequired?: boolean;
    },
    systemFieldDetector?: SystemFieldDetector
  ) {
    this.typeTracker = typeTracker;
    this.typeNameManager = typeNameManager;
    this.systemFieldDetector = systemFieldDetector;
    this.options = options || {
      useTypes: false,
      includeSystemFields: true,
      makeRequired: true,
    };
  }

  /**
   * Register a system collection as being referenced
   */
  registerReferencedSystemCollection(typeName: string): void {
    this.referencedSystemCollections.add(typeName);
  }

  /**
   * Checks if a system collection is referenced in any custom type
   */
  isReferencedSystemCollection(typeName: string): boolean {
    return this.referencedSystemCollections.has(typeName);
  }

  /**
   * Checks if a field is a system field
   */
  isSystemField(fieldName: string, collection?: string): boolean {
    if (!collection) return false;
    
    // Case-insensitive check for directus_ prefix
    if (!collection.toLowerCase().startsWith("directus_")) return false;

    // If we have a field detector, use it first
    if (this.systemFieldDetector) {
      return this.systemFieldDetector.isSystemField(collection, fieldName);
    }
    
    // Fallback to the hardcoded SYSTEM_FIELDS if no detector is available
    // Check both original and lowercase collection name in SYSTEM_FIELDS
    const lowerCollection = collection.toLowerCase();
    
    if (collection in SYSTEM_FIELDS) {
      const fields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      return (fields as readonly string[]).includes(fieldName);
    } else {
      // Try to find a case-insensitive match in system fields
      for (const key in SYSTEM_FIELDS) {
        if (key.toLowerCase() === lowerCollection) {
          const fields = SYSTEM_FIELDS[key as keyof typeof SYSTEM_FIELDS];
          return (fields as readonly string[]).includes(fieldName);
        }
      }
    }

    return false;
  }

  /**
   * Generates minimal interfaces for essential system collections
   */
  generateEssentialSystemCollections(): void {
    // List of essential system collection types that should always be included
    const essentialSystemTypes = [
      "DirectusFile",
      "DirectusUser",
      "DirectusFolder",
      "DirectusRole",
    ];

    for (const systemType of essentialSystemTypes) {
      if (!this.typeTracker.hasType(systemType)) {
        // Get the corresponding collection name
        const collectionName =
          systemType === "DirectusFile"
            ? "directus_files"
            : systemType === "DirectusUser"
              ? "directus_users"
              : systemType === "DirectusFolder"
                ? "directus_folders"
                : systemType === "DirectusRole"
                  ? "directus_roles"
                  : null;

        if (collectionName) {
          this.generateMinimalSystemCollectionInterface(collectionName);
        }
      }
    }
  }

  /**
   * Generates a minimal interface for system collections with no custom fields
   */
  generateMinimalSystemCollectionInterface(collection: string): void {
    const typeName = this.typeNameManager.getSystemCollectionTypeName(collection);
    const keyword = this.options.useTypes ? "type" : "interface";

    // Determine correct ID type for this system collection
    const idType = this.typeNameManager.getSystemCollectionIdType(collection);

    const interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};
}\n\n`;

    this.typeTracker.addType(typeName, interfaceStr, ["id"]);
  }

  /**
   * Generate system collection interface with custom fields
   */
  generateSystemCollectionInterface(collection: string, fields: string[]): void {
    const typeName = this.typeNameManager.getSystemCollectionTypeName(collection);
    const keyword = this.options.useTypes ? "type" : "interface";
    
    // Determine ID type
    const idType = this.typeNameManager.getSystemCollectionIdType(collection);
    
    // Start with the ID field
    let interfaceStr = `export ${keyword} ${typeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};\n`;
    
    // Add other fields if provided
    const properties = ["id", ...fields];
    
    // Close the interface
    interfaceStr += "}\n\n";
    
    this.typeTracker.addType(typeName, interfaceStr, properties);
  }
}