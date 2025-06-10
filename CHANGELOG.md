# Changelog

## 0.15.0 (2025-06-10)

### Breaking Changes

- **Improved singular/plural handling**: Replaced custom `makeSingular()` implementation with the `pluralize` library to address irregular pluralization issues. This change improves accuracy for collection and type names but may generate different singular forms than previous versions.
  - Fixed cases like:
    - "cases" → "case" (previously "cas")
    - "addresses" → "address" (previously "addresse")
    - "wolves" → "wolf" (previously "wolv")
  - Any custom code relying on the specific behavior of the previous singular form implementation may need to be updated

### Migration Notes

- If you rely on specific type names in your codebase, review generated types after upgrading to ensure they match your expectations
- The new implementation handles irregular plurals correctly, which may change some type names from previous versions

## 0.14.5 (Previous release)

- Git ignore directus sync folder

## 0.14.4 

- Added support for directus_sync field special cases