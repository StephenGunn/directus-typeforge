import { 
  DirectusField, 
  DirectusRelation, 
  RelationshipType 
} from "../types";

/**
 * Processes and analyzes relationships between collections
 */
export class RelationshipProcessor {
  private relationships: Map<string, Map<string, { 
    type: RelationshipType;
    relatedCollection: string;
    relatedType: string;
    throughJunction?: string;
  }>>;
  private junctionTables: Set<string> = new Set();

  constructor() {
    this.relationships = new Map();
  }
  
  /**
   * Check if a collection is a junction table
   */
  isJunctionTable(collectionName: string): boolean {
    return this.junctionTables.has(collectionName);
  }

  /**
   * Get the relationships map
   */
  getRelationships(): Map<string, Map<string, {
    type: RelationshipType;
    relatedCollection: string;
    relatedType: string;
    throughJunction?: string;
  }>> {
    return this.relationships;
  }

  /**
   * Get a relationship for a specific field
   */
  getRelationshipForField(collectionName: string, fieldName: string) {
    return this.relationships.get(collectionName)?.get(fieldName);
  }

  /**
   * Add a relationship to the map
   */
  addRelationship(
    collectionName: string,
    fieldName: string,
    type: RelationshipType,
    relatedCollection: string,
    relatedType: string,
    throughJunction?: string
  ): void {
    if (!this.relationships.has(collectionName)) {
      this.relationships.set(collectionName, new Map());
    }

    this.relationships.get(collectionName)!.set(fieldName, {
      type,
      relatedCollection,
      relatedType,
      throughJunction
    });
  }

  /**
   * Create a relationship type string based on the relationship and field information
   */
  getTypeForRelationship(
    relationship: { 
      type: RelationshipType; 
      relatedCollection: string;
      relatedType: string;
    },
    field: DirectusField,
    useTypeReferences: boolean,
    relatedIdType: string
  ): string {
    // For many-to-any relationships
    if (relationship.type === RelationshipType.ManyToAny) {
      if (field.field === "item") {
        return "string"; // ID of the related item
      }
      if (field.field === "collection") {
        return "string"; // Name of the related collection
      }
    }
    
    // Get the related type name
    const relatedTypeName = relationship.relatedType;
    
    // Return different types based on relationship type and useTypeReferences option
    switch (relationship.type) {
      case RelationshipType.OneToMany:
      case RelationshipType.ManyToMany:
        // For array relationships
        return useTypeReferences 
          ? `${relatedIdType}[] | ${relatedTypeName}[]`
          : `${relatedTypeName}[]`;
        
      case RelationshipType.ManyToOne:
      case RelationshipType.OneToOne:
        // For object relationships
        return useTypeReferences 
          ? `${relatedIdType} | ${relatedTypeName}`
          : relatedTypeName;
        
      default:
        // Default for unknown relationship types
        return "unknown";
    }
  }

  /**
   * Determine the type of relationship from a relation definition
   */
  determineRelationshipType(relation: DirectusRelation): RelationshipType {
    // Special handling for junction tables
    // Fields in junction tables should be ManyToOne, not arrays
    if (this.isJunctionTable(relation.collection)) {
      // Fields in junction tables are always singular references (ManyToOne)
      return RelationshipType.ManyToOne;
    }
    
    // M2M relationships have a junction field
    if (relation.meta.junction_field) {
      return RelationshipType.ManyToMany;
    }
    
    // M2A relationships have no one_collection but have an item field
    if (relation.meta.one_collection === null && 
        relation.field === 'item' && 
        relation.collection.includes('_related_')) {
      return RelationshipType.ManyToAny;
    }
    
    // Self-referential relationship handling
    if (relation.collection === relation.related_collection) {
      // For self-referential relationships, we need to analyze metadata first,
      // then fall back to name patterns if metadata is inconclusive
      
      // 1. Primary approach: Analyze schema metadata
      
      // Check schema cardinality - if we have "many_field" this is the "many" side
      if (relation.meta.many_field === relation.field) {
        return RelationshipType.ManyToOne;
      }
      
      // If we have "one_field" this is the "one" side
      if (relation.meta.one_field === relation.field) {
        return RelationshipType.OneToMany;
      }
      
      // Check schema structure to determine cardinality
      if (relation.meta.junction_field !== null) {
        return RelationshipType.ManyToMany;
      }
      
      // 2. Secondary approach: Use field name patterns as fallback heuristic
      
      // Common patterns for parent/child self-referential relationships
      const parentFieldNames = ['parent', 'parent_id', 'parent_item', 'parent_record'];
      const childFieldNames = ['children', 'child', 'replies', 'responses', 'subitems', 'descendants'];
      
      // Check if this is a parent field (many-to-one, each item has one parent)
      if (parentFieldNames.includes(relation.field)) {
        return RelationshipType.ManyToOne;
      }
      
      // Check if this is a children field (one-to-many, one item has many children)
      if (childFieldNames.includes(relation.field)) {
        return RelationshipType.OneToMany;
      }
      
      // 3. Last resort: Check other schema properties
      const isToMany = Array.isArray(relation.meta.one_allowed_collections);
      
      return isToMany ? RelationshipType.OneToMany : RelationshipType.ManyToOne;
    }
    
    // O2M relationships have one_collection matching this collection
    if (relation.meta.one_collection === relation.collection) {
      return RelationshipType.OneToMany;
    }
    
    // Default to M2O for everything else
    return RelationshipType.ManyToOne;
  }

  /**
   * Process schema relations to build the relationships map
   */
  processRelations(
    relations: DirectusRelation[],
    getTypeNameForCollection: (collection: string) => string
  ): void {
    // First, identify all junction tables
    this.identifyJunctionTables(relations);
    
    // Then process all relations
    for (const relation of relations) {
      if (!relation.related_collection) continue;
      
      // Determine relationship type
      const relationshipType = this.determineRelationshipType(relation);
      
      // Get the type name for the related collection
      const relatedTypeName = getTypeNameForCollection(relation.related_collection);
      
      // Add the relationship
      this.addRelationship(
        relation.collection,
        relation.field,
        relationshipType,
        relation.related_collection,
        relatedTypeName,
        relation.meta.junction_field || undefined
      );
    }
  }
  
  /**
   * Identify all junction tables in the schema
   */
  private identifyJunctionTables(relations: DirectusRelation[]): void {
    this.junctionTables.clear();
    
    // A collection is a junction table if:
    // 1. It's referenced in a relation with a junction_field
    // 2. It has relations to exactly two other tables (in most cases)
    // 3. Its name follows common junction table naming patterns
    
    // First, find all collections referenced as junction tables in relations
    for (const relation of relations) {
      if (relation.meta.junction_field && relation.collection) {
        this.junctionTables.add(relation.collection);
      }
    }
    
    // Also identify by common naming patterns for junction tables
    for (const relation of relations) {
      const collectionName = relation.collection;
      if (!collectionName) continue;
      
      // Common naming patterns for junction tables
      if (
        // Tables with "pivot" in name
        collectionName.includes('_pivot_') || 
        // Tables with plural collection names on both sides
        /[a-z]+s_[a-z]+s/.test(collectionName) ||
        // Tables with the name pattern collection1_collection2 
        collectionName.includes('_to_') ||
        // Tables with "junction" in the name
        collectionName.includes('_junction_') ||
        // Tables with "join" in the name
        collectionName.includes('_join_') ||
        // Other common junction patterns
        collectionName.endsWith('_relations') ||
        collectionName.endsWith('_links') ||
        collectionName.endsWith('_connections') ||
        // Common naming patterns for junction tables
        /_(?:assignments|sponsorships|members|items|participants|permissions|connections|relations|mappings|allocations|registrations|enrollments)$/.test(collectionName)
      ) {
        this.junctionTables.add(collectionName);
      }
    }
    
    // Analyze schema structure to identify junction tables
    // Count relations for each collection to find those with exactly 2 foreign keys
    const relationCount = new Map<string, number>();
    
    for (const relation of relations) {
      if (!relation.collection) continue;
      
      // Count foreign key relations for each collection
      if (relation.field && relation.related_collection) {
        relationCount.set(
          relation.collection, 
          (relationCount.get(relation.collection) || 0) + 1
        );
      }
    }
    
    // Collections with exactly 2 foreign keys are likely junction tables
    for (const [collection, count] of relationCount.entries()) {
      if (count === 2) {
        this.junctionTables.add(collection);
      }
    }
    
    // Log identified junction tables for debugging
    console.log("\n===== Identified Junction Tables =====");
    console.log(Array.from(this.junctionTables).join(", "));
  }

  /**
   * Get a readable name for a relationship type
   */
  getRelationshipTypeName(type: RelationshipType): string {
    switch (type) {
      case RelationshipType.OneToMany:
        return "OneToMany";
      case RelationshipType.ManyToOne:
        return "ManyToOne";
      case RelationshipType.ManyToMany:
        return "ManyToMany";
      case RelationshipType.ManyToAny:
        return "ManyToAny";
      default:
        return "Unknown";
    }
  }
}