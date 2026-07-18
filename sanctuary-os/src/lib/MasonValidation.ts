export function deepCountKeys(obj: any): number {
   let count = 0;
   if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      for (const k in obj) {
         if (k.startsWith('_meta')) continue;
         count += 1 + deepCountKeys(obj[k]);
      }
   }
   return count;
}

export function deepCompare(base: any, target: any, isLexicon: boolean): { missing: number, completelyMissing: number, deprecated: number } {
   let missing = 0;
   let completelyMissing = 0;
   let deprecated = 0;

   const isDynamicDictionary = (path: string) => {
      if (isLexicon) return false;
      return path === 'extensions.labels' || 
             path === 'extensions.parsers' || 
             path === 'taxonomy' ||
             path === 'magic_bytes';
   };

   const compare = (b: any, t: any, currentPath: string = '') => {
      if (b && typeof b === 'object' && !Array.isArray(b)) {
         for (const k in b) {
            if (k.startsWith('_meta')) continue;
            
            const nextPath = currentPath ? `${currentPath}.${k}` : k;

            if (!t || typeof t[k] === 'undefined') {
               if (!isDynamicDictionary(currentPath)) {
                  missing += 1 + deepCountKeys(b[k]);
                  completelyMissing += 1 + deepCountKeys(b[k]);
               }
            } else {
               if (
                  (typeof t[k] === 'string' && t[k] === "") || 
                  (Array.isArray(t[k]) && t[k].length === 0) || 
                  (typeof t[k] === 'object' && t[k] !== null && Object.keys(t[k]).length === 0) ||
                  (isLexicon && typeof t[k] !== 'string')
               ) {
                  if (!isDynamicDictionary(currentPath)) {
                     missing++;
                  }
               }
               compare(b[k], t[k], nextPath);
            }
         }
      }
   };

   const findDeprecated = (b: any, t: any, currentPath: string = '') => {
      if (t && typeof t === 'object' && !Array.isArray(t)) {
         for (const k in t) {
            if (k.startsWith('_meta')) continue;
            
            const nextPath = currentPath ? `${currentPath}.${k}` : k;

            if (!b || typeof b[k] === 'undefined') {
               if (!isDynamicDictionary(currentPath)) {
                  deprecated += 1 + deepCountKeys(t[k]);
               }
            } else {
               findDeprecated(b[k], t[k], nextPath);
            }
         }
      }
   };

   compare(base, target);
   findDeprecated(base, target);

   return { missing, completelyMissing, deprecated };
}

export function createEmptyClone(val: any): any {
   if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return "";
   if (Array.isArray(val)) return [];
   if (val && typeof val === 'object') {
      const obj: any = {};
      for (const k in val) {
         obj[k] = createEmptyClone(val[k]);
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
      return base;
   }
   
   const isDynamicDictionary = (path: string) => {
      if (isLexicon) return false;
      return path === 'extensions.labels' || 
             path === 'extensions.parsers' || 
             path === 'taxonomy' ||
             path === 'magic_bytes';
   };

   const result: any = { ...target };
   for (const k in base) {
      if (k.startsWith('_meta')) continue;
      
      const nextPath = currentPath ? `${currentPath}.${k}` : k;

      if (typeof target[k] === 'undefined') {
         if (!isDynamicDictionary(currentPath)) {
            if (isDynamicDictionary(nextPath)) {
               result[k] = {};
            } else {
               result[k] = createEmptyClone(base[k]);
            }
         }
      } else {
         if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            result[k] = deepAddMissing(base[k], target[k], isLexicon, nextPath);
         }
      }
   }
   return result;
}

export function deepPurgeDeprecated(base: any, target: any, isLexicon: boolean, currentPath: string = ''): any {
   if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return target;
   }
   
   const isDynamicDictionary = (path: string) => {
      if (isLexicon) return false;
      return path === 'extensions.labels' || 
             path === 'extensions.parsers' || 
             path === 'taxonomy' ||
             path === 'magic_bytes';
   };

   const result: any = {};
   for (const k in target) {
      if (k.startsWith('_meta')) {
         result[k] = target[k];
         continue;
      }
      
      const nextPath = currentPath ? `${currentPath}.${k}` : k;

      if (base && typeof base[k] !== 'undefined') {
         if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
            result[k] = deepPurgeDeprecated(base[k], target[k], isLexicon, nextPath);
         } else {
            result[k] = target[k];
         }
      } else {
         if (isDynamicDictionary(currentPath)) {
            result[k] = target[k];
         }
      }
   }
   return result;
}
