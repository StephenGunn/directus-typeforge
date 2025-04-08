import { readFile } from "fs/promises";
import { DirectusFieldMetadata, DirectusFieldsResponse, SchemaReadOptions } from "../types";
import { SchemaReader } from "./SchemaReader";

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
      // Only process system fields
      if (field.meta.system) {
        const collection = field.collection;
        const fieldName = field.field;
        
        // Initialize set for this collection if it doesn't exist
        if (!this.systemFields.has(collection)) {
          this.systemFields.set(collection, new Set<string>());
        }
        
        // Add field to the set
        this.systemFields.get(collection)?.add(fieldName);
      }
    }
  }
  
  /**
   * Check if a field is a system field
   */
  isSystemField(collection: string, fieldName: string): boolean {
    // Check if we have this collection in our map
    if (!this.systemFields.has(collection)) {
      return false;
    }
    
    // Check if this field is in the collection's system fields
    return this.systemFields.get(collection)?.has(fieldName) || false;
  }
  
  /**
   * Get all system fields for a collection
   */
  getSystemFields(collection: string): string[] {
    if (!this.systemFields.has(collection)) {
      return [];
    }
    
    return Array.from(this.systemFields.get(collection) || []);
  }
  
  /**
   * Get all system collections
   */
  getSystemCollections(): string[] {
    return Array.from(this.systemFields.keys());
  }
}