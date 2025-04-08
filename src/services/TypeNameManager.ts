import { toPascalCase } from "../utils/string";

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
    // Map standard Directus system collections to their Type names
    this.systemCollectionMap.set("users", "DirectusUser");
    this.systemCollectionMap.set("files", "DirectusFile");
    this.systemCollectionMap.set("folders", "DirectusFolder");
    this.systemCollectionMap.set("roles", "DirectusRole");
    this.systemCollectionMap.set("activity", "DirectusActivity");
    this.systemCollectionMap.set("permissions", "DirectusPermission");
    this.systemCollectionMap.set("fields", "DirectusField");
    this.systemCollectionMap.set("collections", "DirectusCollection");
    this.systemCollectionMap.set("presets", "DirectusPreset");
    this.systemCollectionMap.set("relations", "DirectusRelation");
    this.systemCollectionMap.set("revisions", "DirectusRevision");
    this.systemCollectionMap.set("webhooks", "DirectusWebhook");
    this.systemCollectionMap.set("flows", "DirectusFlow");
    this.systemCollectionMap.set("operations", "DirectusOperation");
    this.systemCollectionMap.set("versions", "DirectusVersion");
    this.systemCollectionMap.set("extensions", "DirectusExtension");
    this.systemCollectionMap.set("comments", "DirectusComment");
    this.systemCollectionMap.set("settings", "DirectusSetting");

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
    
    // Common plural endings
    if (name.endsWith("ies")) {
      return name.slice(0, -3) + "y";
    } else if (name.endsWith("ses")) {
      return name.slice(0, -2);
    } else if (
      name.endsWith("s") &&
      !name.endsWith("ss") &&
      !name.endsWith("us") &&
      !name.endsWith("is")
    ) {
      return name.slice(0, -1);
    }
    return name;
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
    // Most system collections have string ids, except for specific ones
    const numberIdCollections = [
      "directus_permissions",
      "directus_activity",
      "directus_presets",
      "directus_revisions",
      "directus_webhooks",
      "directus_settings",
      "directus_operations",
    ];

    // Case insensitive check
    return numberIdCollections.some(c => c.toLowerCase() === collection.toLowerCase()) ? "number" : "string";
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
    if (
      fieldName === "directus_users_id" ||
      fieldName === "user_id" || 
      fieldName === "user_created" ||
      fieldName === "user_updated" ||
      fieldName === "user" ||
      fieldName === "owner" ||
      fieldName === "created_by" ||
      fieldName === "updated_by" ||
      fieldName === "author"
    ) {
      return "DirectusUser";
    }

    // Handle common Directus file reference field patterns
    if (
      fieldName === "directus_files_id" ||
      fieldName === "file_id" ||
      fieldName === "file" ||
      fieldName === "image" ||
      fieldName === "thumbnail" ||
      fieldName === "avatar"
    ) {
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
