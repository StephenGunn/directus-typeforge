import { toPascalCase } from "../utils/string";
import { systemCollections, relationshipPatterns } from "../config";
import pluralize from "pluralize";

/**
 * Manages type names, collection mappings, and naming conventions for TypeScript definitions
 */
export class TypeNameManager {
  private systemCollectionMap: Map<string, string> = new Map();
  private collectionTypeMap: Map<string, string> = new Map();
  private processedTypes: Set<string> = new Set();
  private knownCollections: Set<string> = new Set();
  private knownRelations: Map<string, Set<string>> = new Map();
  private specialRelations: Map<string, string> = new Map();
  private singletonCollections: Set<string> = new Set();

  constructor() {
    this.initializeSystemCollectionMap();
  }

  /**
   * Initialize the mapping between collection names and their type names
   */
  private initializeSystemCollectionMap(): void {
    // Map standard Directus system collections to their Type names from config
    const typeNames = systemCollections.SYSTEM_COLLECTION_TYPE_NAMES;
    
    // Create mappings without the directus_ prefix for convenience
    for (const [collectionName, typeName] of Object.entries(typeNames)) {
      // Add the mapping without directus_ prefix
      if (collectionName.startsWith('directus_')) {
        const shortName = collectionName.replace('directus_', '');
        this.systemCollectionMap.set(shortName, typeName);
      }
    }

    // Register these as known collections
    for (const collection of this.systemCollectionMap.keys()) {
      this.knownCollections.add(collection);
      this.knownCollections.add(`directus_${collection}`);
    }
  }

  /**
   * Register a collection name
   */
  registerCollection(collectionName: string): void {
    this.knownCollections.add(collectionName);
    // Also register lowercase version for case-insensitive matching
    this.knownCollections.add(collectionName.toLowerCase());
  }
  
  /**
   * Register a collection as a singleton
   */
  registerSingleton(collectionName: string): void {
    this.singletonCollections.add(collectionName);
    this.singletonCollections.add(collectionName.toLowerCase());
  }
  
  /**
   * Check if a collection is a singleton
   */
  isSingleton(collectionName: string): boolean {
    return this.singletonCollections.has(collectionName) || 
           this.singletonCollections.has(collectionName.toLowerCase());
  }

  /**
   * Register a relation field for a collection
   * Optional targetCollection can be provided to indicate what collection the field relates to
   */
  registerRelation(
    collectionName: string, 
    fieldName: string, 
    targetCollection?: string
  ): void {
    if (!this.knownRelations.has(collectionName)) {
      this.knownRelations.set(collectionName, new Set());
    }
    this.knownRelations.get(collectionName)?.add(fieldName);
    
    // If we know what this field targets, add a special mapping
    if (targetCollection) {
      // Use an empty string key for global field relationships (like 'collection' always refers to DirectusCollection)
      const lookupCollection = collectionName || "";
      const relationKey = `${lookupCollection}:${fieldName}`;
      this.specialRelations.set(relationKey, targetCollection);
    }
  }

  /**
   * Check if a field is a known relation for a collection
   */
  isKnownRelation(fieldName: string, collectionName: string): boolean {
    return !!this.knownRelations.get(collectionName)?.has(fieldName);
  }

  /**
   * Check if a name is a known collection
   */
  isCollectionName(name: string): boolean {
    return this.knownCollections.has(name) || this.knownCollections.has(name.toLowerCase());
  }

  /**
   * Cleans a type name by removing unnecessary prefixes
   */
  cleanTypeName(typeName: string): string {
    // Remove the "Items" prefix if it exists
    if (typeName.startsWith("Items")) {
      return typeName.substring(5);
    }
    return typeName;
  }

  /**
   * Convert plural name to singular for type consistency, 
   * but only if the collection is not a singleton
   */
  makeSingular(name: string, collectionName?: string): string {
    // Skip singularization if it's a singleton collection
    if (collectionName && this.isSingleton(collectionName)) {
      return name;
    }
    
    // Use pluralize library to handle all singularization rules
    return pluralize.singular(name);
  }

  /**
   * Gets the correct type name for a system collection
   */
  getSystemCollectionTypeName(collectionNameOrRef: string): string {
    // If it's a short name like 'users', map it to 'DirectusUser'
    const mappedName = this.systemCollectionMap.get(collectionNameOrRef);
    if (mappedName) {
      return mappedName;
    }

    // If it's a full name like 'directus_users', convert to 'DirectusUser'
    if (collectionNameOrRef.startsWith("directus_")) {
      const baseName = collectionNameOrRef.replace("directus_", "");
      const mappedBaseName = this.systemCollectionMap.get(baseName);
      if (mappedBaseName) {
        return mappedBaseName;
      }
      // If not found in map, use PascalCase and make singular
      const plural = toPascalCase(collectionNameOrRef);
      return this.makeSingular(plural, collectionNameOrRef);
    }

    // Not a system collection - generate appropriate name
    const pascalName = toPascalCase(collectionNameOrRef);
    return this.makeSingular(pascalName, collectionNameOrRef);
  }

  /**
   * Check if a collection name represents a system collection
   */
  isSystemCollection(collectionName: string): boolean {
    const lowerCollectionName = collectionName.toLowerCase();
    return (
      collectionName.startsWith("directus_") ||
      lowerCollectionName.startsWith("directus_") ||
      this.systemCollectionMap.has(collectionName) ||
      this.systemCollectionMap.has(lowerCollectionName)
    );
  }

  /**
   * Get type name for a collection
   */
  getTypeNameForCollection(collectionName: string): string {
    // Register as a known collection
    this.registerCollection(collectionName);

    // First check if we already have this collection mapped (case sensitive)
    if (this.collectionTypeMap.has(collectionName)) {
      return this.collectionTypeMap.get(collectionName)!;
    }
    
    // Also check case insensitive
    const lowerCollectionName = collectionName.toLowerCase();
    for (const [key, value] of this.collectionTypeMap.entries()) {
      if (key.toLowerCase() === lowerCollectionName) {
        // Store the mapping for the original case for future lookups
        this.collectionTypeMap.set(collectionName, value);
        return value;
      }
    }

    // For system collections, use the system naming convention
    if (collectionName.startsWith("directus_") || lowerCollectionName.startsWith("directus_")) {
      const typeName = this.getSystemCollectionTypeName(collectionName);
      this.collectionTypeMap.set(collectionName, typeName);
      return typeName;
    }

    // For regular collections, apply singularization conditionally
    const typeName = toPascalCase(this.makeSingular(collectionName, collectionName));
    this.collectionTypeMap.set(collectionName, typeName);
    return typeName;
  }

  /**
   * Track a processed type name
   */
  addProcessedType(typeName: string): void {
    this.processedTypes.add(typeName);
  }

  /**
   * Check if a type has already been processed
   */
  hasProcessedType(typeName: string): boolean {
    return this.processedTypes.has(typeName);
  }

  /**
   * Get all processed type names
   */
  getProcessedTypes(): Set<string> {
    return this.processedTypes;
  }

  /**
   * Check if a collection name exists in the collection-to-type map
   */
  hasCollectionMapping(collectionName: string): boolean {
    return this.collectionTypeMap.has(collectionName);
  }

  /**
   * Get the appropriate ID type for system collections
   */
  getSystemCollectionIdType(collection: string): "string" | "number" {
    const lowerCollection = collection.toLowerCase();
    
    // Check if collection is in NUMBER_ID_COLLECTIONS (case insensitive)
    const isNumberId = systemCollections.NUMBER_ID_COLLECTIONS.some(
      c => c.toLowerCase() === lowerCollection
    );
    
    // Check if collection is in STRING_ID_COLLECTIONS (case insensitive)
    const isStringId = systemCollections.STRING_ID_COLLECTIONS.some(
      c => c.toLowerCase() === lowerCollection
    );
    
    // Return the appropriate type
    return isNumberId ? "number" : "string";
  }

  /**
   * Attempts to determine the correct system collection type from a field name or reference
   * This is especially useful for junction tables and M2M relationships
   */
  getSystemTypeFromReference(
    fieldName: string,
    collectionHint?: string,
  ): string | null {
    // First check special relation mappings
    const lookupKey = `${collectionHint || ""}:${fieldName}`;
    if (this.specialRelations.has(lookupKey)) {
      const targetCollection = this.specialRelations.get(lookupKey);
      if (targetCollection) {
        // Convert target collection to type name
        if (targetCollection.startsWith("directus_")) {
          return this.getSystemCollectionTypeName(targetCollection);
        }
        return this.getTypeNameForCollection(targetCollection);
      }
    }
    
    // Special case for 'collection' field in M2A relationships
    if (fieldName === "collection") {
      return "DirectusCollection";
    }
    
    // Handle common Directus user reference field patterns
    const userReferenceFields = [
      "directus_users_id",
      "user_id",
      "user_created",
      "user_updated",
      "user",
      "owner",
      "created_by",
      "updated_by",
      "author"
    ];
    
    if (userReferenceFields.includes(fieldName)) {
      return "DirectusUser";
    }

    // Handle common Directus file reference field patterns
    const fileReferenceFields = [
      "directus_files_id",
      "file_id",
      "file",
      "image",
      "thumbnail",
      "avatar"
    ];
    
    if (fileReferenceFields.includes(fieldName)) {
      return "DirectusFile";
    }

    // Check for other common system collection references
    for (const [shortName, typeName] of this.systemCollectionMap.entries()) {
      const fullName = `directus_${shortName}`;
      if (
        fieldName === `${fullName}_id` ||
        fieldName === `${shortName}_id` ||
        fieldName === shortName
      ) {
        return typeName;
      }
    }

    // Look for matched foreignKey patterns with field_id naming
    if (fieldName.endsWith('_id') && fieldName !== 'id') {
      const baseCollection = fieldName.substring(0, fieldName.length - 3);
      if (this.isCollectionName(baseCollection)) {
        return this.getTypeNameForCollection(baseCollection);
      }
    }

    return null;
  }
}
