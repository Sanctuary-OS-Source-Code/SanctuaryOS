const isSchemaDynamicDictionary = (path: string, isLexicon: boolean): boolean => {
   if (isLexicon) return false;
   return (
      path === 'extensions.labels' ||
      path.startsWith('extensions.labels.') ||
      path === 'extensions.parsers' ||
      path.startsWith('extensions.parsers.') ||
      path === 'extensions.magic_bytes' ||
      path.startsWith('extensions.magic_bytes.') ||
      path === 'dlc_catalog' ||
      path.startsWith('dlc_catalog.') ||
      path === 'taxonomy' ||
      path.startsWith('taxonomy.') ||
      path === 'save_game_rules.magic_bytes' ||
      path.startsWith('save_game_rules.magic_bytes.')
   );
};

const isSchemaIgnoredRootKey = (k: string, currentPath: string, isLexicon: boolean): boolean => {
   if (currentPath === '' && k === '$schema') return true;
   if (isLexicon || currentPath !== '') return false;
   return (
      k === 'name' ||
      k === 'mod_categories' ||
      k === 'exception_rules' ||
      k === 'lab_verification' ||
      k === 'external_tools'
   );
};

export function deepCountKeys(obj: any, explicitIsLexicon?: boolean, currentPath: string = ''): number {
   const isLexicon =
      typeof explicitIsLexicon === 'boolean'
         ? explicitIsLexicon
         : Boolean(obj && typeof obj === 'object' && (obj._meta_lang || obj.term_mod || obj.save));

   let count = 0;
   if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k in obj) {
         if (k.startsWith('_meta')) continue;
         if (k === 'schema_version') continue;
         if (isSchemaIgnoredRootKey(k, currentPath, isLexicon)) continue;
         const nextPath = currentPath ? `${currentPath}.${k}` : k;
         if (isSchemaDynamicDictionary(nextPath, isLexicon)) {
            count += 1;
         } else {
            count += 1 + deepCountKeys(obj[k], isLexicon, nextPath);
         }
      }
   }
   return count;
}

const isLexiconDynamicDomainKey = (k: string): boolean => {
   return (
      k.startsWith('icon_') ||
      k.startsWith('term_') ||
      k.startsWith('class_dd_') ||
      k.startsWith('vault_sub_') ||
      k.startsWith('dlc_type_')
   );
};

export function deepCompare(base: any, target: any, isLexicon: boolean): { missing: number, completelyMissing: number, deprecated: number } {
   let missing = 0;
   let completelyMissing = 0;
   let deprecated = 0;

   const compare = (b: any, t: any, currentPath: string = '') => {
      if (b && typeof b === 'object' && !Array.isArray(b)) {
         for (const k in b) {
            if (k.startsWith('_meta')) continue;
            if (k === 'schema_version') continue;
            if (isSchemaIgnoredRootKey(k, currentPath, isLexicon)) continue;

            const nextPath = currentPath ? `${currentPath}.${k}` : k;

            const isTargetKeyAbsent = !t || !(k in t) || typeof t[k] === 'undefined';

            if (isTargetKeyAbsent) {
               // Sparse delta lexicons inherit omitted keys from en-default automatically
               if (isLexicon) continue;

               if (currentPath === '' && k === 'display_name' && t && typeof t.name === 'string' && t.name.trim() !== '') {
                  continue;
               }
               if (!isSchemaDynamicDictionary(currentPath, isLexicon)) {
                  const subCount = isSchemaDynamicDictionary(nextPath, isLexicon)
                     ? 1
                     : 1 + deepCountKeys(b[k], isLexicon, nextPath);
                  missing += subCount;
                  completelyMissing += subCount;
               }
            } else if (isLexicon) {
               if (t[k] === null || typeof t[k] !== 'string' || t[k].trim() === '') {
                  missing++;
               }
            } else {
               // Schema mode: verify structural type compatibility for nested objects
               const bIsPlainObj = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]);
               const tIsPlainObj = t[k] && typeof t[k] === 'object' && !Array.isArray(t[k]);
               if (bIsPlainObj && !tIsPlainObj) {
                  if (!isSchemaDynamicDictionary(nextPath, isLexicon)) {
                     const subCount = 1 + deepCountKeys(b[k], isLexicon, nextPath);
                     missing += subCount;
                     completelyMissing += subCount;
                  }
               } else if (bIsPlainObj && tIsPlainObj && !isSchemaDynamicDictionary(nextPath, isLexicon)) {
                  compare(b[k], t[k], nextPath);
               }
            }
         }
      }
   };

   const findDeprecated = (b: any, t: any, currentPath: string = '') => {
      if (t && typeof t === 'object' && !Array.isArray(t)) {
         for (const k in t) {
            if (k.startsWith('_meta')) continue;
            if (k === 'schema_version') continue;
            if (isSchemaIgnoredRootKey(k, currentPath, isLexicon)) continue;
            if (isLexicon && isLexiconDynamicDomainKey(k)) {
               if (!k.startsWith('term_') && !k.startsWith('icon_') && b && typeof b[k] === 'string' && t[k] === b[k]) {
                  deprecated += 1;
               }
               continue;
            }

            const nextPath = currentPath ? `${currentPath}.${k}` : k;

            if (!b || typeof b[k] === 'undefined') {
               if (!isSchemaDynamicDictionary(currentPath, isLexicon)) {
                  const subCount = isSchemaDynamicDictionary(nextPath, isLexicon)
                     ? 1
                     : 1 + deepCountKeys(t[k], isLexicon, nextPath);
                  deprecated += subCount;
               }
            } else if (isLexicon && currentPath === '' && typeof b[k] === 'string' && t[k] === b[k]) {
               deprecated += 1;
            } else if (!isSchemaDynamicDictionary(nextPath, isLexicon)) {
               findDeprecated(b[k], t[k], nextPath);
            }
         }
      }
   };

   compare(base, target);
   findDeprecated(base, target);

   return { missing, completelyMissing, deprecated };
}

export function createEmptyClone(val: any, isLexicon: boolean = false): any {
   if (isLexicon) {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return "";
   } else {
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
   }
   if (Array.isArray(val)) return isLexicon ? [] : JSON.parse(JSON.stringify(val));
   if (val && typeof val === 'object') {
      const obj: any = {};
      for (const k in val) {
         obj[k] = createEmptyClone(val[k], isLexicon);
      }
      return obj;
   }
   return null;
}

export function deepAddMissing(base: any, target: any, isLexicon: boolean, currentPath: string = ''): any {
   if (!base || typeof base !== 'object' || Array.isArray(base)) {
      return base;
   }
   if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return createEmptyClone(base, isLexicon);
   }

   const result: any = { ...target };
   for (const k in base) {
      if (k.startsWith('_meta')) continue;
      if (k === 'schema_version') continue;
      if (isSchemaIgnoredRootKey(k, currentPath, isLexicon)) continue;

      const nextPath = currentPath ? `${currentPath}.${k}` : k;

      const isTargetKeyMissing = !(k in target) || typeof target[k] === 'undefined' || (isLexicon && target[k] === null);

      if (isTargetKeyMissing) {
         if (!isLexicon && currentPath === '' && k === 'display_name' && typeof target.name === 'string' && target.name.trim() !== '') {
            result[k] = target.name;
            continue;
         }
         if (!isSchemaDynamicDictionary(currentPath, isLexicon)) {
            if (isSchemaDynamicDictionary(nextPath, isLexicon)) {
               result[k] = isLexicon ? {} : JSON.parse(JSON.stringify(base[k] || {}));
            } else {
               result[k] = createEmptyClone(base[k], isLexicon);
            }
         }
      } else {
         if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            if (target[k] === null && !isLexicon && !isSchemaDynamicDictionary(nextPath, isLexicon)) {
               result[k] = createEmptyClone(base[k], isLexicon);
            } else {
               result[k] = deepAddMissing(base[k], target[k], isLexicon, nextPath);
            }
         }
      }
   }
   return result;
}

export function deepPurgeDeprecated(base: any, target: any, isLexicon: boolean, currentPath: string = ''): any {
   if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return target;
   }

   const result: any = {};
   for (const k in target) {
      if (k.startsWith('_meta')) {
         result[k] = target[k];
         continue;
      }
      if (k === 'schema_version') {
         result[k] = target[k];
         continue;
      }
      if (!isLexicon && currentPath === '' && k === 'external_tools') {
         continue;
      }
      if (isSchemaIgnoredRootKey(k, currentPath, isLexicon)) {
         result[k] = target[k];
         continue;
      }
      if (isLexicon && (target[k] === "" || target[k] === null || target[k] === undefined || (typeof target[k] === "string" && target[k].trim() === ""))) {
         continue;
      }
      if (isLexicon && isLexiconDynamicDomainKey(k)) {
         if (!k.startsWith('term_') && !k.startsWith('icon_') && base && typeof base[k] === 'string' && target[k] === base[k]) {
            continue;
         }
         result[k] = target[k];
         continue;
      }

      const nextPath = currentPath ? `${currentPath}.${k}` : k;

      if (base && typeof base[k] !== 'undefined') {
         if (isLexicon && currentPath === '' && typeof base[k] === 'string' && target[k] === base[k]) {
            continue;
         }
         if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            result[k] = deepPurgeDeprecated(base[k], target[k], isLexicon, nextPath);
         } else {
            result[k] = target[k];
         }
      } else {
         if (isSchemaDynamicDictionary(currentPath, isLexicon)) {
            result[k] = target[k];
         }
      }
   }
   return result;
}
