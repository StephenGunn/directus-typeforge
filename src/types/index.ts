import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";

export type ReadSpecFileOptions = {
  readonly specFile?: string;
  readonly host?: string;
  readonly email?: string;
  readonly password?: string;
};

export type GenerateTypeScriptOptions = {
  readonly typeName: string;
  useTypeReferences?: boolean;
};

export type TypeDefinition = {
  content: string;
  properties: string[];
};

export type ExtendedSchemaObject = OpenAPIV3.SchemaObject & {
  "x-collection"?: string;
  "x-singleton"?: boolean;
  "meta"?: {
    locked?: boolean;
  };
};

export type FieldItems = {
  oneOf?: { type: string; $ref: string }[];
  type?: string;
};

export type CollectionSchema = {
  ref: string;
  schema: OpenAPIV3.SchemaObject;
};
