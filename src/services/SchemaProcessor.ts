import {
  DirectusSchemaSnapshot,
  GenerateTypeScriptOptions
} from "../types";
import { CoreSchemaProcessor } from "./CoreSchemaProcessor";

/**
 * Main schema processor entry point
 * Delegates to CoreSchemaProcessor for actual processing
 */
export class SchemaProcessor {
  private processor: CoreSchemaProcessor;
  
  constructor(
    snapshot: DirectusSchemaSnapshot, 
    options: GenerateTypeScriptOptions
  ) {
    this.processor = new CoreSchemaProcessor(snapshot, options);
  }

  /**
   * Process the schema and generate TypeScript type definitions
   */
  process(): string {
    return this.processor.process();
  }
}