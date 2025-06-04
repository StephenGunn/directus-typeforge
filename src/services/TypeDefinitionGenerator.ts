import { DirectusCollection, DirectusField, TypeDefinition } from "../types";
import { RelationshipProcessor } from "./RelationshipProcessor";
import { SystemFieldManager } from "./SystemFieldManager";

/**
 * Generates TypeScript type definitions for collections
 */
export class TypeDefinitionGenerator {
  private typeDefinitions: Map<string, TypeDefinition> = new Map();
  private relationshipProcessor: RelationshipProcessor;
  private systemFieldManager: SystemFieldManager;
  private useTypes: boolean;
  private makeRequired: boolean;
  private addTypedocNotes: boolean;
  private collectionIdTypes: Map<string, "string" | "number"> = new Map();
  
  constructor(
    relationshipProcessor: RelationshipProcessor,
    systemFieldManager: SystemFieldManager,
    options: {
      useTypes: boolean;
      makeRequired: boolean;
      addTypedocNotes: boolean;
    }
  ) {
    this.relationshipProcessor = relationshipProcessor;
    this.systemFieldManager = systemFieldManager;
    this.useTypes = options.useTypes;
    this.makeRequired = options.makeRequired;
    this.addTypedocNotes = options.addTypedocNotes;
  }
  
  /**
   * Set collection ID type mapping
   */
  setCollectionIdTypes(collectionIdTypes: Map<string, "string" | "number">): void {
    this.collectionIdTypes = collectionIdTypes;
  }

  /**
   * Get all type definitions
   */
  getTypeDefinitions(): Map<string, TypeDefinition> {
    return this.typeDefinitions;
  }

  /**
   * Generate an interface with the given fields
   */
  generateInterfaceWithFields(
    typeName: string, 
    collectionName: string, 
    fields: DirectusField[],
    idType: string,
    isJunctionTable: boolean
  ): void {
    const lines: string[] = [
      `export ${this.useTypes ? "type" : "interface"} ${typeName} ${this.useTypes ? "= " : ""}{`
    ];
    
    // Start with ID field - all collections have an ID
    lines.push(`  id: ${idType};`);
    
    // Process each field
    for (const field of fields) {
      // Skip the id field as we already added it
      if (field.field === "id") continue;
      
      // Skip UI presentation components and internal fields that aren't relevant for API usage
      const isUIComponent = 
        // Fields with type "alias" and special includes "no-data" (but not m2m)
        (field.type === "alias" && 
         field.meta?.special && 
         field.meta.special.includes("no-data") && 
         !field.meta.special.includes("m2m")) ||
        // Fields with presentation or group interfaces
        (field.meta?.interface && 
         (field.meta.interface.startsWith("presentation-") || 
          field.meta.interface.startsWith("group-")));
      
      if (isUIComponent) {
        continue;
      }
      
      // We want to include all fields, even if they're hidden in the admin interface
      // This is because hidden fields are still accessible via the API and useful for third-party apps
      // The only exception is that we still skip UI components (which are not data fields)
      const shouldSkipHidden = false;
      
      if (shouldSkipHidden) {
        continue;
      }
      
      // Add JSDoc for field notes if enabled
      if (this.addTypedocNotes && field.meta?.note) {
        lines.push(`  /** ${field.meta.note} */`);
      }
      
      // Generate field definition
      const fieldType = this.getTypeForField(field, collectionName, idType);
      const isOptional = !this.makeRequired && field.schema.is_nullable;
      lines.push(`  ${field.field}${isOptional ? "?" : ""}: ${fieldType};`);
    }
    
    lines.push(`}`);
    
    // Add the type definition
    this.addTypeDefinition(typeName, lines);
  }

  /**
   * Get the TypeScript type for a field
   */
  private getTypeForField(field: DirectusField, collectionName: string, idType: string): string {
    // Check for relationships first
    const relationship = this.relationshipProcessor.getRelationshipForField(field.collection, field.field);
    if (relationship) {
      // Get the ID type for the related collection
      // Use the collection ID types map to get the correct type, or fall back to string
      const relatedIdType = this.collectionIdTypes.get(relationship.relatedCollection) || 'string';
      
      return this.relationshipProcessor.getTypeForRelationship(
        relationship, 
        field,
        true, // useTypeReferences
        relatedIdType
      );
    }
    
    // Handle special field types
    if (field.meta?.special) {
      // Handle M2M fields marked with special "m2m"
      if (Array.isArray(field.meta.special) && field.meta.special.includes("m2m")) {
        // First, check if the field has junction information 
        if (field.meta.junction_collection && typeof field.meta.junction_collection === 'string') {
          return `string[] | ${field.meta.junction_collection}[]`;
        }
        
        // If we can't determine the junction, default to string array
        return "string[]";
      }
      
      // Handle JSON fields
      if ((Array.isArray(field.meta.special) && field.meta.special.includes("json")) || field.type === "json") {
        return "Record<string, unknown>";
      }
      
      // Handle CSV fields
      if (Array.isArray(field.meta.special) && field.meta.special.includes("csv")) {
        return "string[]";
      }
      
      // Handle date/time fields
      if ((Array.isArray(field.meta.special) && (
          field.meta.special.includes("date-created") || 
          field.meta.special.includes("date-updated") ||
          field.meta.special.includes("timestamp")
        )) ||
          field.type === "timestamp" ||
          field.type === "dateTime" ||
          field.type === "date" ||
          field.type === "time") {
        return "'datetime'"; // Literal 'datetime' for Directus SDK compatibility
      }
      
      // Check field name patterns that commonly indicate datetime values
      const timeRelatedFieldNames = [
        'day', 'date', 'time', 'datetime', 'timestamp',
        'start', 'end', 'begin', 'finish',
        'created', 'modified', 'updated',
        'scheduled', 'published', 'expired',
        'due', 'deadline'
      ];
      
      // Check standard Directus metadata date fields explicitly
      const directusDateFields = ['date_created', 'date_updated', 'user_created', 'user_updated'];
      if (directusDateFields.includes(field.field)) {
        return field.field.startsWith('user_') ? 'string' : "'datetime'";
      }
      
      // Check if the field name matches time patterns
      if (timeRelatedFieldNames.some(name => 
          field.field === name || 
          field.field.startsWith(name + '_') || 
          field.field.endsWith('_' + name))) {
        return "'datetime'";
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
        return "'datetime'"; // Literal 'datetime' for Directus SDK
      default:
        // Check if data_type is a date type in schema
        if (field.schema?.data_type && 
            (field.schema.data_type === 'date' || 
             field.schema.data_type === 'datetime' || 
             field.schema.data_type === 'timestamp' || 
             field.schema.data_type === 'time')) {
          return "'datetime'";
        }
        
        // Default to string for unknown types
        return "string";
    }
  }

  /**
   * Add a type definition to the map
   */
  private addTypeDefinition(name: string, lines: string[]): void {
    // Join lines with newlines
    const content = lines.join("\n") + "\n\n";
    
    // Store the type definition
    this.typeDefinitions.set(name, {
      content,
      properties: [] // We don't need to track properties in the simplified version
    });
  }

  /**
   * Generate the root API schema interface
   */
  generateRootInterface(typeName: string, collections: DirectusCollection[], systemTypes: string[] = []): void {
    if (!collections || collections.length === 0) {
      return;
    }
    
    const lines: string[] = [
      `export ${this.useTypes ? "type" : "interface"} ${typeName} ${this.useTypes ? "= " : ""}{`
    ];
    
    // Collections to exclude from output completely
    const excludedCollections = ['Application_Data', 'application_data'];
    
    // Add non-system collections that aren't excluded
    const regularCollections = collections.filter(
      c => !c.collection.startsWith("directus_") && !excludedCollections.includes(c.collection)
    );
    
    for (const collection of regularCollections) {
      // Get the type name for this collection
      const typeName = collection.meta?._type_name || collection.collection; // Use cached type name if available
      
      // Check if this is a singleton collection
      const isSingleton = collection.meta?.singleton === true;
      
      // Add to the root interface - singletons are not arrays
      lines.push(`  ${collection.collection}: ${typeName}${isSingleton ? "" : "[]"};`);
    }
    
    // If we have system types, add them to the root interface
    if (systemTypes.length > 0) {
      for (const typeName of systemTypes) {
        // Convert PascalCase type name to snake_case collection name
        let collectionName = "";
        
        if (typeName === "DirectusUser") {
          collectionName = "directus_users";
        } else if (typeName === "DirectusFile") {
          collectionName = "directus_files";
        } else if (typeName === "DirectusFolder") {
          collectionName = "directus_folders";
        } else if (typeName === "DirectusRole") {
          collectionName = "directus_roles";
        } else {
          // General case - convert camelCase to snake_case
          const words = typeName.replace(/^Directus/, '').split(/(?=[A-Z])/);
          const snakeCase = words.map(word => word.toLowerCase()).join('_');
          collectionName = `directus_${snakeCase}`;
        }
        
        // System collections are never singletons
        lines.push(`  ${collectionName}: ${typeName}[];`);
      }
    }
    
    // Close the interface
    lines.push(`}`);
    
    // Add the type definition
    this.addTypeDefinition(typeName, lines);
  }

  /**
   * Build the final TypeScript output
   */
  buildOutput(mainTypeName: string): string {
    const output: string[] = [];
    
    // Add comment header
    output.push("/**");
    output.push(" * Generated TypeScript types for Directus Schema");
    output.push(" * Generated on: " + new Date().toISOString());
    output.push(" */\n");
    
    // Add all type definitions in order:
    // 1. Regular collection types
    const regularTypes = Array.from(this.typeDefinitions.keys())
      .filter(name => !name.startsWith("Directus") && name !== mainTypeName);
    
    for (const typeName of regularTypes) {
      output.push(this.typeDefinitions.get(typeName)!.content);
    }
    
    // 2. System collection types
    const systemTypes = Array.from(this.typeDefinitions.keys())
      .filter(name => name.startsWith("Directus"));
    
    if (systemTypes.length > 0) {
      for (const typeName of systemTypes) {
        output.push(this.typeDefinitions.get(typeName)!.content);
      }
    }
    
    // 3. Root type at the end
    if (this.typeDefinitions.has(mainTypeName)) {
      output.push(this.typeDefinitions.get(mainTypeName)!.content);
    }
    
    return output.join("");
  }
}