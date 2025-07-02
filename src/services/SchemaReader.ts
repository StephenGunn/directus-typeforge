import { readFile } from "fs/promises";
import { z } from "zod";
import type { 
  SchemaReadOptions, 
  DirectusSchemaSnapshot, 
  DirectusFieldsResponse 
} from "../types";

/**
 * Authentication response format from Directus
 */
const DirectusAuthResponse = z.object({
  data: z.object({
    access_token: z.string(),
    expires: z.number().int(),
    refresh_token: z.string(),
  }),
});

/**
 * SchemaReader handles reading schema snapshots from files or the Directus API
 */
export class SchemaReader {
  /**
   * Read a schema snapshot from a file or Directus server
   */
  static async readSchema(options: SchemaReadOptions): Promise<DirectusSchemaSnapshot> {
    // Read from file if specified
    if (options.snapshotFile) {
      return this.readSnapshotFromFile(options.snapshotFile);
    }
    
    // Otherwise, must have host to fetch from server
    if (!options.host) {
      throw new Error("Either snapshotFile or host must be provided.");
    }
    
    // Get token for API access
    let token: string;
    if (options.token) {
      token = options.token;
    } else if (options.email && options.password) {
      const loginResponse = await this.authenticate(options);
      token = loginResponse.data.access_token;
    } else {
      throw new Error(
        "Either token or both email and password must be provided for authentication."
      );
    }
    
    // Fetch schema snapshot from server
    return this.fetchSchemaSnapshot(options.host, token);
  }
  
  /**
   * Read field data from a file or Directus server
   */
  static async readFields(options: SchemaReadOptions): Promise<DirectusFieldsResponse> {
    // Read from file if specified
    if (options.fieldsFile) {
      return this.readFieldsFromFile(options.fieldsFile);
    }
    
    // Otherwise, must have host to fetch from server
    if (!options.host) {
      throw new Error("Either fieldsFile or host must be provided.");
    }
    
    // Get token for API access
    let token: string;
    if (options.token) {
      token = options.token;
    } else if (options.email && options.password) {
      const loginResponse = await this.authenticate(options);
      token = loginResponse.data.access_token;
    } else {
      throw new Error(
        "Either token or both email and password must be provided for authentication."
      );
    }
    
    // Fetch fields from server
    return this.fetchFields(options.host, token);
  }
  
  /**
   * Read schema snapshot from a local file
   */
  private static async readSnapshotFromFile(filePath: string): Promise<DirectusSchemaSnapshot> {
    try {
      const fileContent = await readFile(filePath, { encoding: "utf-8" });
      const parsed = JSON.parse(fileContent);
      
      // Handle both formats: with and without 'data' wrapper
      // API format: { data: { version, directus, vendor, collections, fields, relations } }
      // CLI format: { version, directus, vendor, collections, fields, relations }
      if (parsed.data && typeof parsed.data === 'object' && 'collections' in parsed.data) {
        // Already has data wrapper (API format)
        return parsed as DirectusSchemaSnapshot;
      } else if ('collections' in parsed && 'fields' in parsed && 'relations' in parsed) {
        // CLI format - wrap it in data object
        return { data: parsed } as DirectusSchemaSnapshot;
      } else {
        throw new Error('Invalid schema snapshot format: missing required properties');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read schema snapshot file: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Authenticate with Directus server
   */
  static async authenticate(options: SchemaReadOptions) {
    if (!options.host || !options.email || !options.password) {
      throw new Error("Host, email, and password are required for authentication");
    }

    try {
      const response = await fetch(new URL("/auth/login", options.host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: options.email,
          password: options.password,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const json = await response.json();
      return DirectusAuthResponse.parse(json);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Authentication failed: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Fetch schema snapshot from Directus server
   */
  private static async fetchSchemaSnapshot(host: string, token: string): Promise<DirectusSchemaSnapshot> {
    try {
      const response = await fetch(new URL("/schema/snapshot", host), {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch schema snapshot: ${response.statusText}`);
      }

      return await response.json() as DirectusSchemaSnapshot;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch schema snapshot: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Read fields data from a file
   */
  private static async readFieldsFromFile(filePath: string): Promise<DirectusFieldsResponse> {
    try {
      const fileContent = await readFile(filePath, { encoding: "utf-8" });
      return JSON.parse(fileContent) as DirectusFieldsResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read fields file: ${error.message}`);
      }
      throw error;
    }
  }
  
  /**
   * Fetch fields from Directus server
   */
  private static async fetchFields(host: string, token: string): Promise<DirectusFieldsResponse> {
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

      return await response.json() as DirectusFieldsResponse;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch fields: ${error.message}`);
      }
      throw error;
    }
  }
}
