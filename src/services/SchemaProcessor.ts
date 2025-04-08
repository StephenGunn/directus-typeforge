import {
  DirectusSchemaSnapshot,
  DirectusCollection,
  DirectusField,
  DirectusRelation,
  RelationshipType,
  TypeDefinition,
  GenerateTypeScriptOptions
} from "../types";
import { toPascalCase } from "../utils/string";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import { SystemFieldDetector } from "./SystemFieldDetector";

/**
 * Core schema processor that converts Directus schema into TypeScript definitions
 */
export class SchemaProcessor {
  private snapshot: DirectusSchemaSnapshot;
  private options: Required<GenerateTypeScriptOptions>;
  
  // Track type definitions
  private typeDefinitions: Map<string, TypeDefinition> = new Map();
  
  // Maps to track collection info and relationships
  private collectionTypes: Map<string, string> = new Map();
  private collectionIdTypes: Map<string, "string" | "number"> = new Map();
  private relationships: Map<string, Map<string, { 
    type: RelationshipType;
    relatedCollection: string;
    relatedType: string;
    throughJunction?: string;
  }>> = new Map();
  
  // Track processed collections to avoid duplication
  private processedCollections: Set<string> = new Set();
  
  // System collections with ID type = number
  private readonly numberIdCollections = new Set([
    "directus_permissions",
    "directus_activity",
    "directus_presets",
    "directus_revisions",
    "directus_webhooks",
    "directus_settings",
    "directus_operations",
  ]);

  constructor(
    snapshot: DirectusSchemaSnapshot, 
    options: GenerateTypeScriptOptions,
    private systemFieldDetector?: SystemFieldDetector
  ) {
    this.snapshot = snapshot;
    
    // Set default options for best SDK compatibility
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
      useTypes: options.useTypes ?? false,
      makeRequired: options.makeRequired ?? true,
      includeSystemFields: options.includeSystemFields ?? true,
      addTypedocNotes: options.addTypedocNotes ?? true,
    };
  }

  /**
   * Process the schema and generate TypeScript type definitions
   */
  process(): string {
    this.registerCollections();
    this.analyzeRelationships();
    this.generateTypeDefinitions();
    return this.buildOutput();
  }

  /**
   * Register all collections and determine their ID types
   */
  private registerCollections(): void {
    if (!this.snapshot.data.collections) return;
    
    for (const collection of this.snapshot.data.collections) {
      const typeName = this.getTypeNameForCollection(collection.collection);
      this.collectionTypes.set(collection.collection, typeName);
      
      // Determine ID type for this collection
      const idType = this.getIdTypeForCollection(collection.collection);
      this.collectionIdTypes.set(collection.collection, idType);
    }
  }
  
  /**
   * Determines if a collection is a singleton
   */
  private isSingleton(collectionName: string): boolean {
    if (!this.snapshot.data.collections) return false;
    
    const collection = this.snapshot.data.collections.find(
      c => c.collection === collectionName
    );
    
    return collection?.meta.singleton === true;
  }

  /**
   * Analyze relationships between collections
   */
  private analyzeRelationships(): void {
    if (!this.snapshot.data.relations) return;
    
    for (const relation of this.snapshot.data.relations) {
      if (!relation.related_collection) continue;
      
      // Determine relationship type
      const relationshipType = this.determineRelationshipType(relation);
      
      // Get the type name for the related collection
      const relatedTypeName = this.getTypeNameForCollection(relation.related_collection);
      
      // Create relationship entry for this collection if it doesn't exist
      if (!this.relationships.has(relation.collection)) {
        this.relationships.set(relation.collection, new Map());
      }
      
      // Add the relationship
      this.relationships.get(relation.collection)!.set(relation.field, {
        type: relationshipType,
        relatedCollection: relation.related_collection,
        relatedType: relatedTypeName,
        // For M2M relationships, store the junction field name
        throughJunction: relation.meta.junction_field || undefined
      });
    }
  }

  /**
   * Determine the type of relationship from a relation definition
   */
  private determineRelationshipType(relation: DirectusRelation): RelationshipType {
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
    
    // O2M relationships have one_collection matching this collection
    if (relation.meta.one_collection === relation.collection) {
      return RelationshipType.OneToMany;
    }
    
    // Default to M2O for everything else
    return RelationshipType.ManyToOne;
  }

  /**
   * Generate interface definitions for all collections
   */
  private generateTypeDefinitions(): void {
    if (!this.snapshot.data.collections) return;
    
    // First, ensure all system collections referenced in relations are processed
    this.ensureSystemCollectionsFromRelations();
    
    // Process all collections in the schema
    for (const collection of this.snapshot.data.collections) {
      // Skip if already processed
      if (this.processedCollections.has(collection.collection)) continue;
      
      // Mark as processed
      this.processedCollections.add(collection.collection);
      
      // Check if this is a system collection
      const isSystemCollection = collection.collection.startsWith("directus_");
      
      if (isSystemCollection) {
        // Generate system collection interface with system fields
        this.generateSystemCollectionInterface(collection);
      } else {
        // Generate regular collection interface
        this.generateCollectionInterface(collection);
      }
    }
    
    // Generate the root schema interface
    this.generateRootInterface();
  }
  
  /**
   * Ensure all system collections referenced in relations are processed
   */
  private ensureSystemCollectionsFromRelations(): void {
    if (!this.snapshot.data.relations) return;
    
    // Create a set of all collection names that need to be processed
    const collectionsToProcess = new Set<string>();
    
    // Extract all system collections referenced in relations
    for (const relation of this.snapshot.data.relations) {
      // Get both collection and related_collection
      if (relation.collection?.startsWith('directus_')) {
        collectionsToProcess.add(relation.collection);
      }
      
      if (relation.related_collection?.startsWith('directus_')) {
        collectionsToProcess.add(relation.related_collection);
      }
    }
    
    // Process system collections that need to be added
    for (const collectionName of collectionsToProcess) {
      // Skip if already processed
      if (this.processedCollections.has(collectionName)) continue;
      
      // Create a minimal collection object
      const collection = {
        collection: collectionName,
        meta: {
          collection: collectionName,
          singleton: false
        }
      };
      
      // Generate system collection interface
      this.generateSystemCollectionInterface(collection as DirectusCollection);
      
      // Mark as processed
      this.processedCollections.add(collectionName);
    }
  }

  /**
   * Generate interface for a system collection
   * This approach always includes custom fields from the schema snapshot,
   * and adds system fields only if includeSystemFields is true
   */
  private generateSystemCollectionInterface(collection: DirectusCollection): void {
    const collectionName = collection.collection;
    const typeName = this.getTypeNameForCollection(collectionName);
    const idType = this.collectionIdTypes.get(collectionName) || "string";
    
    // Step 1: Get custom fields from schema snapshot (including M2M and other relationships)
    let customFields = this.getCustomFieldsForCollection(collectionName);
    
    // Step 2: Enhance with relationship fields from relations data
    // This is crucial for fields like as_staff that are defined in relations rather than fields
    customFields = this.enhanceWithRelationFields(customFields, collectionName);
    
    // We don't need this section any more as we're handling it in enhanceWithRelationFields
    
    // Step 3: Track what fields we have so far to avoid duplicates
    const fieldNameSet = new Set(customFields.map(f => f.field));
    const finalFields = [...customFields];
    
    // Step 4: If includeSystemFields is true, add system fields that aren't already included
    if (this.options.includeSystemFields) {
      // Get all fields for the collection
      const allFields = this.getAllFieldsForCollection(collectionName);
      
      // Add any fields that aren't already in our custom fields list
      for (const field of allFields) {
        if (!fieldNameSet.has(field.field)) {
          finalFields.push(field);
          fieldNameSet.add(field.field);
        }
      }
    }
    
    // Step 5: Always include the id field if it's not already present
    if (!fieldNameSet.has('id')) {
      // Create a synthetic id field
      const idField: DirectusField = {
        collection: collectionName,
        field: 'id',
        type: idType,
        meta: {
          collection: collectionName,
          field: 'id',
          hidden: false,
          interface: 'input',
          special: undefined,
          system: true
        },
        schema: {
          name: 'id',
          table: collectionName,
          data_type: idType,
          default_value: null,
          max_length: null,
          numeric_precision: null,
          numeric_scale: null,
          is_nullable: false,
          is_unique: true,
          is_primary_key: true,
          has_auto_increment: false,
          foreign_key_table: null,
          foreign_key_column: null
        }
      };
      finalFields.push(idField);
      fieldNameSet.add('id');
    }
    
    // Generate interface with all our fields
    this.generateInterfaceWithFields(typeName, collectionName, finalFields);
  }
  
  /**
   * Enhance field list with relationship fields that may not be present in the schema
   * but are defined in relations. This is especially important for custom fields
   * in system collections when includeSystemFields=false.
   * 
   * This method works together with getCustomFieldsForCollection to ensure all
   * custom fields are included in system collections by analyzing relations data.
   */
  private enhanceWithRelationFields(baseFields: DirectusField[], collectionName: string): DirectusField[] {
    // For system collections, check for missing fields that are defined in relations
    if (collectionName.startsWith("directus_")) {
      const existingFieldNames = new Set(baseFields.map(f => f.field));
      const syntheticFields: DirectusField[] = [];
      
      // Analyze schema relations to find fields for this system collection
      if (this.snapshot.data.relations) {
        for (const relation of this.snapshot.data.relations) {
          // Look for relations where this collection is the related_collection
          // and there's a one_field defined (typically for m2m relationships)
          if (relation.related_collection === collectionName && 
              relation.meta?.one_field && 
              !existingFieldNames.has(relation.meta.one_field)) {
            
            // Create a synthetic field for this relationship
            syntheticFields.push({
              collection: collectionName,
              field: relation.meta.one_field,
              type: "alias",
              meta: {
                collection: collectionName,
                field: relation.meta.one_field,
                hidden: false,
                interface: "list-m2m",
                special: ["m2m"],
                system: false,
                junction_collection: relation.collection,
                junction_field: relation.meta.junction_field
              },
              schema: {
                name: relation.meta.one_field,
                table: collectionName,
                data_type: "alias",
                default_value: null,
                max_length: null,
                numeric_precision: null,
                numeric_scale: null,
                is_nullable: true,
                is_unique: false,
                is_primary_key: false,
                has_auto_increment: false,
                foreign_key_table: null,
                foreign_key_column: null
              }
            });
            
            existingFieldNames.add(relation.meta.one_field);
          }
          
          // Check for many-to-one or one-to-one relations targeting this collection
          if (relation.collection === collectionName && 
              relation.related_collection &&
              !relation.meta.one_field && // Not a one-to-many or many-to-many
              !relation.meta.junction_field && // Not a junction
              !existingFieldNames.has(relation.field)) {
            
            // Create a synthetic field for this relationship
            syntheticFields.push({
              collection: collectionName,
              field: relation.field,
              type: "alias",
              meta: {
                collection: collectionName,
                field: relation.field,
                hidden: false,
                interface: "many-to-one",
                special: ["m2o"],
                system: false
              },
              schema: {
                name: relation.field,
                table: collectionName,
                data_type: "alias",
                default_value: null,
                max_length: null,
                numeric_precision: null,
                numeric_scale: null,
                is_nullable: true,
                is_unique: false,
                is_primary_key: false,
                has_auto_increment: false,
                foreign_key_table: relation.related_collection,
                foreign_key_column: "id"
              }
            });
            
            existingFieldNames.add(relation.field);
          }
        }
      }
      
      return [...baseFields, ...syntheticFields];
    }
    
    // For non-system collections, just return the base fields
    return baseFields;
  }

  /**
   * Generate interface for a regular collection
   */
  private generateCollectionInterface(collection: DirectusCollection): void {
    const collectionName = collection.collection;
    const typeName = this.getTypeNameForCollection(collectionName);
    
    // Get all fields for this collection
    const fields = this.getAllFieldsForCollection(collectionName);
    
    // Generate interface with these fields
    this.generateInterfaceWithFields(typeName, collectionName, fields);
  }

  /**
   * Generate an interface with the given fields
   */
  private generateInterfaceWithFields(
    typeName: string, 
    collectionName: string, 
    fields: DirectusField[]
  ): void {
    const lines: string[] = [
      `export ${this.options.useTypes ? "type" : "interface"} ${typeName} ${this.options.useTypes ? "= " : ""}{`
    ];
    
    // Start with ID field - all collections have an ID
    const idType = this.collectionIdTypes.get(collectionName) || "string";
    lines.push(`  id: ${idType};`);
    
    // Special handling for junction collections (including m2m and m2a)
    const isJunctionTable = 
      // Check if this is a junction table by looking for junction_field in relations
      this.snapshot.data.relations?.some(rel => 
        rel.collection === collectionName && 
        rel.meta.junction_field !== null
      ) ||
      // Check for many-to-any relationship
      this.snapshot.data.relations?.some(rel => 
        rel.collection === collectionName && 
        rel.field === "item" && 
        !rel.related_collection && 
        rel.meta.one_collection_field === "collection"
      );
    
    // Process each field
    for (const field of fields) {
      // Skip the id field as we already added it
      if (field.field === "id") continue;
      
      // Skip UI presentation components and internal fields that aren't relevant for API usage
      const isUIComponent = 
        // Fields with type "alias" and special includes "no-data" (but not m2m)
        (field.type === "alias" && 
         field.meta.special && 
         field.meta.special.includes("no-data") && 
         !field.meta.special.includes("m2m")) ||
        // Fields with presentation or group interfaces
        (field.meta.interface && 
         (field.meta.interface.startsWith("presentation-") || 
          field.meta.interface.startsWith("group-")));
      
      if (isUIComponent) {
        continue;
      }
      
      // For junction tables, we want to include all fields, even if hidden
      const shouldSkipHidden = 
        field.meta.hidden && 
        !isJunctionTable && 
        !(this.options.includeSystemFields && collectionName.startsWith("directus_"));
      
      if (shouldSkipHidden) {
        continue;
      }
      
      // Add JSDoc for field notes if enabled
      if (this.options.addTypedocNotes && field.meta.note) {
        lines.push(`  /** ${field.meta.note} */`);
      }
      
      // Generate field definition
      const fieldType = this.getTypeForField(field);
      const isOptional = !this.options.makeRequired && field.schema.is_nullable;
      lines.push(`  ${field.field}${isOptional ? "?" : ""}: ${fieldType};`);
    }
    
    lines.push(`}`);
    
    // Add the type definition
    this.addTypeDefinition(typeName, lines);
  }

  /**
   * Get the TypeScript type for a field
   */
  private getTypeForField(field: DirectusField): string {
    // Check for relationships first
    const relationship = this.getRelationshipForField(field.collection, field.field);
    if (relationship) {
      return this.getTypeForRelationship(relationship, field);
    }
    
    // Handle special field types
    if (field.meta.special) {
      // Handle M2M fields marked with special "m2m"
      if (Array.isArray(field.meta.special) && field.meta.special.includes("m2m")) {
        // First, check if the field has junction information from enhanceWithRelationFields
        if (field.meta.junction_collection && typeof field.meta.junction_collection === 'string') {
          const junctionTypeName = this.getTypeNameForCollection(field.meta.junction_collection as string);
          return `string[] | ${junctionTypeName}[]`;
        }
        
        // Next try to find the junction collection in relations
        if (this.snapshot.data.relations) {
          // Strategy 1: Find relations where this is the related collection's one_field
          for (const relation of this.snapshot.data.relations) {
            if (relation.related_collection === field.collection && 
                relation.meta.one_field === field.field) {
              // Found the junction table
              const junctionTable = relation.collection;
              const junctionTypeName = this.getTypeNameForCollection(junctionTable);
              return `string[] | ${junctionTypeName}[]`;
            }
          }
          
          // Strategy 2: For as_staff and similar fields, look at all relations
          // to find the junction table
          if (field.field.startsWith("as_")) {
            // Extract the base name (e.g., "staff" from "as_staff")
            const baseName = field.field.substring(3);
            
            // Look for junction tables related to this pattern
            for (const relation of this.snapshot.data.relations) {
              // Look for junction tables with names that match the pattern
              // Common pattern: "event_staff" for "as_staff"
              const relationTable = relation.collection.toLowerCase();
              if (relationTable.includes(baseName.toLowerCase())) {
                // Check if this is a junction table (has junction_field)
                if (relation.meta.junction_field) {
                  const junctionTypeName = this.getTypeNameForCollection(relation.collection);
                  return `string[] | ${junctionTypeName}[]`;
                }
              }
            }
          }
        }
        
        // If no junction found in relations, try to infer from field name patterns
        const fieldName = field.field;
        let relationshipName = fieldName;
        if (fieldName.startsWith("as_")) {
          relationshipName = fieldName.substring(3);
        }
        
        // Look for collections that might be junction tables
        const collectionNames = this.snapshot.data.collections?.map(c => c.collection) || [];
        const possibleJunctions = collectionNames.filter(name => {
          // Common patterns: event_staff, staff_events, etc.
          const lowerName = name.toLowerCase();
          const lowerRelationship = relationshipName.toLowerCase();
          const lowerCollectionBase = field.collection.replace('directus_', '').toLowerCase();
          
          return lowerName.includes(lowerRelationship) || 
                 lowerName.includes(lowerCollectionBase) ||
                 // For "as_staff" the junction might be "event_staff"
                 (fieldName.startsWith("as_") && lowerName.includes(`event_${lowerRelationship}`));
        });
        
        if (possibleJunctions.length > 0) {
          const junctionTable = possibleJunctions[0];
          const junctionTypeName = this.getTypeNameForCollection(junctionTable);
          return `string[] | ${junctionTypeName}[]`;
        }
        
        // Default to string array if we can't determine the junction
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
        return "string"; // or 'datetime' for Directus SDK compatibility
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
      default:
        // Default to string for unknown types
        return "string";
    }
  }

  /**
   * Get the type for a relationship field
   */
  private getTypeForRelationship(
    relationship: { 
      type: RelationshipType; 
      relatedCollection: string;
      relatedType: string;
    },
    field: DirectusField
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
    const relatedIdType = this.getIdTypeForCollection(relationship.relatedCollection);
    
    // Return different types based on relationship type and useTypeReferences option
    switch (relationship.type) {
      case RelationshipType.OneToMany:
      case RelationshipType.ManyToMany:
        // For array relationships
        return this.options.useTypeReferences 
          ? `${relatedIdType}[] | ${relatedTypeName}[]`
          : `${relatedTypeName}[]`;
        
      case RelationshipType.ManyToOne:
      case RelationshipType.OneToOne:
        // For object relationships
        return this.options.useTypeReferences 
          ? `${relatedIdType} | ${relatedTypeName}`
          : relatedTypeName;
        
      default:
        // Default for unknown relationship types
        return "unknown";
    }
  }

  /**
   * Get a relationship definition for a field if it exists
   */
  private getRelationshipForField(collectionName: string, fieldName: string) {
    return this.relationships.get(collectionName)?.get(fieldName);
  }

  /**
   * Generate the root interface containing all collections
   */
  private generateRootInterface(): void {
    if (!this.snapshot.data.collections || this.snapshot.data.collections.length === 0) {
      return;
    }
    
    const lines: string[] = [
      `export ${this.options.useTypes ? "type" : "interface"} ${this.options.typeName} ${this.options.useTypes ? "= " : ""}{`
    ];
    
    // Add non-system collections
    const regularCollections = this.snapshot.data.collections.filter(
      c => !c.collection.startsWith("directus_")
    );
    
    for (const collection of regularCollections) {
      // Get the type name for this collection
      const typeName = this.getTypeNameForCollection(collection.collection);
      
      // Check if this is a singleton collection
      const isSingleton = collection.meta.singleton === true;
      
      // Add to the root interface - singletons are not arrays
      lines.push(`  ${collection.collection}: ${typeName}${isSingleton ? "" : "[]"};`);
    }
    
    // Close the interface
    lines.push(`}`);
    
    // Add the root interface to our type definitions
    this.addTypeDefinition(this.options.typeName, lines);
  }
  
  /**
   * Add system collections to the root interface
   */
  private addSystemCollectionsToRoot(): void {
    // Check if we have the root interface
    if (!this.typeDefinitions.has(this.options.typeName)) {
      return;
    }
    
    // Get the current content of the root interface
    const currentContent = this.typeDefinitions.get(this.options.typeName)!.content;
    
    // Get the system type definitions
    const systemTypes = Array.from(this.typeDefinitions.keys())
      .filter(name => name.startsWith("Directus"));
    
    if (systemTypes.length === 0) {
      return;
    }
    
    // Parse the current content to insert system collections
    const lines = currentContent.split("\n");
    const closingBraceIndex = lines.findIndex(line => line.trim() === "}");
    
    if (closingBraceIndex === -1) {
      return;
    }
    
    // Make sure we have a fresh slate of lines
    const updatedLines = [...lines.slice(0, closingBraceIndex)];
    
    // Add system collections
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
      updatedLines.push(`  ${collectionName}: ${typeName}[];`);
    }
    
    // Add closing brace and rest of the content
    updatedLines.push(lines[closingBraceIndex]);
    updatedLines.push(...lines.slice(closingBraceIndex + 1));
    
    // Update the type definition
    this.typeDefinitions.set(
      this.options.typeName, 
      {
        content: updatedLines.join("\n"),
        properties: []
      }
    );
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
   * Generate minimal interfaces for system collections referenced in relations
   */
  private generateReferencedSystemCollections(): void {
    // Find all system collections referenced in relations
    const referencedSystemCollections = new Set<string>();
    
    if (this.snapshot.data.relations) {
      for (const relation of this.snapshot.data.relations) {
        // Check if this is a relation to a system collection
        if (relation.related_collection?.startsWith('directus_')) {
          referencedSystemCollections.add(relation.related_collection);
        }
      }
    }
    
    // Generate minimal interfaces for referenced system collections
    for (const collectionName of referencedSystemCollections) {
      const typeName = this.getTypeNameForCollection(collectionName);
      
      // Skip if already defined
      if (this.typeDefinitions.has(typeName)) continue;
      
      // Determine the ID type for this collection
      const idType = this.getIdTypeForCollection(collectionName);
      
      if (this.options.includeSystemFields) {
        // If includeSystemFields is true and we have system fields defined,
        // generate a more complete interface from SYSTEM_FIELDS
        this.generateSystemCollectionFromTemplate(collectionName, typeName, idType);
      } else {
        // Otherwise, generate a minimal interface with just the ID
        const lines = [
          `export ${this.options.useTypes ? "type" : "interface"} ${typeName} ${this.options.useTypes ? "= " : ""}{`,
          `  id: ${idType};`,
          `}`
        ];
        
        this.addTypeDefinition(typeName, lines);
      }
    }
  }
  
  /**
   * Generate system collection interface from predefined fields template
   */
  private generateSystemCollectionFromTemplate(
    collectionName: string, 
    typeName: string, 
    idType: "string" | "number"
  ): void {
    // Start with the basic interface
    const lines = [
      `export ${this.options.useTypes ? "type" : "interface"} ${typeName} ${this.options.useTypes ? "= " : ""}{`,
      `  id: ${idType};`
    ];
    
    // Use SYSTEM_FIELDS to populate the interface
    
    // Check if this collection exists in SYSTEM_FIELDS
    if (collectionName in SYSTEM_FIELDS) {
      // Add each system field (skip 'id' since we already added it)
      const fields = SYSTEM_FIELDS[collectionName as keyof typeof SYSTEM_FIELDS] as readonly string[];
      
      for (const field of fields) {
        if (field === 'id') continue;
        
        // Map common field names to appropriate types
        const fieldType = this.getSystemFieldType(field);
        lines.push(`  ${field}: ${fieldType};`);
      }
    }
    
    // Close the interface
    lines.push('}');
    
    // Add the type definition
    this.addTypeDefinition(typeName, lines);
  }
  
  /**
   * Get the appropriate TypeScript type for a system field
   */
  private getSystemFieldType(fieldName: string): string {
    // Map common field names to appropriate types
    switch (fieldName) {
      // String fields
      case 'name':
      case 'first_name':
      case 'last_name':
      case 'email':
      case 'title':
      case 'description':
      case 'icon':
      case 'note':
      case 'type':
      case 'filename_disk':
      case 'filename_download':
      case 'charset':
      case 'status':
      case 'role':
      case 'token':
      case 'provider':
      case 'external_identifier':
        return 'string';
      
      // Number fields
      case 'width':
      case 'height':
      case 'duration':
      case 'filesize':
      case 'sort':
        return 'number';
      
      // Boolean fields
      case 'admin_access':
      case 'app_access':
      case 'email_notifications':
      case 'tfa_secret':
        return 'boolean';
      
      // Date fields
      case 'last_access':
      case 'last_page':
      case 'uploaded_on':
      case 'modified_on':
      case 'created_on':
      case 'date_created':
      case 'date_updated':
        return 'string';
      
      // Object fields
      case 'auth_data':
      case 'appearance':
      case 'theme_dark':
      case 'theme_light':
      case 'theme_light_overrides':
      case 'theme_dark_overrides':
      case 'tags':
      case 'metadata':
      case 'options':
      case 'translations':
        return 'Record<string, any>';
      
      // Relation fields
      case 'avatar':
      case 'folder':
      case 'uploaded_by':
      case 'modified_by':
      case 'user_created':
      case 'user_updated':
      case 'parent':
        return 'string';
      
      // Array fields
      case 'children':
      case 'users':
      case 'policies':
        return 'string[]';
      
      // Default for unknown fields
      default:
        return 'any';
    }
  }
  
  /**
   * Build the final TypeScript output
   */
  private buildOutput(): string {
    // First generate interfaces for referenced system collections
    this.generateReferencedSystemCollections();
    
    // Generate the ApiCollections interface
    this.generateRootInterface();
    
    // If includeSystemFields is true, update the ApiCollections interface to include system collections
    if (this.options.includeSystemFields) {
      this.addSystemCollectionsToRoot();
    }
    
    const output: string[] = [];
    
    // Add comment header
    output.push("/**");
    output.push(" * Generated TypeScript types for Directus Schema");
    output.push(" * Generated on: " + new Date().toISOString());
    output.push(" */\n");
    
    // Add all type definitions in order:
    // 1. Regular collection types
    const regularTypes = Array.from(this.typeDefinitions.keys())
      .filter(name => !name.startsWith("Directus") && name !== this.options.typeName);
    
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
    if (this.typeDefinitions.has(this.options.typeName)) {
      output.push(this.typeDefinitions.get(this.options.typeName)!.content);
    }
    
    return output.join("");
  }

  /**
   * Get the collection name to type name mapping
   */
  private getTypeNameForCollection(collectionName: string): string {
    // Check if we already have mapped this collection
    if (this.collectionTypes.has(collectionName)) {
      return this.collectionTypes.get(collectionName)!;
    }
    
    // For system collections, use standardized names
    if (collectionName.startsWith("directus_")) {
      const baseName = collectionName.replace(/^directus_/, "");
      
      // Map common system collections
      const systemNameMap: Record<string, string> = {
        "users": "DirectusUser",
        "files": "DirectusFile",
        "folders": "DirectusFolder",
        "roles": "DirectusRole",
        "permissions": "DirectusPermission",
        "presets": "DirectusPreset",
        "fields": "DirectusField",
        "collections": "DirectusCollection",
        "relations": "DirectusRelation",
        "revisions": "DirectusRevision",
        "webhooks": "DirectusWebhook",
        "operations": "DirectusOperation",
        "flows": "DirectusFlow",
        "activity": "DirectusActivity",
        "settings": "DirectusSetting"
      };
      
      if (baseName in systemNameMap) {
        const typeName = systemNameMap[baseName];
        this.collectionTypes.set(collectionName, typeName);
        return typeName;
      }
      
      // For other system collections, generate a name
      // Check if it's a singleton
      const isSingletonCollection = this.isSingleton(collectionName);
      const pascalName = toPascalCase(baseName);
      const typeName = "Directus" + (isSingletonCollection ? pascalName : this.makeSingular(pascalName));
      this.collectionTypes.set(collectionName, typeName);
      return typeName;
    }
    
    // For regular collections, convert to PascalCase singular (unless it's a singleton)
    const isSingletonCollection = this.isSingleton(collectionName);
    const pascalName = toPascalCase(collectionName);
    const typeName = isSingletonCollection ? pascalName : this.makeSingular(pascalName);
    this.collectionTypes.set(collectionName, typeName);
    return typeName;
  }

  /**
   * Convert plural to singular (basic rules)
   */
  private makeSingular(name: string): string {
    // Handle common plural endings
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
   * Get the ID type for a collection
   */
  private getIdTypeForCollection(collectionName: string): "string" | "number" {
    // Check if we've already determined the ID type
    if (this.collectionIdTypes.has(collectionName)) {
      return this.collectionIdTypes.get(collectionName)!;
    }
    
    // System collections with number IDs
    if (collectionName.startsWith("directus_") && 
        this.numberIdCollections.has(collectionName)) {
      return "number";
    }
    
    // If we have fields data, check the actual ID field
    if (this.snapshot.data.fields) {
      const idField = this.snapshot.data.fields.find(
        field => field.collection === collectionName && field.field === "id"
      );
      
      if (idField) {
        if (
          idField.type === "integer" || 
          idField.type === "number" || 
          idField.schema.data_type === "integer" ||
          idField.schema.data_type === "number"
        ) {
          return "number";
        }
      }
    }
    
    // Default to string for UUIDs and other string IDs
    return "string";
  }

  /**
   * Get all fields for a collection
   */
  private getAllFieldsForCollection(collectionName: string): DirectusField[] {
    if (!this.snapshot.data.fields) return [];
    
    return this.snapshot.data.fields.filter(
      field => field.collection === collectionName
    );
  }

  /**
   * Get custom fields for a system collection
   * 
   * For system collections, we get any field that:
   * 1. Is explicitly marked as not a system field (meta.system === false)
   * 2. Is not in the SYSTEM_FIELDS constant
   * 3. Has special attributes that indicate it's a relationship
   * 
   * For regular collections, we return all fields.
   */
  private getCustomFieldsForCollection(collectionName: string): DirectusField[] {
    if (!this.snapshot.data.fields) return [];
    
    // For non-system collections, return all fields
    if (!collectionName.startsWith("directus_")) {
      return this.snapshot.data.fields.filter(
        field => field.collection === collectionName
      );
    }
    
    // For system collections, we need to identify custom fields
    
    // Step 1: Get the list of system fields for this collection
    let systemFieldNames: string[] = [];
    if (Object.prototype.hasOwnProperty.call(SYSTEM_FIELDS, collectionName)) {
      const systemFieldsKey = collectionName as keyof typeof SYSTEM_FIELDS;
      systemFieldNames = [...SYSTEM_FIELDS[systemFieldsKey]];
    }
    
    // Create a case-insensitive set for better matching
    const systemFieldSet = new Set(systemFieldNames.map(f => f.toLowerCase()));
    
    // Step 2: Get all fields for this collection from the schema
    const allFields = this.snapshot.data.fields?.filter(
      field => field.collection === collectionName
    ) || [];
    
    // Step 3: Filter to find custom fields using multiple criteria
    const customFields = allFields.filter(field => {
      // Skip id field - we'll always add it
      if (field.field === 'id') return false;
      
      // Include if field is explicitly marked as not a system field
      if (field.meta.system === false) return true;
      
      // Include if field is not in the system fields list
      if (!systemFieldSet.has(field.field.toLowerCase())) return true;
      
      // Include if field has relationship attributes
      if (field.meta.special) {
        // Handle array or string special values
        const specialValues = Array.isArray(field.meta.special) 
          ? field.meta.special 
          : [field.meta.special];
          
        // Check for relationship specials
        for (const special of specialValues) {
          if (special === "m2m" || special === "o2m" || special === "m2o" || 
              special === "file" || special === "files" || special === "m2a") {
            return true;
          }
        }
      }
      
      // Include if field has a relationship interface
      if (field.meta.interface && (
        field.meta.interface.includes("m2m") || 
        field.meta.interface.includes("many-to-many") ||
        field.meta.interface.includes("one-to-many") ||
        field.meta.interface.includes("many-to-one") ||
        field.meta.interface.includes("relationship") ||
        field.meta.interface.includes("file") ||
        field.meta.interface.includes("user")
      )) return true;
      
      return false;
    });
    
    // Step 4: Look for fields that might be defined in relations but not in fields
    const syntheticFields: DirectusField[] = [];
    const customFieldNames = new Set(customFields.map(f => f.field));
    
    // Find all relations that target this collection
    if (this.snapshot.data.relations) {
      for (const relation of this.snapshot.data.relations) {
        // Check for fields targeting this collection via one_field
        if (relation.related_collection === collectionName && 
            relation.meta?.one_field && 
            !customFieldNames.has(relation.meta.one_field)) {
          
          // Get junction table info for better typing
          const junctionTable = relation.collection;
          const junctionField = relation.meta.junction_field;
          
          // Create a synthetic field for this relationship
          const syntheticField: DirectusField = {
            collection: collectionName,
            field: relation.meta.one_field,
            type: "alias",
            meta: {
              collection: collectionName,
              field: relation.meta.one_field,
              hidden: false,
              interface: "list-m2m",
              special: ["m2m"],
              system: false,
              junction_collection: junctionTable,
              junction_field: junctionField
            },
            schema: {
              name: relation.meta.one_field,
              table: collectionName,
              data_type: "alias",
              default_value: null,
              max_length: null,
              numeric_precision: null,
              numeric_scale: null,
              is_nullable: true,
              is_unique: false,
              is_primary_key: false,
              has_auto_increment: false,
              foreign_key_table: null,
              foreign_key_column: null
            }
          };
          
          syntheticFields.push(syntheticField);
          customFieldNames.add(relation.meta.one_field);
        }
        
        // Check for many-to-one or one-to-one relations targeting this collection
        if (relation.collection === collectionName && 
            relation.related_collection &&
            !relation.meta.one_field && // Not a one-to-many or many-to-many
            !relation.meta.junction_field && // Not a junction
            !customFieldNames.has(relation.field)) {
          
          // Create a synthetic field for this relationship
          const syntheticField: DirectusField = {
            collection: collectionName,
            field: relation.field,
            type: "alias",
            meta: {
              collection: collectionName,
              field: relation.field,
              hidden: false,
              interface: "many-to-one",
              special: ["m2o"],
              system: false
            },
            schema: {
              name: relation.field,
              table: collectionName,
              data_type: "alias",
              default_value: null,
              max_length: null,
              numeric_precision: null,
              numeric_scale: null,
              is_nullable: true,
              is_unique: false,
              is_primary_key: false,
              has_auto_increment: false,
              foreign_key_table: relation.related_collection,
              foreign_key_column: "id"
            }
          };
          
          syntheticFields.push(syntheticField);
          customFieldNames.add(relation.field);
        }
      }
    }
    
    // Return all custom fields (detected + synthetic)
    return [...customFields, ...syntheticFields];
  }
}