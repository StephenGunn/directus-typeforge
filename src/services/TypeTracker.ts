import type { TypeDefinition } from "../types";

/**
 * Tracks and manages type definitions during the generation process
 */
export class TypeTracker {
  private types: Map<string, TypeDefinition>;

  constructor() {
    this.types = new Map();
  }

  /**
   * Adds a type definition to the tracker
   */
  addType(name: string, content: string, properties: string[]) {
    // Add default id field for Directus types if they're empty
    const isDirectusType = name.startsWith("Directus");
    if (isDirectusType && properties.length === 0) {
      // Most Directus types use string IDs except for specific cases
      const idType =
        name === "DirectusPermissions" || name === "DirectusOperations"
          ? "number"
          : "string";
      properties = ["id"];
      content = `export type ${name} = {\n  id: ${idType};\n};\n\n`;
    }
    this.types.set(name, { content, properties });
  }

  /**
   * Checks if a type has valid content
   */
  hasValidContent(name: string): boolean {
    const type = this.types.get(name);
    return type !== undefined && type.properties.length > 0;
  }

  /**
   * Returns all valid type definitions concatenated
   */
  getAllValidTypes(): string {
    return Array.from(this.types.values())
      .map((def) => def.content)
      .join("");
  }

  /**
   * Gets a specific type definition
   */
  getType(name: string): TypeDefinition | undefined {
    return this.types.get(name);
  }

  /**
   * Clears all tracked types
   */
  clear(): void {
    this.types.clear();
  }
}
