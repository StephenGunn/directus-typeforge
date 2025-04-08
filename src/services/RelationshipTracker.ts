import { RelationshipInfo, RelationshipType, DirectusRelation } from "../types";

// Re-export RelationshipType for convenience
export { RelationshipType } from "../types";

/**
 * Tracks relationships between Directus collections for accurate type generation
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
    
    // For system collections, also register the short name
    if (collectionName.toLowerCase().startsWith("directus_")) {
      const shortName = collectionName.replace(/^directus_/i, "");
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
    relationshipType: RelationshipType = RelationshipType.ManyToOne,
    junctionCollection?: string,
    junctionField?: string
  ): void {
    this.relationships.push({
      sourceCollection,
      sourceField,
      targetCollection,
      relationshipType,
      junctionCollection,
      junctionField
    });
  }

  /**
   * Process relations from the schema snapshot to identify relationship types
   */
  processRelations(relations: DirectusRelation[]): void {
    for (const relation of relations) {
      if (!relation.related_collection) continue;
      
      // Determine relationship type
      let relationshipType = RelationshipType.ManyToOne; // Default assumption
      
      if (relation.meta.junction_field) {
        relationshipType = RelationshipType.ManyToMany;
      } else if (relation.meta.one_collection === relation.collection) {
        relationshipType = RelationshipType.OneToMany;
      } else if (relation.field.endsWith('_id') || relation.field === 'id') {
        relationshipType = RelationshipType.ManyToOne;
      }
      
      // Check for special many-to-any case
      if (relation.meta.one_collection === null && 
          relation.field === 'item' && 
          relation.collection.includes('_related_')) {
        relationshipType = RelationshipType.ManyToAny;
      }
      
      this.registerRelationship(
        relation.collection,
        relation.field,
        relation.related_collection,
        relationshipType
      );
    }
  }

  /**
   * Determine if a collection is a junction table
   */
  isJunctionTable(collectionName: string): boolean {
    // Count reference fields in this collection
    const relationships = this.relationships.filter(
      (r) => r.sourceCollection === collectionName && 
             r.relationshipType === RelationshipType.ManyToOne
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
    if (collectionName.startsWith("directus_") && 
        Array.from(this.numberIdCollections).some(col => col === collectionName)) {
      return "number";
    }

    // Default to string ID for all other collections
    return "string";
  }

  /**
   * Get all relationships where a collection is the source
   */
  getRelationshipsFromCollection(collectionName: string): RelationshipInfo[] {
    return this.relationships.filter(
      (r) => r.sourceCollection === collectionName
    );
  }

  /**
   * Get all relationships where a collection is the target
   */
  getRelationshipsToCollection(collectionName: string): RelationshipInfo[] {
    return this.relationships.filter(
      (r) => r.targetCollection === collectionName
    );
  }
  
  /**
   * Get a relationship for a specific collection and field
   */
  getRelationship(collectionName: string, fieldName: string): RelationshipInfo | undefined {
    return this.relationships.find(
      (r) => r.sourceCollection === collectionName && r.sourceField === fieldName
    );
  }
  
  /**
   * Check if a relationship exists for a specific collection and field
   */
  hasRelationship(collectionName: string, fieldName: string): boolean {
    return this.relationships.some(
      (r) => r.sourceCollection === collectionName && r.sourceField === fieldName
    );
  }
}