import { 
  GenerateTypeScriptOptions, 
  DirectusSchemaSnapshot, 
  DirectusCollection, 
  DirectusField, 
  RelationshipType 
} from "../types";
import { TypeTracker } from "./TypeTracker";
import { TypeNameManager } from "./TypeNameManager";
import { PropertyGenerator } from "./PropertyGenerator";
import { SystemCollectionManager } from "./SystemCollectionManager";
import { InterfaceGenerator } from "./InterfaceGenerator";
import { RelationshipTracker } from "./RelationshipTracker";
import { SystemFieldDetector } from "./SystemFieldDetector";

/**
 * Processes Directus schema snapshots and generates TypeScript interfaces
 */
export class SchemaSnapshotProcessor {
  private snapshot: DirectusSchemaSnapshot;
  private typeTracker: TypeTracker;
  private typeNameManager: TypeNameManager;
  private relationshipTracker: RelationshipTracker;
  private propertyGenerator: PropertyGenerator;
  private systemCollectionManager: SystemCollectionManager;
  private interfaceGenerator: InterfaceGenerator;
  private options: {
    typeName: string;
    useTypeReferences: boolean;
    useTypes: boolean;
    makeRequired: boolean;
    includeSystemFields: boolean;
    addTypedocNotes: boolean;
  };
  
  // Map of collection names to fields with notes for JSDoc
  private fieldNotes: Map<string, Map<string, string>> = new Map();

  constructor(
    snapshot: DirectusSchemaSnapshot, 
    options: GenerateTypeScriptOptions,
    private systemFieldDetector?: SystemFieldDetector
  ) {
    this.snapshot = snapshot;
    this.typeTracker = new TypeTracker();
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
      useTypes: options.useTypes ?? false,
      makeRequired: options.makeRequired ?? false,
      includeSystemFields: options.includeSystemFields ?? false,
      addTypedocNotes: options.addTypedocNotes ?? false,
    };

    // Initialize the relationship tracker
    this.relationshipTracker = new RelationshipTracker();

    // Initialize the type name manager
    this.typeNameManager = new TypeNameManager();

    // Initialize the property generator with makeRequired option
    this.propertyGenerator = new PropertyGenerator(
      this.typeNameManager,
      this.options.useTypeReferences,
      this.options.makeRequired,
    );

    // Initialize the system collection manager
    this.systemCollectionManager = new SystemCollectionManager(
      this.typeTracker,
      this.typeNameManager,
      {
        useTypes: this.options.useTypes,
        includeSystemFields: this.options.includeSystemFields,
      },
      this.systemFieldDetector
    );

    // Initialize the interface generator
    this.interfaceGenerator = new InterfaceGenerator(
      this.typeTracker,
      this.propertyGenerator,
      this.typeNameManager,
      this.systemCollectionManager,
      {
        typeName: this.options.typeName,
        useTypes: this.options.useTypes,
      },
    );
    
    // Extract field notes if enabled
    if (this.options.addTypedocNotes) {
      this.extractFieldNotes();
    }
  }

  /**
   * Extracts notes from fields for JSDoc comments
   */
  private extractFieldNotes(): void {
    if (!this.snapshot.data.fields) return;
    
    for (const field of this.snapshot.data.fields) {
      if (field.meta.note) {
        // Create collection map if it doesn't exist
        if (!this.fieldNotes.has(field.collection)) {
          this.fieldNotes.set(field.collection, new Map<string, string>());
        }
        
        // Add note to the collection's field notes
        this.fieldNotes.get(field.collection)!.set(field.field, field.meta.note);
      }
    }
  }
  
  /**
   * Gets a note for a field if available
   */
  public getFieldNote(collectionName: string, fieldName: string): string | undefined {
    return this.fieldNotes.get(collectionName)?.get(fieldName);
  }

  /**
   * Processes the schema snapshot and generates TypeScript definitions
   */
  processSchema(): string {
    // First register all collections
    this.registerCollections();
    
    // Register all relations
    this.registerRelations();
    
    // Generate interfaces for all collections
    this.generateInterfaces();
    
    // Generate the final type definitions
    return this.generateTypeDefinitions();
  }

  /**
   * Registers all collections from the snapshot
   */
  private registerCollections(): void {
    if (!this.snapshot.data.collections) return;
    
    // First register all collections in the type name manager
    for (const collection of this.snapshot.data.collections) {
      this.typeNameManager.registerCollection(collection.collection);
      
      // Register singleton collections specifically
      if (collection.meta.singleton === true) {
        this.typeNameManager.registerSingleton(collection.collection);
      }
      
      // Determine the ID type for this collection
      const idType = this.getCollectionIdType(collection.collection);
      this.relationshipTracker.registerCollection(collection.collection, idType);
    }
  }
  
  /**
   * Determines the ID type for a collection
   */
  private getCollectionIdType(collectionName: string): "string" | "number" {
    if (!this.snapshot.data.fields) return "string";
    
    // Find the ID field for this collection
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
    
    // Default to string for UUID, etc.
    return "string";
  }

  /**
   * Registers all relationships from the snapshot
   */
  private registerRelations(): void {
    if (!this.snapshot.data.relations) return;
    
    for (const relation of this.snapshot.data.relations) {
      if (relation.related_collection) {
        // Register the relation in the type name manager
        this.typeNameManager.registerRelation(
          relation.collection, 
          relation.field,
          relation.related_collection
        );
        
        // Register the relationship in the relationship tracker
        const isToMany = !!relation.meta.junction_field || 
          (relation.meta.one_field && Array.isArray(relation.meta.one_field));
          
        // Determine the relationship type
        let relationshipType = RelationshipType.ManyToOne; // Default
        
        if (relation.meta.junction_field) {
          relationshipType = RelationshipType.ManyToMany;
        } else if (isToMany) {
          relationshipType = RelationshipType.OneToMany;
        } else if (relation.field === 'item' && relation.collection.includes('_related_')) {
          relationshipType = RelationshipType.ManyToAny;
        }
        
        // Register the relationship
        this.relationshipTracker.registerRelationship(
          relation.collection,
          relation.field,
          relation.related_collection || '',
          relationshipType
        );
      }
    }
  }

  /**
   * Generates interfaces for all collections
   */
  private generateInterfaces(): void {
    if (!this.snapshot.data.collections) return;
    
    // Process each collection
    for (const collection of this.snapshot.data.collections) {
      // Skip collections that are already processed
      const typeName = this.typeNameManager.getTypeNameForCollection(collection.collection);
      const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
      
      if (this.typeNameManager.hasProcessedType(cleanTypeName)) continue;
      
      this.typeNameManager.addProcessedType(cleanTypeName);
      
      // Check if this is a system collection
      const isSystemCollection = collection.collection.startsWith("directus_");
      
      if (isSystemCollection) {
        // Generate system collection interface using only custom fields
        this.generateSystemCollectionInterface();
      } else {
        // Generate regular collection interface
        this.generateCollectionInterface(collection);
      }
    }
  }
  
  /**
   * Generates a system collection interface
   */
  private generateSystemCollectionInterface(): void {
    // Generate essential system collections
    this.systemCollectionManager.generateEssentialSystemCollections();
  }
  
  /**
   * Generates a regular collection interface
   */
  private generateCollectionInterface(collection: DirectusCollection): void {
    if (!this.snapshot.data.fields) return;
    
    const collectionName = collection.collection;
    const typeName = this.typeNameManager.getTypeNameForCollection(collectionName);
    const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
    
    // Determine ID type
    const idType = this.getCollectionIdType(collectionName);
    
    // Use the appropriate keyword based on options
    const keyword = this.options.useTypes ? "type" : "interface";
    
    // Start generating the interface
    let interfaceStr = `export ${keyword} ${cleanTypeName} ${this.options.useTypes ? "= " : ""}{
  id: ${idType};\n`;
    
    // Track properties for the type tracker
    const properties: string[] = ["id"];
    
    // Get fields for this collection
    const fields = this.snapshot.data.fields.filter(
      field => field.collection === collectionName && field.field !== "id"
    );
    
    // Add each field to the interface
    for (const field of fields) {
      // Skip hidden fields unless they're system fields and we're including them
      if (field.meta.hidden && !(this.options.includeSystemFields && field.collection.startsWith("directus_"))) {
        continue;
      }
      
      // Add the field to the properties list
      properties.push(field.field);
      
      // Add JSDoc if notes are enabled and available
      const note = this.getFieldNote(collectionName, field.field);
      if (note) {
        interfaceStr += `  /** ${note} */\n`;
      }
      
      // Generate the type for this field
      const fieldType = this.getFieldType(field);
      const isOptional = !this.options.makeRequired && field.schema.is_nullable;
      
      // Add the field to the interface
      interfaceStr += `  ${field.field}${isOptional ? "?" : ""}: ${fieldType};\n`;
    }
    
    // Close the interface
    interfaceStr += "}\n\n";
    
    // Add the interface to the type tracker
    this.typeTracker.addType(cleanTypeName, interfaceStr, properties);
  }
  
  /**
   * Gets the TypeScript type for a field
   */
  private getFieldType(field: DirectusField): string {
    // Check for relations
    if (field.schema.foreign_key_table) {
      const relatedCollection = field.schema.foreign_key_table;
      const typeName = this.typeNameManager.getTypeNameForCollection(relatedCollection);
      const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
      
      // Check if this is a to-many relationship
      const relation = this.snapshot.data.relations?.find(
        rel => rel.collection === field.collection && rel.field === field.field
      );
      
      const isToMany = relation?.meta.junction_field || 
        (relation?.meta.one_field && Array.isArray(relation.meta.one_field));
      
      if (isToMany) {
        // Handle arrays/to-many relations
        return this.options.useTypeReferences
          ? `${field.schema.data_type === "string" ? "string" : "number"}[] | ${cleanTypeName}[]`
          : `${cleanTypeName}[]`;
      } else {
        // Handle scalar/to-one relations
        return this.options.useTypeReferences
          ? `${field.schema.data_type === "string" ? "string" : "number"} | ${cleanTypeName}`
          : cleanTypeName;
      }
    }
    
    // Handle special field types
    if (field.meta.special) {
      // Check for JSON
      if (field.meta.special.includes("cast-json")) {
        return "any"; // or "Record<string, any>" or "unknown"
      }
      
      // Check for date/time
      if (field.meta.special.includes("date-created") || 
          field.meta.special.includes("date-updated") ||
          field.meta.special.includes("timestamp")) {
        return "string"; // or "Date" if preferred
      }
      
      // Check for many-to-any fields
      if (field.meta.special.includes("m2a")) {
        return "any[]"; // Will need more refinement for specific M2A handling
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
      case "number":
      case "decimal":
        return "number";
      case "boolean":
        return "boolean";
      case "json":
        return "any"; // or "Record<string, any>" or "unknown"
      case "csv":
        return "string";
      case "dateTime":
      case "date":
      case "time":
      case "timestamp":
        return "string"; // or "Date" if preferred
      default:
        return "unknown";
    }
  }
  
  /**
   * Generates the final TypeScript definitions
   */
  private generateTypeDefinitions(): string {
    let source = "";
    
    // Add all individual interfaces
    for (const typeName of this.typeTracker.getAllTypeNames()) {
      source += this.typeTracker.getTypeContent(typeName);
    }
    
    // Generate the API collection type
    if (!this.snapshot.data.collections) {
      return source;
    }
    
    // Create collections type
    const keyword = this.options.useTypes ? "type" : "interface";
    source += `\nexport ${keyword} ${this.options.typeName} ${this.options.useTypes ? "= " : ""}{`;
    
    // Add non-system collections first
    const regularCollections = this.snapshot.data.collections.filter(
      col => !col.collection.startsWith("directus_")
    );
    
    for (const collection of regularCollections) {
      const typeName = this.typeNameManager.getTypeNameForCollection(collection.collection);
      const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
      const isSingleton = collection.meta.singleton === true;
      
      source += `\n  ${collection.collection}: ${cleanTypeName}${isSingleton ? "" : "[]"};`;
    }
    
    // Add system collections if includeSystemFields is true
    if (this.options.includeSystemFields) {
      const systemCollections = this.snapshot.data.collections.filter(
        col => col.collection.startsWith("directus_")
      );
      
      for (const collection of systemCollections) {
        const typeName = this.typeNameManager.getTypeNameForCollection(collection.collection);
        const cleanTypeName = this.typeNameManager.cleanTypeName(typeName);
        const isSingleton = collection.meta.singleton === true;
        
        if (this.typeTracker.hasType(cleanTypeName)) {
          source += `\n  ${collection.collection}: ${cleanTypeName}${isSingleton ? "" : "[]"};`;
        }
      }
    }
    
    // Close the interface
    source += `\n}\n\n`;
    
    return source;
  }
}