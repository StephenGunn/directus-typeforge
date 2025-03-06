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
    // For regular collections with no properties, add default id field
    if (properties.length === 0 && !name.startsWith("Directus")) {
      const idType = "string";
      properties = ["id"];
      content = `export type ${name} = {\n  id: ${idType};\n};\n\n`;
    }

    // For system collections, we'll keep whatever properties they have
    // Even if empty, it's useful for typing
    this.types.set(name, { content, properties });
  }

  /**
   * Checks if a type has valid content
   */
  hasValidContent(name: string): boolean {
    const type = this.types.get(name);

    // For system collections, they're valid even with no properties
    if (name.startsWith("Directus")) {
      return type !== undefined;
    }

    // For regular types, they need properties
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
   * Gets only the content string for a type
   */
  getTypeContent(name: string): string {
    return this.types.get(name)?.content || "";
  }

  /**
   * Checks if a type exists
   */
  hasType(name: string): boolean {
    return this.types.has(name);
  }

  /**
   * Gets all type names
   */
  getAllTypeNames(): string[] {
    return Array.from(this.types.keys());
  }

  /**
   * Clears all tracked types
   */
  clear(): void {
    this.types.clear();
  }
}
