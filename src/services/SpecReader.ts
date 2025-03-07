import { readFile } from "fs/promises";
import { z } from "zod";
import type { OpenAPIV3_1 as OpenAPIV3 } from "openapi-types";
import type { ReadSpecFileOptions } from "../types";

const DirectusAuthResponse = z.object({
  data: z.object({
    access_token: z.string(),
    expires: z.number().int(),
    refresh_token: z.string(),
  }),
});

/**
 * Handles reading OpenAPI specs from files or Directus API
 */
export class SpecReader {
  /**
   * Reads an OpenAPI spec from a file or fetches it from Directus
   */
  static async readSpec(
    options: ReadSpecFileOptions,
  ): Promise<OpenAPIV3.Document> {
    if (typeof options.specFile === "string") {
      return this.readFromFile(options.specFile);
    }

    if (!options.host) {
      throw new Error(
        "Either specFile must be specified or host must be provided.",
      );
    }

    // Use token if provided, otherwise use username/password
    if (options.token) {
      return this.fetchSpec(options.host, options.token);
    } else if (options.email && options.password) {
      const loginResponse = await this.authenticate(options);
      return this.fetchSpec(options.host, loginResponse.data.access_token);
    } else {
      throw new Error(
        "Either token or email and password must be provided for authentication.",
      );
    }
  }

  /**
   * Reads spec from a local file
   */
  private static async readFromFile(
    filePath: string,
  ): Promise<OpenAPIV3.Document> {
    const fileContent = await readFile(filePath, { encoding: "utf-8" });
    return JSON.parse(fileContent) as OpenAPIV3.Document;
  }

  /**
   * Authenticates with Directus server
   */
  private static async authenticate(options: ReadSpecFileOptions) {
    if (!options.host || !options.email || !options.password) {
      throw new Error(
        "Host, email, and password are required for authentication",
      );
    }

    const response = await fetch(new URL("/auth/login", options.host), {
      body: JSON.stringify({
        email: options.email,
        password: options.password,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.statusText}`);
    }

    const json = await response.json();
    return DirectusAuthResponse.parse(json);
  }

  /**
   * Fetches OpenAPI spec from Directus server
   */
  private static async fetchSpec(
    host: string,
    token: string,
  ): Promise<OpenAPIV3.Document> {
    const response = await fetch(new URL("/server/specs/oas", host), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }

    return response.json();
  }
}
