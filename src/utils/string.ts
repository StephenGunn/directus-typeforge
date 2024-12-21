/**
 * Converts a string to PascalCase.
 * Example: "hello_world" -> "HelloWorld"
 */
export const toPascalCase = (str: string): string =>
  str
    .replace(/[_\- ]+/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
