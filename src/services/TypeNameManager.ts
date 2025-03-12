import { toPascalCase } from "../utils/string";

/**
 * Manages type names, collection mappings, and naming conventions for TypeScript definitions
 */
export class TypeNameManager {
  private systemCollectionMap: Map<string, string> = new Map();
  private collectionTypeMap: Map<string, string> = new Map();
  private processedTypes: Set<string> = new Set();

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
   * Convert plural name to singular for type consistency
   */
  makeSingular(name: string): string {
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
      return this.makeSingular(plural);
    }

    // Not a system collection - generate appropriate name
    const pascalName = toPascalCase(collectionNameOrRef);
    return this.makeSingular(pascalName);
  }

  /**
   * Check if a collection name represents a system collection
   */
  isSystemCollection(collectionName: string): boolean {
    return (
      collectionName.startsWith("directus_") ||
      this.systemCollectionMap.has(collectionName)
    );
  }

  /**
   * Get type name for a collection
   */
  getTypeNameForCollection(collectionName: string): string {
    // First check if we already have this collection mapped
    if (this.collectionTypeMap.has(collectionName)) {
      return this.collectionTypeMap.get(collectionName)!;
    }

    // For system collections, use the system naming convention
    if (collectionName.startsWith("directus_")) {
      const typeName = this.getSystemCollectionTypeName(collectionName);
      this.collectionTypeMap.set(collectionName, typeName);
      return typeName;
    }

    // For regular collections, just use the singular form in PascalCase without any prefix
    const typeName = toPascalCase(this.makeSingular(collectionName));
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
  getSystemCollectionIdType(collection: string): string {
    // Most system collections have string ids, except for specific ones
    const numberIdCollections = [
      "directus_permissions",
      "directus_activity",
      "directus_presets",
      "directus_revisions",
      "directus_webhooks",
      "directus_settings",
    ];

    return numberIdCollections.includes(collection) ? "number" : "string";
  }

  /**
   * Attempts to determine the correct system collection type from a field name or reference
   * This is especially useful for junction tables and M2M relationships
   */
  getSystemTypeFromReference(
    fieldName: string,
    collectionHint?: string,
  ): string | null {
    // Common patterns for directus_users references in junction tables
    if (
      fieldName === "directus_users_id" ||
      fieldName === "user_id" ||
      fieldName === "user" ||
      (collectionHint && collectionHint.includes("directus_users"))
    ) {
      return "DirectusUser";
    }

    // Check for other common system collection references
    for (const [shortName, typeName] of this.systemCollectionMap.entries()) {
      const fullName = `directus_${shortName}`;
      if (
        fieldName === `${fullName}_id` ||
        fieldName === `${shortName}_id` ||
        fieldName === shortName ||
        (collectionHint && collectionHint.includes(fullName))
      ) {
        return typeName;
      }
    }

    return null;
  }
}
