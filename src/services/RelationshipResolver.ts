import { DirectusRelation, RelationshipType } from "../types";
import { relationshipPatterns } from "../config";
import { logger } from "../utils/logger";

/**
 * Helper class for resolving relationships between collections,
 * especially focusing on alias fields that don't have explicit relationships
 */
export class RelationshipResolver {
  // Cache of normalized field and collection names for faster matching
  private normalizedNames = new Map<string, string>();

  constructor(
    private collections: string[], 
    private relations: DirectusRelation[],
    private existingRelationships: Map<string, Map<string, { 
      type: RelationshipType;
      relatedCollection: string;
      relatedType: string;
      throughJunction?: string;
    }>>
  ) {}

  /**
   * Find a related collection for an alias field using multiple strategies
   */
  resolveRelatedCollection(fieldName: string, collectionName: string, relationshipType: RelationshipType): string {
    logger.debug(`Resolving related collection for ${collectionName}.${fieldName}`);
    
    // Try multiple resolution strategies in order of reliability
    let resolvedCollection = this.findByExplicitRelation(fieldName, collectionName);
    
    if (!resolvedCollection) {
      resolvedCollection = this.findByNamePatterns(fieldName, collectionName);
    }
    
    if (!resolvedCollection) {
      resolvedCollection = this.findByRelationshipAnalysis(fieldName, collectionName, relationshipType);
    }
    
    if (!resolvedCollection) {
      resolvedCollection = this.findByNameSimilarity(fieldName, collectionName);
    }
    
    return resolvedCollection || '';
  }

  /**
   * METHOD 1: Find by explicit relation in schema
   */
  private findByExplicitRelation(fieldName: string, collectionName: string): string {
    logger.trace(`METHOD 1: Looking for explicit relation in schema`);
    
    // Look for relations that have this field as one_field
    for (const relation of this.relations) {
      if (relation.meta?.one_field === fieldName && 
          relation.related_collection === collectionName) {
        
        logger.trace(`Found relation with ${fieldName} as one_field: points to ${relation.collection}`);
        return relation.collection;
      }
    }
    
    logger.trace(`No explicit relation found`);
    return '';
  }

  /**
   * METHOD 2: Find by name patterns
   */
  private findByNamePatterns(fieldName: string, collectionName: string): string {
    logger.trace(`METHOD 2: Looking for matching collection by name patterns`);
    
    // 1. Exact match (field 'users' → collection 'users')
    if (this.collections.includes(fieldName)) {
      logger.trace(`Pattern 1: Field name directly matches collection: ${fieldName}`);
      return fieldName;
    }
    
    // 2. Singular form if field is plural (field 'users' → collection 'user') 
    if (fieldName.endsWith('s') && this.collections.includes(fieldName.slice(0, -1))) {
      const singularName = fieldName.slice(0, -1);
      logger.trace(`Pattern 2: Field name matches singular collection: ${singularName}`);
      return singularName;
    }
    
    // 3. Plural form if field is singular (field 'user' → collection 'users')
    if (this.collections.includes(`${fieldName}s`)) {
      const pluralName = `${fieldName}s`;
      logger.trace(`Pattern 3: Field name matches plural collection: ${pluralName}`);
      return pluralName;
    }
    
    // 4. Match against parent_fieldname pattern (field 'prices' in 'tickets' → collection 'ticket_prices')
    const singularCollection = collectionName.replace(/s$/, '');
    if (this.collections.includes(`${singularCollection}_${fieldName}`)) {
      const combined = `${singularCollection}_${fieldName}`;
      logger.trace(`Pattern 4: Collection exists with parent prefix: ${combined}`);
      return combined;
    }
    
    // 5. Match against fieldname_parent pattern (field 'tickets' in 'event' → collection 'event_tickets')
    if (this.collections.includes(`${fieldName}_${singularCollection}`)) {
      const combined = `${fieldName}_${singularCollection}`;
      logger.trace(`Pattern 5: Collection exists with field prefix: ${combined}`);
      return combined;
    }
    
    // 6. Look for any collection with fieldname as suffix
    const suffixPattern = new RegExp(`^\\w+_${fieldName}$`);
    const suffixMatches = this.collections.filter(c => suffixPattern.test(c));
    
    if (suffixMatches.length === 1) {
      logger.trace(`Pattern 6: Found collection with matching suffix pattern: ${suffixMatches[0]}`);
      return suffixMatches[0];
    }
    
    // 7. Look for any collection with fieldname as prefix
    const prefixPattern = new RegExp(`^${fieldName}_\\w+$`);
    const prefixMatches = this.collections.filter(c => prefixPattern.test(c));
    
    if (prefixMatches.length === 1) {
      logger.trace(`Pattern 7: Found collection with matching prefix pattern: ${prefixMatches[0]}`);
      return prefixMatches[0];
    }
    
    // 8. Handle fields representing a schedule, items, or schedule items
    if ((fieldName.includes('schedule') || fieldName.includes('item')) && 
        this.collections.some(c => c.includes('schedule') || c.includes('item'))) {
      
      // Look for collections that match both the parent collection and the schedule/items keywords
      const scheduleMatches = this.collections.filter(c => 
        (c.includes('schedule') || c.includes('item')) && 
        (c.includes(singularCollection) || singularCollection.includes(c.replace(/s$/, '')))
      );
      
      if (scheduleMatches.length > 0) {
        logger.trace(`Pattern 8: Found schedule/items collection: ${scheduleMatches[0]}`);
        return scheduleMatches[0];
      }
    }
    
    logger.trace(`No matching pattern found`);
    return '';
  }

  /**
   * METHOD 3: Find by analyzing existing relationships
   */
  private findByRelationshipAnalysis(fieldName: string, collectionName: string, relationshipType: RelationshipType): string {
    logger.trace(`METHOD 3: Looking for related collection by relationship analysis`);
    
    // For O2M fields, look at all M2O relationships to find collections that have an M2O pointing to this collection
    if (relationshipType === RelationshipType.OneToMany) {
      const potentialRelatedCollections: string[] = [];
      
      // Examine all relationships
      this.existingRelationships.forEach((fields, otherCollection) => {
        fields.forEach((relationship, otherField) => {
          // Look for M2O relationships that point to our collection
          if (relationship.type === RelationshipType.ManyToOne && 
              relationship.relatedCollection === collectionName) {
            potentialRelatedCollections.push(otherCollection);
            logger.trace(`Found M2O relationship from ${otherCollection}.${otherField} to ${collectionName}`);
          }
        });
      });
      
      // If we have exactly one matching collection, use it
      if (potentialRelatedCollections.length === 1) {
        logger.trace(`Found exactly one matching related collection: ${potentialRelatedCollections[0]}`);
        return potentialRelatedCollections[0];
      }
      
      // If we have multiple, try to find the best match by field name similarity
      if (potentialRelatedCollections.length > 1) {
        logger.trace(`Found multiple potential related collections: ${potentialRelatedCollections.join(', ')}`);
        
        // Try to find a collection that matches or contains the field name
        const matchingCollection = potentialRelatedCollections.find(c => 
          c === fieldName || 
          c.includes(fieldName) || 
          fieldName.includes(c.replace(/s$/, ''))
        );
        
        if (matchingCollection) {
          logger.trace(`Selected best match by name similarity: ${matchingCollection}`);
          return matchingCollection;
        }
        
        // Otherwise return the first one
        logger.trace(`No clear best match, using first: ${potentialRelatedCollections[0]}`);
        return potentialRelatedCollections[0];
      }
    }
    
    // For M2O fields, look at all O2M relationships to find collections that have an O2M pointing to this collection
    if (relationshipType === RelationshipType.ManyToOne) {
      const potentialRelatedCollections: string[] = [];
      
      // Examine all relationships
      this.existingRelationships.forEach((fields, otherCollection) => {
        fields.forEach((relationship, otherField) => {
          // Look for O2M relationships that point to our collection
          if (relationship.type === RelationshipType.OneToMany && 
              relationship.relatedCollection === collectionName) {
            potentialRelatedCollections.push(otherCollection);
            logger.trace(`Found O2M relationship from ${otherCollection}.${otherField} to ${collectionName}`);
          }
        });
      });
      
      // If we have exactly one matching collection, use it
      if (potentialRelatedCollections.length === 1) {
        logger.trace(`Found exactly one matching related collection: ${potentialRelatedCollections[0]}`);
        return potentialRelatedCollections[0];
      }
      
      // If we have multiple, try to find the best match by field name similarity
      if (potentialRelatedCollections.length > 1) {
        logger.trace(`Found multiple potential related collections: ${potentialRelatedCollections.join(', ')}`);
        
        // Try to find a collection that matches or contains the field name
        const matchingCollection = potentialRelatedCollections.find(c => 
          c === fieldName || 
          c.includes(fieldName) || 
          fieldName.includes(c.replace(/s$/, ''))
        );
        
        if (matchingCollection) {
          logger.trace(`Selected best match by name similarity: ${matchingCollection}`);
          return matchingCollection;
        }
        
        // Otherwise return the first one
        logger.trace(`No clear best match, using first: ${potentialRelatedCollections[0]}`);
        return potentialRelatedCollections[0];
      }
    }
    
    logger.trace(`No matching relationships found`);
    return '';
  }

  /**
   * METHOD 4: Find by name similarity for ambiguous cases
   */
  private findByNameSimilarity(fieldName: string, collectionName: string): string {
    logger.trace(`METHOD 4: Looking for related collection by name similarity`);
    
    // Handle common special cases based on field semantic meaning
    if (this.normalizedEquals(fieldName, 'ticket') || this.normalizedEquals(fieldName, 'registration')) {
      // Look for registration or ticket collections
      const registrationCollection = this.collections.find(c => 
        this.normalizedIncludes(c, 'registration') || 
        (this.normalizedIncludes(c, 'ticket') && !this.normalizedIncludes(c, 'price'))
      );
      
      if (registrationCollection) {
        logger.trace(`Found registration/ticket collection: ${registrationCollection}`);
        return registrationCollection;
      }
    }
    
    if (this.normalizedEquals(fieldName, 'price') || this.normalizedEquals(fieldName, 'prices')) {
      // Look for price collections
      const priceCollection = this.collections.find(c => 
        this.normalizedIncludes(c, 'price')
      );
      
      if (priceCollection) {
        logger.trace(`Found price collection: ${priceCollection}`);
        return priceCollection;
      }
    }
    
    if (this.normalizedEquals(fieldName, 'scheduled_items') || 
        this.normalizedEquals(fieldName, 'schedule') ||
        this.normalizedIncludes(fieldName, 'schedule')) {
      // Look for schedule collections
      const scheduleCollection = this.collections.find(c => 
        this.normalizedIncludes(c, 'schedule')
      );
      
      if (scheduleCollection) {
        logger.trace(`Found schedule collection: ${scheduleCollection}`);
        return scheduleCollection;
      }
    }
    
    // Score collections by similarity to field name
    const scoredCollections = this.collections.map(collection => {
      let score = 0;
      
      // Direct match
      if (this.normalizedEquals(collection, fieldName)) {
        score += 100;
      }
      
      // Collection contains field name
      if (this.normalizedIncludes(collection, fieldName)) {
        score += 50;
      }
      
      // Field name contains collection
      if (this.normalizedIncludes(fieldName, this.getNormalizedName(collection).replace(/s$/, ''))) {
        score += 30;
      }
      
      // Collection is plural of field name
      if (this.normalizedEquals(collection, `${this.getNormalizedName(fieldName)}s`)) {
        score += 40;
      }
      
      // Collection is singular of field name
      if (this.normalizedEquals(`${this.getNormalizedName(collection)}s`, fieldName)) {
        score += 40;
      }
      
      // Calculate longest common substring length
      let longestCommonLength = 0;
      const normalizedField = this.getNormalizedName(fieldName);
      const normalizedCollection = this.getNormalizedName(collection);
      
      for (let i = 0; i < normalizedField.length; i++) {
        for (let j = i + 1; j <= normalizedField.length; j++) {
          const substring = normalizedField.substring(i, j);
          if (substring.length > 2 && normalizedCollection.includes(substring)) {
            longestCommonLength = Math.max(longestCommonLength, substring.length);
          }
        }
      }
      
      score += longestCommonLength * 5;
      
      // Avoid self-relations
      if (collection === collectionName) {
        score = 0;
      }
      
      return { collection, score };
    });
    
    // Sort by score (highest first)
    scoredCollections.sort((a, b) => b.score - a.score);
    
    // Take the top match if it has a significant score
    if (scoredCollections.length > 0 && scoredCollections[0].score >= 30) {
      logger.trace(`Found related collection by name similarity: ${scoredCollections[0].collection} (score: ${scoredCollections[0].score})`);
      return scoredCollections[0].collection;
    }
    
    logger.trace(`No high-scoring similar collection found`);
    return '';
  }

  /**
   * Get normalized name for string comparison
   */
  private getNormalizedName(name: string): string {
    if (this.normalizedNames.has(name)) {
      return this.normalizedNames.get(name)!;
    }
    
    // Use configured patterns for name normalization
    const { PREFIXES_TO_REMOVE, SUFFIXES_TO_REMOVE } = relationshipPatterns.NAME_NORMALIZATION;
    
    // Create regex for prefixes and suffixes
    const prefixRegex = new RegExp(`^(${PREFIXES_TO_REMOVE.join('|')})`, '');
    const suffixRegex = new RegExp(`(${SUFFIXES_TO_REMOVE.join('|')})$`, '');
    
    const normalized = name
      .toLowerCase()
      .replace(prefixRegex, '') // Remove configured prefixes
      .replace(suffixRegex, '') // Remove configured suffixes  
      .replace(/s$/, '');       // Remove plural s
    
    this.normalizedNames.set(name, normalized);
    return normalized;
  }
  
  /**
   * Check if two strings are equal after normalization
   */
  private normalizedEquals(a: string, b: string): boolean {
    return this.getNormalizedName(a) === this.getNormalizedName(b);
  }
  
  /**
   * Check if a normalized string includes another normalized string
   */
  private normalizedIncludes(a: string, b: string): boolean {
    return this.getNormalizedName(a).includes(this.getNormalizedName(b));
  }
}