import { TypeNameManager } from './TypeNameManager';
import { RelationshipTracker, RelationshipType } from './RelationshipTracker';
import type { DirectusField } from '../types';

/**
 * Handles generation of TypeScript properties from Directus schema fields
 */
export class PropertyGenerator {
  private typeNameManager: TypeNameManager;
  private useTypeReferences: boolean;
  private makeRequired: boolean;
  private relationshipTracker?: RelationshipTracker;
  private addTypedocNotes: boolean;

  constructor(
    typeNameManager: TypeNameManager,
    useTypeReferences = false,
    makeRequired = false,
    addTypedocNotes = false,
    relationshipTracker?: RelationshipTracker,
  ) {
    this.typeNameManager = typeNameManager;
    this.useTypeReferences = useTypeReferences;
    this.makeRequired = makeRequired;
    this.addTypedocNotes = addTypedocNotes;
    this.relationshipTracker = relationshipTracker;
  }

  /**
   * Maps Directus field types to TypeScript types
   */
  private mapFieldTypeToTs(field: DirectusField): string {
    // Check for special types first
    if (field.meta.special) {
      // Handle JSON fields
      if (field.meta.special.includes("json") || field.type === "json") {
        return "Record<string, unknown>";
      }
      
      // Handle CSV fields
      if (field.meta.special.includes("csv")) {
        return "string[]";
      }
      
      // Handle date/time fields
      if (field.meta.special.includes("date-created") || 
          field.meta.special.includes("date-updated") ||
          field.meta.special.includes("timestamp")) {
        return "string"; // or 'datetime' for Directus SDK
      }
      
      // Handle M2M and O2M relationship alias fields
      // These fields don't have no-data in their special array
      if (field.type === "alias" && 
          (field.meta.special.includes("m2m") || 
           field.meta.special.includes("o2m") || 
           field.meta.special.includes("m2a"))) {
        // These are handled by the relationship tracking system
        // and will be properly typed when generating properties
        return "any"; // This won't be used directly, but provides a fallback
      }
    }
    
    // Map Directus types to TypeScript types
    switch (field.type) {
      case "string":
      case "text":
      case "hash":
      case "uuid":
        return "string";
      case "integer":
      case "bigInteger":
      case "float":
      case "decimal":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "json":
        return "Record<string, unknown>";
      case "csv":
        return "string[]";
      case "dateTime":
      case "date":
      case "time":
      case "timestamp":
        return "string"; // or 'datetime' for Directus SDK
      case "alias":
        // Any remaining alias fields not filtered out before this point
        // and not handled by special cases above
        return "any";
      default:
        // Default to string for unknown types
        return "string";
    }
  }

  /**
   * Generates a property definition for a Directus field
   */
  generateFieldDefinition(
    field: DirectusField,
    collectionName: string
  ): string {
    // Add JSDoc comment if note exists and addTypedocNotes is enabled
    let propertyDefinition = "";
    if (this.addTypedocNotes && field.meta.note) {
      propertyDefinition += `  /** ${field.meta.note} */\n`;
    }
    
    // Check if this is a relationship field
    if (
      this.relationshipTracker &&
      this.relationshipTracker.hasRelationship(collectionName, field.field)
    ) {
      // Generate property for relationship field
      const relationship = this.relationshipTracker.getRelationship(
        collectionName,
        field.field
      );
      
      if (relationship) {
        return propertyDefinition + this.generateRelationshipProperty(
          field.field,
          relationship,
          !this.makeRequired && field.schema.is_nullable
        );
      }
    }
    
    // Regular field (not a relationship)
    const tsType = this.mapFieldTypeToTs(field);
    const isOptional = !this.makeRequired && field.schema.is_nullable;
    
    return propertyDefinition + `  ${field.field}${isOptional ? "?" : ""}: ${tsType};\n`;
  }

  /**
   * Generates a property definition for a relationship field
   */
  private generateRelationshipProperty(
    propertyName: string,
    relationship: {
      sourceCollection: string;
      sourceField: string;
      targetCollection: string;
      relationshipType: RelationshipType;
    },
    isOptional: boolean
  ): string {
    // Get the type for the target collection
    const targetType = this.typeNameManager.getTypeNameForCollection(
      relationship.targetCollection
    );
    
    // Determine ID type for the related collection
    const idType = this.getIdTypeForCollection(relationship.targetCollection);
    
    const isToManyRelationship =
      relationship.relationshipType === RelationshipType.OneToMany ||
      relationship.relationshipType === RelationshipType.ManyToMany;
    
    // Generate the property based on relationship type
    if (isToManyRelationship) {
      // To-many: use array type
      if (this.useTypeReferences) {
        return `  ${propertyName}${isOptional ? "?" : ""}: ${idType}[] | ${targetType}[];\n`;
      } else {
        return `  ${propertyName}${isOptional ? "?" : ""}: ${targetType}[];\n`;
      }
    } else {
      // To-one: use single type
      if (this.useTypeReferences) {
        return `  ${propertyName}${isOptional ? "?" : ""}: ${idType} | ${targetType};\n`;
      } else {
        return `  ${propertyName}${isOptional ? "?" : ""}: ${targetType};\n`;
      }
    }
  }
  
  /**
   * Gets the ID type for a collection
   */
  private getIdTypeForCollection(collectionName: string): string {
    // System collections with numeric IDs
    const numericIdCollections = [
      "directus_permissions",
      "directus_activity", 
      "directus_presets",
      "directus_revisions",
      "directus_webhooks",
      "directus_settings",
      "directus_operations"
    ];
    
    if (collectionName.startsWith("directus_") && 
        numericIdCollections.includes(collectionName)) {
      return "number";
    }
    
    // Default to string for UUIDs and other string IDs
    return "string";
  }
}
