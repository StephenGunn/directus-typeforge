import { DirectusField } from "../types";
import { systemFields, fieldTypeMapping } from "../config";

/**
 * Manages system field operations and type mappings
 */
export class SystemFieldManager {
  /**
   * Get the appropriate TypeScript type for a system field
   */
  getSystemFieldType(fieldName: string): string {
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
      
      // Date fields - Using literal 'datetime' for SDK compatibility
      case 'last_access':
      case 'last_page':
      case 'uploaded_on':
      case 'modified_on':
      case 'created_on':
      case 'date_created':
      case 'date_updated':
      case 'datetime':
      case 'timestamp':
        return "'datetime'";
      
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
   * Create a synthetic system field
   */
  createSystemField(
    collectionName: string, 
    fieldName: string, 
    fieldType: string, 
    isId: boolean = false
  ): DirectusField {
    // Add special metadata for certain fields
    let special: string[] | undefined = undefined;
    let actualType = fieldType;
    let dataType = fieldType;
    
    // Set appropriate special values for date fields
    if (fieldName === 'date_created') {
      special = ['date-created'];
      actualType = 'datetime'; 
      dataType = 'datetime';
    } else if (fieldName === 'date_updated') {
      special = ['date-updated'];
      actualType = 'datetime';
      dataType = 'datetime';
    } else if (fieldName === 'user_created' || fieldName === 'user_updated') {
      special = ['m2o'];
      actualType = 'alias';
      dataType = 'alias';
    }
    
    return {
      collection: collectionName,
      field: fieldName,
      type: actualType,
      meta: {
        collection: collectionName,
        field: fieldName,
        hidden: false,
        interface: 'input',
        special: special,
        system: true
      },
      schema: {
        name: fieldName,
        table: collectionName,
        data_type: dataType,
        default_value: null,
        max_length: null,
        numeric_precision: null,
        numeric_scale: null,
        is_nullable: !isId,
        is_unique: isId,
        is_primary_key: isId,
        has_auto_increment: false,
        foreign_key_table: null,
        foreign_key_column: null
      }
    };
  }

  /**
   * Get all system fields for a given collection
   */
  getSystemFields(collectionName: string): string[] {
    if (collectionName.startsWith('directus_')) {
      const systemCollectionFields = systemFields[collectionName as keyof typeof systemFields];
      if (systemCollectionFields) {
        return [...systemCollectionFields] as string[];
      }
    }
    return [];
  }

  /**
   * Check if a field is a system field
   */
  isSystemField(collectionName: string, fieldName: string): boolean {
    if (collectionName.startsWith('directus_')) {
      const systemCollectionFields = systemFields[collectionName as keyof typeof systemFields];
      
      if (systemCollectionFields && Array.isArray(systemCollectionFields)) {
        const fieldExists = systemCollectionFields.some(field => field === fieldName);
        return fieldExists;
      }
    }
    return false;
  }

  /**
   * Get synthetic system fields for a collection that aren't in the provided schema fields
   */
  getSyntheticSystemFields(
    collectionName: string,
    existingFieldNames: Set<string>,
    idType: string
  ): DirectusField[] {
    if (!collectionName.startsWith('directus_')) {
      return [];
    }

    const systemFieldsKey = collectionName as keyof typeof systemFields;
    const systemFieldNames = systemFields[systemFieldsKey];
    if (!systemFieldNames) {
      return [];
    }

    const syntheticFields: DirectusField[] = [];
    
    for (const fieldName of systemFieldNames) {
      if (!existingFieldNames.has(fieldName)) {
        const fieldType = fieldName === 'id' ? idType : this.getSystemFieldType(fieldName);
        syntheticFields.push(this.createSystemField(
          collectionName,
          fieldName,
          fieldType,
          fieldName === 'id'
        ));
      }
    }
    
    return syntheticFields;
  }
}