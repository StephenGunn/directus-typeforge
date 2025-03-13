import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";

export type ReadSpecFileOptions = {
  readonly specFile?: string;
  readonly host?: string;
  readonly email?: string;
  readonly password?: string;
  readonly token?: string; // Added token option for bearer authentication
};

export type GenerateTypeScriptOptions = {
  readonly typeName: string;
  useTypeReferences?: boolean;
  useTypes?: boolean;
};

export type TypeDefinition = {
  content: string;
  properties: string[];
};

export type ExtendedSchemaObject = OpenAPIV3.SchemaObject & {
  "x-collection"?: string;
  "x-singleton"?: boolean;
  "x-directus-type"?: string;
  "meta"?: {
    locked?: boolean;
  };
  "nullable"?: boolean;
  "required"?: boolean;
};

export type FieldItems = {
  oneOf?: { type: string; $ref: string }[];
  type?: string;
};

export type CollectionSchema = {
  ref: string;
  schema: OpenAPIV3.SchemaObject;
};
