import {
  DirectusSchemaSnapshot,
  GenerateTypeScriptOptions
} from "../types";
import { SystemFieldDetector } from "./SystemFieldDetector";
import { CoreSchemaProcessor } from "./CoreSchemaProcessor";

/**
 * Main schema processor entry point
 * Delegates to CoreSchemaProcessor for actual processing
 */
export class SchemaProcessor {
  private processor: CoreSchemaProcessor;
  
  constructor(
    snapshot: DirectusSchemaSnapshot, 
    options: GenerateTypeScriptOptions,
    systemFieldDetector?: SystemFieldDetector
  ) {
    this.processor = new CoreSchemaProcessor(snapshot, options, systemFieldDetector);
  }

  /**
   * Process the schema and generate TypeScript type definitions
   */
  process(): string {
    return this.processor.process();
  }
}