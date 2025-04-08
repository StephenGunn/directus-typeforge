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
   * Generate interface for a system collection
   */
  private generateSystemCollectionInterface(collection: DirectusCollection): void {
    const collectionName = collection.collection;
    const typeName = this.getTypeNameForCollection(collectionName);
    const idType = this.collectionIdTypes.get(collectionName) || "string";
    
    // Determine if we include system fields
    if (!this.options.includeSystemFields) {
      // Only include custom fields for system collections
      const customFields = this.getCustomFieldsForCollection(collectionName);
      
      // If there are no custom fields and we don't need to include system fields,
      // just create a minimal interface with only ID
      if (customFields.length === 0) {
        this.addTypeDefinition(typeName, [
          `export ${this.options.useTypes ? "type" : "interface"} ${typeName} ${this.options.useTypes ? "= " : ""}{`,
          `  id: ${idType};`,
          `}`
        ]);
        return;
      }
      
      // Generate interface with custom fields
      this.generateInterfaceWithFields(typeName, collectionName, customFields);
    } else {
      // Include all fields for system collections
      const allFields = this.getAllFieldsForCollection(collectionName);
      this.generateInterfaceWithFields(typeName, collectionName, allFields);
    }
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
        // Fields with type "alias" and special includes "no-data"
        (field.type === "alias" && field.meta.special && field.meta.special.includes("no-data")) ||
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
          field.meta.special.includes("timestamp") ||
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
   * Get only custom fields for a system collection
   */
  private getCustomFieldsForCollection(collectionName: string): DirectusField[] {
    if (!this.snapshot.data.fields) return [];
    
    // Get fields for this collection
    const allFields = this.snapshot.data.fields.filter(
      field => field.collection === collectionName
    );
    
    // Filter out system fields for system collections
    if (collectionName.startsWith("directus_")) {
      // Get the system fields for this collection if available
      let systemFields: readonly string[] = [];
      
      // Check if collection exists in SYSTEM_FIELDS
      if (Object.prototype.hasOwnProperty.call(SYSTEM_FIELDS, collectionName)) {
        const systemFieldsKey = collectionName as keyof typeof SYSTEM_FIELDS;
        systemFields = SYSTEM_FIELDS[systemFieldsKey];
      }
      
      // Keep only fields that are not in the system fields list
      return allFields.filter(
        field => !systemFields.includes(field.field as string)
      );
    }
    
    // For non-system collections, return all fields
    return allFields;
  }
}