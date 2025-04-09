import { readFile } from "fs/promises";
import { DirectusFieldMetadata, DirectusFieldsResponse, SchemaReadOptions } from "../types";
import { SchemaReader } from "./SchemaReader";
import { SYSTEM_FIELDS } from "../constants/system_fields";

/**
 * Detects and manages system fields dynamically using the fields endpoint
 */
export class SystemFieldDetector {
  private systemFields: Map<string, Set<string>> = new Map();
  private options: SchemaReadOptions;
  
  constructor(options: SchemaReadOptions) {
    this.options = options;
  }
  
  /**
   * Initialize by fetching field data from the server or file
   */
  async initialize(): Promise<void> {
    try {
      const fieldsData = await this.getFieldsData();
      this.processFieldsData(fieldsData);
    } catch {
      // Silent fallback - this is an expected scenario in many cases
      // Create an empty system fields map - we'll fall back to hardcoded values
      this.systemFields = new Map();
    }
  }
  
  /**
   * Get fields data from server or file
   */
  private async getFieldsData(): Promise<DirectusFieldMetadata[]> {
    // Try to read from file first
    if (this.options.fieldsFile) {
      return this.readFieldsFromFile(this.options.fieldsFile);
    }
    
    // Otherwise fetch from server if host is available
    if (this.options.host) {
      try {
        // Get auth token
        if (this.options.token) {
          return this.fetchFieldsFromServer(this.options.host, this.options.token);
        } else if (this.options.email && this.options.password) {
          // Authenticate with email/password and then fetch fields
          try {
            const authResponse = await SchemaReader.authenticate(this.options);
            return this.fetchFieldsFromServer(this.options.host, authResponse.data.access_token);
          } catch {
            // Silent fallback - no need to warn as this is expected in some cases
            return [];
          }
        } else {
          throw new Error("Either token or both email and password must be provided for authentication");
        }
      } catch {
        // If fetching fields fails, we'll use the fallback mechanism 
        // Silent fallback - no need to error as this is not critical
        return [];
      }
    }
    
    // Fallback to empty array if no source is available
    // We'll use the hardcoded SYSTEM_FIELDS constant as a fallback
    return [];
  }
  
  /**
   * Read fields data from a file
   */
  private async readFieldsFromFile(filePath: string): Promise<DirectusFieldMetadata[]> {
    try {
      const fileContent = await readFile(filePath, { encoding: "utf-8" });
      const fieldsData = JSON.parse(fileContent) as DirectusFieldsResponse;
      return fieldsData.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read fields file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Fetch fields data from server
   */
  private async fetchFieldsFromServer(host: string, token: string): Promise<DirectusFieldMetadata[]> {
    try {
      const response = await fetch(new URL("/fields", host), {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch fields: ${response.statusText}`);
      }
      
      const data = await response.json() as DirectusFieldsResponse;
      return data.data;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch fields: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Process fields data and identify system fields
   */
  private processFieldsData(fields: DirectusFieldMetadata[]): void {
    // Process each field
    for (const field of fields) {
      const collection = field.collection;
      const fieldName = field.field;
      
      // Initialize set for this collection if it doesn't exist
      if (!this.systemFields.has(collection)) {
        this.systemFields.set(collection, new Set<string>());
      }
      
      // Add all field to the set, regardless of whether they're system fields
      // This ensures we have a complete list of fields to work with
      this.systemFields.get(collection)?.add(fieldName);
    }
  }
  
  /**
   * Check if a field is a system field
   */
  isSystemField(collection: string, fieldName: string): boolean {
    // Check if this collection exists in systemFields
    if (!this.systemFields.has(collection)) {
      return false;
    }
    
    // Check if the field exists for this collection
    if (!this.systemFields.get(collection)?.has(fieldName)) {
      return false;
    }
    
    // For system collections, we need to determine if the field is actually a system field
    // by checking against the hardcoded SYSTEM_FIELDS
    if (collection.startsWith('directus_')) {
      const systemCollectionFields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      
      // If this field is in the hardcoded system fields, it's a system field
      if (systemCollectionFields && Array.isArray(systemCollectionFields)) {
          // Using this approach to avoid type errors with readonly arrays
          const fieldExists = systemCollectionFields.some(field => field === fieldName);
          if (fieldExists) {
              return true;
          }
      }
      
      // Otherwise it's a custom field in a system collection
      return false;
    }
    
    // For non-system collections, all fields are considered non-system
    return false;
  }
  
  /**
   * Get all fields for a collection
   */
  getSystemFields(collection: string): string[] {
    // For system collections, return fields from SYSTEM_FIELDS constant
    if (collection.startsWith('directus_')) {
      // Check if we have this system collection in our hardcoded system fields
      const systemCollectionFields = SYSTEM_FIELDS[collection as keyof typeof SYSTEM_FIELDS];
      if (systemCollectionFields && Array.isArray(systemCollectionFields)) {
        return [...systemCollectionFields] as string[];
      }
    }
    
    // For regular collections or collections not found in SYSTEM_FIELDS,
    // return an empty array as they don't have system fields
    return [];
  }
  
  /**
   * Get all system collections
   */
  getSystemCollections(): string[] {
    return Array.from(this.systemFields.keys());
  }
}