import {
  DirectusSchemaSnapshot,
  DirectusCollection,
  DirectusField,
  RelationshipType,
  GenerateTypeScriptOptions
} from "../types";
import { toPascalCase } from "../utils/string";
import { SYSTEM_FIELDS } from "../constants/system_fields";
import { RelationshipProcessor } from "./RelationshipProcessor";
import { RelationshipResolver } from "./RelationshipResolver";
import { SystemFieldManager } from "./SystemFieldManager";
import { TypeDefinitionGenerator } from "./TypeDefinitionGenerator";
import { systemRelations } from "../config";
import pluralize from "pluralize";

/**
 * Core schema processor that coordinates the schema conversion process
 */
export class CoreSchemaProcessor {
  private snapshot: DirectusSchemaSnapshot;
  private options: Required<GenerateTypeScriptOptions>;
  
  // Component managers
  private relationshipProcessor: RelationshipProcessor;
  private systemFieldManager: SystemFieldManager;
  private typeGenerator: TypeDefinitionGenerator;
  private relationshipResolver: RelationshipResolver | null = null;
  
  // Maps to track collection info
  private collectionTypes: Map<string, string> = new Map();
  private collectionIdTypes: Map<string, "string" | "number"> = new Map();
  
  // Track all alias fields to resolve later
  private aliasFields: Array<{
    collection: string;
    field: string;
    fieldMeta: Record<string, unknown> | null;
    special?: string[];
  }> = [];
  
  // Track processed collections to avoid duplication
  private processedCollections: Set<string> = new Set();
  
  // Track system collections that have custom fields
  private systemCollectionsWithCustomFields: Set<string> = new Set();
  
  // Track which collections are system collections
  private systemCollections: Set<string> = new Set();
  
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
    options: GenerateTypeScriptOptions
  ) {
    this.snapshot = snapshot;
    
    // Set default options for best SDK compatibility
    this.options = {
      typeName: options.typeName,
      useTypeReferences: options.useTypeReferences ?? true,
      useTypes: options.useTypes ?? false,
      makeRequired: options.makeRequired ?? true,
      includeNullables: options.includeNullables ?? false,
      includeSystemFields: options.includeSystemFields ?? true,
      exportSystemCollections: options.exportSystemCollections ?? true,
      resolveSystemRelations: options.resolveSystemRelations ?? true,
      addTypedocNotes: options.addTypedocNotes ?? true,
    };

    // Initialize component managers
    this.relationshipProcessor = new RelationshipProcessor();
    this.systemFieldManager = new SystemFieldManager();
    this.typeGenerator = new TypeDefinitionGenerator(
      this.relationshipProcessor,
      this.systemFieldManager,
      {
        useTypes: this.options.useTypes,
        makeRequired: this.options.makeRequired,
        includeNullables: this.options.includeNullables,
        addTypedocNotes: this.options.addTypedocNotes
      }
    );
  }

  /**
   * Process the schema and generate TypeScript type definitions
   */
  process(): string {
    // First, register all collections to understand the schema structure
    this.registerCollections();
    
    // Pass the collection ID types to the type generator
    this.typeGenerator.setCollectionIdTypes(this.collectionIdTypes);
    
    // Collect all alias fields for deferred processing
    this.collectAliasFields();
    
    // Analyze explicit relationships from the schema
    this.analyzeRelationships();

    // Apply system collection relationships as fallbacks
    this.applySystemRelations();

    // Process all alias fields AFTER we have a complete relationship graph
    this.resolveAliasFields();
    
    // Generate interface definitions for all collections
    this.generateTypeDefinitions();
    
    // Build and return the final output
    return this.buildOutput();
  }

  /**
   * Register all collections and determine their ID types
   */
  private registerCollections(): void {
    if (!this.snapshot.data.collections) return;
    
    // Pre-register known system collections with their correct ID types
    // These are important for proper relationship typing
    const systemCollectionsWithStringIds = [
      'directus_users',
      'directus_files',
      'directus_folders',
      'directus_roles',
      'directus_flows',
      'directus_collections',
      'directus_fields',
      'directus_relations',
      'directus_webhooks',
      'directus_extensions',
      'directus_comments',
      'directus_versions'
    ];
    
    const systemCollectionsWithNumberIds = [
      'directus_permissions',
      'directus_activity', 
      'directus_presets',
      'directus_revisions',
      'directus_settings',
      'directus_operations'
    ];
    
    // Set string IDs for system collections that use UUIDs or strings
    for (const collection of systemCollectionsWithStringIds) {
      if (!this.collectionIdTypes.has(collection)) {
        this.collectionIdTypes.set(collection, 'string');
      }
    }
    
    // Set number IDs for system collections that use auto-increment integers
    for (const collection of systemCollectionsWithNumberIds) {
      if (!this.collectionIdTypes.has(collection)) {
        this.collectionIdTypes.set(collection, 'number');
      }
    }
    
    // Process all collections in the schema snapshot
    for (const collection of this.snapshot.data.collections) {
      const typeName = this.getTypeNameForCollection(collection.collection);
      this.collectionTypes.set(collection.collection, typeName);
      
      // Determine ID type for this collection
      const idType = this.getIdTypeForCollection(collection.collection);
      this.collectionIdTypes.set(collection.collection, idType);
      
      // Cache type name on collection for later use
      if (collection.meta) {
        collection.meta._type_name = typeName;
      } else {
        // Initialize meta object if it's null
        collection.meta = {
          accountability: "all",
          collection: collection.collection,
          singleton: false,
          _type_name: typeName
        };
      }
    }
  }

  /**
   * Check if a system collection has custom fields
   */
  private hasCustomFields(collectionName: string): boolean {
    if (!collectionName.startsWith('directus_')) return false;
    
    // Get the primary key field
    const primaryKeyField = this.getPrimaryKeyField(collectionName);
    
    // Find all fields for this collection
    const collectionFields = this.snapshot.data.fields.filter(
      field => field.collection === collectionName
    );
    
    // Check if there are any fields other than the primary key
    return collectionFields.some(field => field.field !== primaryKeyField);
  }

  /**
   * Get the primary key field name for a collection
   */
  private getPrimaryKeyField(collectionName: string): string {
    // Find the field marked as primary key
    const pkField = this.snapshot.data.fields.find(
      field => field.collection === collectionName && field.schema?.is_primary_key === true
    );
    
    // Return the field name, or default to 'id' if not found
    return pkField?.field || 'id';
  }

  /**
   * Collect all alias fields for deferred processing
   */
  private collectAliasFields(): void {
    console.log("\n====== Collecting all alias fields ======\n");
    
    // Find all alias fields in the schema
    const allAliasFields = this.snapshot.data.fields.filter(field => 
      field.type === 'alias'
    );
    
    // Store them for later resolution
    this.aliasFields = [];
    for (const field of allAliasFields) {
      this.aliasFields.push({
        collection: field.collection,
        field: field.field,
        fieldMeta: field.meta,
        special: field.meta?.special as string[] | undefined
      });
      
      console.log(`Collected alias field: ${field.collection}.${field.field} (${field.meta?.special?.join(', ') || 'no special'})`);
    }
    
    console.log(`Total collected alias fields: ${this.aliasFields.length}`);
  }

  /**
   * Analyze relationships between collections
   */
  private analyzeRelationships(): void {
    if (!this.snapshot.data.relations) return;

    // Process all relations through the RelationshipProcessor
    this.relationshipProcessor.processRelations(
      this.snapshot.data.relations,
      (collectionName) => this.getTypeNameForCollection(collectionName)
    );
  }

  /**
   * Apply system collection relationships as fallbacks
   *
   * Directus doesn't include relations for internal system collection fields in the schema snapshot.
   * This method adds known system collection relationships (e.g. directus_files.folder -> directus_folders)
   * only if they don't already exist in the schema.
   */
  private applySystemRelations(): void {
    // Skip if the option is disabled
    if (!this.options.resolveSystemRelations) return;

    console.log("\n====== Applying system collection relationships ======\n");

    for (const sysRel of systemRelations) {
      // Check if this relationship already exists
      const existing = this.relationshipProcessor.getRelationshipForField(
        sysRel.collection,
        sysRel.field
      );

      if (existing) {
        console.log(`  Skipping ${sysRel.collection}.${sysRel.field} - already defined in schema`);
        continue;
      }

      // Add the system relationship as a fallback
      this.relationshipProcessor.addRelationship(
        sysRel.collection,
        sysRel.field,
        RelationshipType.ManyToOne,
        sysRel.relatedCollection,
        this.getTypeNameForCollection(sysRel.relatedCollection)
      );

      console.log(`  Added system relationship: ${sysRel.collection}.${sysRel.field} -> ${sysRel.relatedCollection}`);
    }

    console.log(`\nApplied ${systemRelations.length} system collection relationships\n`);
  }

  /**
   * Resolve all collected alias fields using our comprehensive relationship knowledge
   */
  private resolveAliasFields(): void {
    if (this.aliasFields.length === 0) return;
    
    console.log("\n====== Resolving all alias fields ======\n");
    
    // Get all available collections for pattern matching
    const allCollections = this.snapshot.data.collections?.map(c => c.collection) || [];
    
    // Create a relationship resolver to help with more intelligent matching
    this.relationshipResolver = new RelationshipResolver(
      allCollections,
      this.snapshot.data.relations || [],
      this.relationshipProcessor.getRelationships()
    );
    
    // Process each alias field
    for (const aliasField of this.aliasFields) {
      const collectionName = aliasField.collection;
      const fieldName = aliasField.field;
      
      console.log(`\nResolving alias field: ${collectionName}.${fieldName}`);
      console.log(`  Special: ${aliasField.special?.join(', ') || 'none'}`);
      
      // Skip if relationship already exists
      if (this.relationshipProcessor.getRelationshipForField(collectionName, fieldName)) {
        console.log(`  Relationship already exists for ${collectionName}.${fieldName}`);
        continue;
      }
      
      // Determine the relationship type from special flags
      let relationshipType: RelationshipType | null = null;
      
      if (aliasField.special && Array.isArray(aliasField.special)) {
        if (aliasField.special.includes('o2m')) {
          relationshipType = RelationshipType.OneToMany;
          console.log(`  Detected O2M relationship from special flag`);
        } else if (aliasField.special.includes('m2o')) {
          relationshipType = RelationshipType.ManyToOne;
          console.log(`  Detected M2O relationship from special flag`);
        } else if (aliasField.special.includes('m2m')) {
          relationshipType = RelationshipType.ManyToMany;
          console.log(`  Detected M2M relationship from special flag`);
        } else if (aliasField.special.includes('m2a')) {
          relationshipType = RelationshipType.ManyToAny;
          console.log(`  Detected M2A relationship from special flag`);
        }
      }
      
      if (!relationshipType) {
        console.log(`  Could not determine relationship type from special flags, defaulting to O2M`);
        relationshipType = RelationshipType.OneToMany;
      }
      
      // Try to resolve the related collection using the resolver
      const resolvedCollection = this.relationshipResolver.resolveRelatedCollection(
        fieldName, 
        collectionName, 
        relationshipType
      );
      
      // If we found a valid collection, create the relationship
      if (resolvedCollection) {
        this.relationshipProcessor.addRelationship(
          collectionName,
          fieldName,
          relationshipType,
          resolvedCollection,
          this.getTypeNameForCollection(resolvedCollection)
        );
        
        console.log(`  Added resolved relationship: ${collectionName}.${fieldName} (${this.relationshipProcessor.getRelationshipTypeName(relationshipType)}) -> ${resolvedCollection}`);
      } else {
        console.log(`  WARNING: Could not resolve related collection for ${collectionName}.${fieldName}`);
      }
    }
  }

  /**
   * Generate interface definitions for all collections
   */
  private generateTypeDefinitions(): void {
    if (!this.snapshot.data.collections) return;
    
    // First, ensure all system collections referenced in relations are processed
    this.ensureSystemCollectionsFromRelations();
    
    // Collections to exclude from output completely
    const excludedCollections = ['Application_Data', 'application_data'];
    
    // Process all collections in the schema
    for (const collection of this.snapshot.data.collections) {
      // Skip if already processed or in exclusion list
      if (this.processedCollections.has(collection.collection) || 
          excludedCollections.includes(collection.collection)) continue;
      
      // Mark as processed
      this.processedCollections.add(collection.collection);
      
      // Check if this is a system collection
      const isSystemCollection = collection.collection.startsWith("directus_");
      
      if (isSystemCollection) {
        // Track this as a system collection
        this.systemCollections.add(collection.collection);
        // Generate system collection interface with system fields
        this.generateSystemCollectionInterface(collection);
      } else {
        // Generate regular collection interface
        this.generateCollectionInterface(collection);
      }
    }
    
    // Generate minimal interfaces for system collections referenced in relations
    this.generateReferencedSystemCollections();
    
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
      
      // Track this as a system collection
      this.systemCollections.add(collectionName);
      
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
    
    // Check if this system collection has custom fields
    if (this.hasCustomFields(collectionName)) {
      this.systemCollectionsWithCustomFields.add(collectionName);
    }
    
    // Get the type name and ID type for this collection
    const typeName = this.getTypeNameForCollection(collectionName);
    const idType = this.collectionIdTypes.get(collectionName) || "string";
    
    // Cache the type name on the collection for later use
    if (collection.meta) {
      collection.meta._type_name = typeName;
    } else {
      // Initialize meta object if it's null
      collection.meta = {
        accountability: "all",
        collection: collection.collection,
        singleton: false,
        _type_name: typeName
      };
    }
    
    // Process the collection to generate interface
    this.processCollectionAndGenerateInterface(
      collection,
      typeName,
      idType,
      true // isSystemCollection
    );
  }
  
  /**
   * Process a collection and generate its interface
   * Common logic for both system and regular collections
   */
  private processCollectionAndGenerateInterface(
    collection: DirectusCollection,
    typeName: string,
    idType: string,
    isSystemCollection: boolean
  ): void {
    const collectionName = collection.collection;
    
    // For system collections, start with custom fields + enhance with relations
    let fields: DirectusField[] = [];
    
    if (isSystemCollection) {
      // Step 1: Get custom fields from schema snapshot
      let customFields = this.getCustomFieldsForCollection(collectionName);
      
      // Step 2: Enhance with relationship fields from relations data
      customFields = this.enhanceWithRelationFields(customFields, collectionName);
      
      // Step 3: Track what fields we have so far to avoid duplicates
      const fieldNameSet = new Set(customFields.map(f => f.field));
      fields = [...customFields];
      
      // Step 4: If includeSystemFields is true, add system fields that aren't already included
      if (this.options.includeSystemFields) {
        // Get all fields for the collection
        const allFields = this.getAllFieldsForCollection(collectionName);
        
        // Add any fields that aren't already in our custom fields list
        for (const field of allFields) {
          if (!fieldNameSet.has(field.field)) {
            fields.push(field);
            fieldNameSet.add(field.field);
          }
        }
      }
      
      // Step 5: Always include the primary key field if it's not already present
      const primaryKeyField = this.getPrimaryKeyField(collectionName);
      if (!fieldNameSet.has(primaryKeyField)) {
        // Create a synthetic primary key field
        const pkField = this.systemFieldManager.createSystemField(
          collectionName,
          primaryKeyField,
          idType,
          true // isId
        );
        fields.push(pkField);
      }
    } else {
      // For regular collections, get all fields
      fields = this.getAllFieldsForCollection(collectionName);
    }
    
    // Check if this collection might be a junction table
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
    
    // Get the primary key field name
    const primaryKeyField = this.getPrimaryKeyField(collectionName);
    
    // Generate interface with the fields
    this.typeGenerator.generateInterfaceWithFields(
      typeName, 
      collectionName, 
      fields,
      idType,
      isJunctionTable,
      primaryKeyField
    );
  }

  /**
   * Generate interface for a regular collection
   */
  private generateCollectionInterface(collection: DirectusCollection): void {
    const collectionName = collection.collection;
    const typeName = this.getTypeNameForCollection(collectionName);
    const idType = this.collectionIdTypes.get(collectionName) || "string";
    
    // Cache the type name on the collection for later use
    if (collection.meta) {
      collection.meta._type_name = typeName;
    } else {
      // Initialize meta object if it's null
      collection.meta = {
        accountability: "all",
        collection: collection.collection,
        singleton: false,
        _type_name: typeName
      };
    }
    
    // Process the collection to generate interface
    this.processCollectionAndGenerateInterface(
      collection,
      typeName,
      idType,
      false // not a system collection
    );
  }

  /**
   * Generate minimal interfaces for system collections referenced in relations
   * and essential system collections like DirectusUser
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
    
    // Add essential system collections that should always be available
    const essentialSystemCollections = [
      'directus_users',   // DirectusUser
      'directus_files',   // DirectusFile
      'directus_folders', // DirectusFolder
      'directus_roles'    // DirectusRole
    ];
    
    // Add these to the collections to process
    for (const collection of essentialSystemCollections) {
      referencedSystemCollections.add(collection);
    }
    
    // Generate minimal interfaces for referenced system collections
    for (const collectionName of referencedSystemCollections) {
      const typeName = this.getTypeNameForCollection(collectionName);
      
      // Skip if already processed
      if (this.processedCollections.has(collectionName)) continue;
      
      // Determine the ID type for this collection
      const idType = this.getIdTypeForCollection(collectionName);
      
      // Create a minimal collection for processing
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
   * Generate the root schema interface
   */
  private generateRootInterface(): void {
    if (!this.snapshot.data.collections || this.snapshot.data.collections.length === 0) {
      return;
    }
    
    // Get the system type definitions that should be included in the root interface
    let systemTypesToInclude: Map<string, string> = new Map(); // typeName -> collectionName
    
    // Get all type definitions
    const allTypes = this.typeGenerator.getTypeDefinitions();
    
    // Build a map of collection names to type names for system collections
    for (const [typeName] of allTypes) {
      // Check all our processed collections to find which type belongs to which collection
      for (const collectionName of this.processedCollections) {
        const expectedTypeName = this.getTypeNameForCollection(collectionName);
        if (expectedTypeName === typeName && this.systemCollections.has(collectionName)) {
          // This is a system collection type
          if (this.options.exportSystemCollections) {
            // Include all system collections when exportSystemCollections is true
            systemTypesToInclude.set(typeName, collectionName);
          } else if (this.options.includeSystemFields) {
            // Include all system collections when includeSystemFields is true
            systemTypesToInclude.set(typeName, collectionName);
          } else if (this.systemCollectionsWithCustomFields.has(collectionName)) {
            // Include only system collections with custom fields when includeSystemFields is false
            systemTypesToInclude.set(typeName, collectionName);
          }
          break;
        }
      }
    }
    
    // Generate the root interface
    this.typeGenerator.generateRootInterface(
      this.options.typeName,
      this.snapshot.data.collections,
      Array.from(systemTypesToInclude.keys())
    );
  }

  /**
   * Build the final TypeScript output
   */
  private buildOutput(): string {
    return this.typeGenerator.buildOutput(this.options.typeName);
  }

  /**
   * Enhance field list with relationship fields that may not be present in the schema
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
   * Get all fields for a collection
   */
  private getAllFieldsForCollection(collectionName: string): DirectusField[] {
    const schemaFields = !this.snapshot.data.fields ? [] : this.snapshot.data.fields.filter(
      field => field.collection === collectionName
    );
    
    // For system collections, add system fields from SYSTEM_FIELDS if they're not in schema
    if (collectionName.startsWith('directus_') && Object.prototype.hasOwnProperty.call(SYSTEM_FIELDS, collectionName)) {
      const existingFieldNames = new Set(schemaFields.map(f => f.field));
      const idType = this.getIdTypeForCollection(collectionName);
      
      // Add missing system fields from SYSTEM_FIELDS that aren't already in schema
      const syntheticFields = this.systemFieldManager.getSyntheticSystemFields(
        collectionName,
        existingFieldNames,
        idType
      );
      
      // Combine schema fields and synthetic system fields
      return [...schemaFields, ...syntheticFields];
    }
    
    // For non-system collections, add standard Directus metadata fields only if they exist in the schema
    const existingFieldNames = new Set(schemaFields.map(f => f.field));
    const standardMetadataFields = ['date_created', 'date_updated', 'user_created', 'user_updated'];
    const syntheticFields: DirectusField[] = [];
    
    // Check if this is a junction table/collection
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
    
    // We don't add standard fields automatically anymore
    // Instead, we only use the fields that are actually defined in the schema snapshot
    
    // If you want to add these fields back conditionally, you could introduce a new option like:
    // if (this.options.addStandardMetadataFields && !isJunctionTable) {
    //   // then add the fields
    // }
    
    // Return schema fields plus synthetic standard fields
    return [...schemaFields, ...syntheticFields];
  }

  /**
   * Get custom fields for a system collection
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
    return allFields.filter(field => {
      // Skip id field - we'll always add it
      if (field.field === 'id') return false;

      // Include if field is explicitly marked as not a system field
      if (field.meta?.system === false) return true;
      
      // Include if field is not in the system fields list
      if (!systemFieldSet.has(field.field.toLowerCase())) return true;
      
      // Include if field has relationship attributes
      if (field.meta?.special) {
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
      if (field.meta?.interface && (
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
   * Determines if a collection is a singleton
   */
  private isSingleton(collectionName: string): boolean {
    if (!this.snapshot.data.collections) return false;
    
    const collection = this.snapshot.data.collections.find(
      c => c.collection === collectionName
    );

    return collection?.meta?.singleton === true;
  }

  /**
   * Convert plural to singular using pluralize library
   */
  private makeSingular(name: string): string {
    return pluralize.singular(name);
  }

  /**
   * Get the ID type for a collection
   */
  private getIdTypeForCollection(collectionName: string): "string" | "number" {
    // Check if we've already determined the ID type
    if (this.collectionIdTypes.has(collectionName)) {
      return this.collectionIdTypes.get(collectionName)!;
    }
    
    // Get the primary key field name
    const primaryKeyField = this.getPrimaryKeyField(collectionName);
    
    // If we have fields data, check the actual primary key field
    if (this.snapshot.data.fields) {
      const idField = this.snapshot.data.fields.find(
        field => field.collection === collectionName && field.field === primaryKeyField
      );
      
      if (idField) {
        // Check type and schema data_type to determine if it's a number ID
        if (
          idField.type === "integer" || 
          idField.type === "number" || 
          idField.type === "bigInteger" ||
          idField.schema.data_type === "integer" ||
          idField.schema.data_type === "number" ||
          idField.schema.data_type === "bigint" ||
          idField.schema.has_auto_increment === true
        ) {
          return "number";
        }
        
        // Check if it's explicitly a UUID or string type
        if (
          idField.type === "uuid" ||
          idField.type === "string" ||
          idField.schema.data_type === "uuid" ||
          idField.schema.data_type === "char" ||
          idField.schema.data_type === "varchar" ||
          idField.schema.data_type === "text"
        ) {
          return "string";
        }
      }
      
      // Check if there are any foreign keys that reference this collection
      // to determine the ID type
      const referencingRelation = this.snapshot.data.relations?.find(
        relation => relation.related_collection === collectionName
      );
      
      if (referencingRelation?.schema?.foreign_key_column === "id") {
        // Check the type of the referencing field
        const referencingField = this.snapshot.data.fields.find(
          field => 
            field.collection === referencingRelation.collection && 
            field.field === referencingRelation.field
        );
        
        if (referencingField) {
          if (
            referencingField.type === "integer" || 
            referencingField.type === "number" ||
            referencingField.schema.data_type === "integer" ||
            referencingField.schema.data_type === "number"
          ) {
            return "number";
          }
          
          if (
            referencingField.type === "uuid" ||
            referencingField.type === "string"
          ) {
            return "string";
          }
        }
      }
    }
    
    // System collections - use our pre-registered types
    if (collectionName.startsWith("directus_")) {
      if (this.numberIdCollections.has(collectionName)) {
        return "number";
      } else {
        // Most Directus collections use UUIDs (strings)
        return "string";
      }
    }
    
    // Default to string for UUIDs and other string IDs
    // This is a safe default for most collections
    return "string";
  }
}