export type WorkbenchFormatKind = 'json' | 'jsonc' | 'ini' | 'toml' | 'yaml' | 'xml';

export interface FormatValidationProblem {
   line: number;
   column: number;
   message: string;
}

export function isSanctuaryTemplateObject(obj: any): boolean {
   const candidate = Array.isArray(obj) ? obj[0] : obj;
   return Boolean(
      candidate &&
      typeof candidate === 'object' &&
      typeof candidate.template_id === 'string' &&
      typeof candidate.target_file === 'string' &&
      Array.isArray(candidate.settings)
   );
}

export function isSanctuaryTemplateFileName(fileName?: string | null): boolean {
   if (!fileName) return false;
   return fileName.toLowerCase().endsWith('.sanctuary.template.json');
}

export function stripJsonCommentsAndTrailingCommas(input: string): string {
   let out = '';
   let inString = false;
   let stringChar = '"';
   let i = 0;
   const len = input.length;

   while (i < len) {
      const ch = input[i];
      const next = i + 1 < len ? input[i + 1] : '';

      if (inString) {
         out += ch;
         if (ch === '\\' && i + 1 < len) {
            out += input[i + 1];
            i += 2;
            continue;
         }
         if (ch === stringChar) {
            inString = false;
         }
         i++;
         continue;
      }

      if (ch === '"') {
         inString = true;
         stringChar = ch;
         out += ch;
         i++;
         continue;
      }

      // Single-line // comment -> replace with spaces to preserve character offsets & line numbers
      if (ch === '/' && next === '/') {
         out += '  ';
         i += 2;
         while (i < len && input[i] !== '\n') {
            out += input[i] === '\r' ? '\r' : ' ';
            i++;
         }
         continue;
      }

      // Multi-line /* ... */ comment -> replace non-newlines with spaces to preserve offsets & lines
      if (ch === '/' && next === '*') {
         out += '  ';
         i += 2;
         while (i < len && !(input[i] === '*' && input[i + 1] === '/')) {
            out += input[i] === '\n' || input[i] === '\r' ? input[i] : ' ';
            i++;
         }
         if (i < len) {
            out += '  ';
            i += 2;
         }
         continue;
      }

      out += ch;
      i++;
   }

   // Strip trailing commas before ] or } while preserving whitespace length
   return out.replace(/,(\s*[\]}])/g, ' $1');
}

export function isSanctuaryTemplateFile(
   file?: { name?: string; path?: string; isTemplate?: boolean } | null,
   parsedOrRaw?: any
): boolean {
   if (!file) return false;
   if (typeof file.isTemplate === 'boolean') return file.isTemplate;
   const nameOrPath = file.name || file.path || '';
   if (isSanctuaryTemplateFileName(nameOrPath)) return true;

   if (parsedOrRaw !== undefined && parsedOrRaw !== null) {
      if (typeof parsedOrRaw === 'string') {
         if (nameOrPath.toLowerCase().endsWith('.json')) {
            try {
               const cleaned = stripJsonCommentsAndTrailingCommas(parsedOrRaw);
               return isSanctuaryTemplateObject(JSON.parse(cleaned));
            } catch {
               return false;
            }
         }
         return false;
      }
      return isSanctuaryTemplateObject(parsedOrRaw);
   }
   return false;
}

export function detectWorkbenchFormat(fileName?: string | null, rawText?: string): WorkbenchFormatKind {
   const lower = (fileName || '').toLowerCase();
   if (lower.endsWith('.jsonc')) return 'jsonc';
   if (lower.endsWith('.json')) return 'json';
   if (lower.endsWith('.toml')) return 'toml';
   if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
   if (lower.endsWith('.xml') || lower.endsWith('.lsx') || lower.endsWith('.plist') || lower.endsWith('.config') || lower.endsWith('.xaml')) {
      return 'xml';
   }
   if (lower.endsWith('.ini') || lower.endsWith('.cfg') || lower.endsWith('.conf') || lower.endsWith('.properties') || lower.endsWith('.txt')) {
      return 'ini';
   }

   const trimmed = (rawText || '').trim();
   if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      if (/^\[\s*[A-Za-z0-9_.-]+\s*\](\r?\n|$)/.test(trimmed)) {
         return 'ini';
      }
      return 'jsonc';
   }
   if (trimmed.startsWith('<')) return 'xml';
   return 'ini';
}

export function detectMonacoLanguage(fileName?: string | null, rawText?: string): string {
   const fmt = detectWorkbenchFormat(fileName, rawText);
   switch (fmt) {
      case 'json':
      case 'jsonc':
         return 'json';
      case 'xml':
         return 'xml';
      case 'yaml':
         return 'yaml';
      case 'toml':
      case 'ini':
      default:
         return 'ini';
   }
}

export function parseScalarValue(rawVal: string): any {
   let valStr = rawVal.trim();
   // Strip unquoted inline comment (# or ;)
   if (!(valStr.startsWith('"') && valStr.endsWith('"')) && !(valStr.startsWith("'") && valStr.endsWith("'"))) {
      const commentIdx = valStr.search(/\s+[#;]/);
      if (commentIdx >= 0) {
         valStr = valStr.slice(0, commentIdx).trim();
      }
   }
   if (valStr.toLowerCase() === 'true') return true;
   if (valStr.toLowerCase() === 'false') return false;
   if (valStr !== '' && /^-?\d+(?:\.\d+)?$/.test(valStr)) {
      const n = Number(valStr);
      if (!Number.isNaN(n)) return n;
   }
   if (
      (valStr.startsWith('"') && valStr.endsWith('"') && valStr.length >= 2) ||
      (valStr.startsWith("'") && valStr.endsWith("'") && valStr.length >= 2)
   ) {
      return valStr.slice(1, -1);
   }
   if (valStr.startsWith('[') && valStr.endsWith(']')) {
      try {
         return JSON.parse(valStr.replace(/'/g, '"'));
      } catch {
         return valStr;
      }
   }
   return valStr;
}

/**
 * Parses `.ini` / `.cfg` files while preserving `[Section]` scoping.
 * Settings inside `[Section]` are keyed as `Section::Key`; root settings are keyed as `Key`.
 */
export function parseSectionedIni(content: string): { data: Record<string, any>; problems: FormatValidationProblem[] } {
   const obj: Record<string, any> = {};
   const problems: FormatValidationProblem[] = [];
   const lines = (content || '').split('\n');
   let currentSection = '';

   for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx];
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')) {
         continue;
      }

      const sectionMatch = trimmed.match(/^\[([^\]]*)\](?:\s*[#;].*)?$/);
      if (sectionMatch) {
         const secName = sectionMatch[1].trim();
         if (!secName) {
            problems.push({ line: idx + 1, column: 1, message: 'Empty [Section] header.' });
         } else {
            currentSection = secName;
         }
         continue;
      }

      if (trimmed.startsWith('[') && !trimmed.includes(']')) {
         problems.push({ line: idx + 1, column: 1, message: 'Unclosed [Section] header.' });
         continue;
      }

      const kvMatch = rawLine.match(/^\s*([^#;=\[\]]+?)\s*=\s*(.*)$/);
      if (kvMatch) {
         const rawKey = kvMatch[1].trim();
         const compositeKey = currentSection ? `${currentSection}::${rawKey}` : rawKey;
         obj[compositeKey] = parseScalarValue(kvMatch[2]);
      }
   }

   return { data: obj, problems };
}

/**
 * Serializes modified settings back into an `.ini` / `.cfg` document while preserving
 * `[Section]` headers, comments, indentation, quoting, and inserting new keys under their `[Section]`.
 */
export function stringifySectionedIni(data: Record<string, any>, originalContent: string): string {
   const lines = (originalContent || '').split('\n');
   const updatedKeys = new Set<string>();
   const newLines: string[] = [];
   const sectionLastLineMap = new Map<string, number>();
   let firstSectionLineIdx = -1;
   let currentSection = '';

   const formatScalarForLine = (val: any, originalRhs?: string): string => {
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'boolean' || typeof val === 'number') return String(val);
      const strVal = String(val ?? '');
      if (originalRhs !== undefined) {
         const trimmedOrig = originalRhs.trim();
         if (trimmedOrig.startsWith('"') && trimmedOrig.endsWith('"')) {
            return `"${strVal}"`;
         }
         if (trimmedOrig.startsWith("'") && trimmedOrig.endsWith("'")) {
            return `'${strVal}'`;
         }
      }
      return strVal;
   };

   for (const line of lines) {
      const trimmed = line.trim();
      const sectionMatch = trimmed.match(/^\[([^\]]+)\](?:\s*[#;].*)?$/);
      if (sectionMatch) {
         currentSection = sectionMatch[1].trim();
         if (firstSectionLineIdx === -1) {
            firstSectionLineIdx = newLines.length;
         }
         newLines.push(line);
         sectionLastLineMap.set(currentSection, newLines.length - 1);
         continue;
      }

      const kvMatch = line.match(/^(\s*)([^#;=\[\]]+?)(\s*=\s*)(.*)$/);
      if (kvMatch && !trimmed.startsWith('#') && !trimmed.startsWith(';') && !trimmed.startsWith('//')) {
         const indent = kvMatch[1];
         const rawKey = kvMatch[2].trim();
         const sep = kvMatch[3];
         const rhs = kvMatch[4];
         const compositeKey = currentSection ? `${currentSection}::${rawKey}` : rawKey;

         const hasComposite = Object.prototype.hasOwnProperty.call(data, compositeKey);
         const hasFallbackBare = !currentSection && Object.prototype.hasOwnProperty.call(data, rawKey);

         if (hasComposite || hasFallbackBare) {
            const nextVal = hasComposite ? data[compositeKey] : data[rawKey];
            // Preserve inline trailing comment if unquoted
            let trailingComment = '';
            const trimmedRhs = rhs.trim();
            if (!(trimmedRhs.startsWith('"') && trimmedRhs.endsWith('"')) && !(trimmedRhs.startsWith("'") && trimmedRhs.endsWith("'"))) {
               const commentMatch = rhs.match(/(\s+[#;].*)$/);
               if (commentMatch) trailingComment = commentMatch[1];
            }
            const formattedVal = formatScalarForLine(nextVal, rhs);
            newLines.push(`${indent}${rawKey}${sep}${formattedVal}${trailingComment}`);
            updatedKeys.add(compositeKey);
            if (!currentSection) updatedKeys.add(rawKey);
         } else {
            newLines.push(line);
         }
         if (currentSection) {
            sectionLastLineMap.set(currentSection, newLines.length - 1);
         }
         continue;
      }

      newLines.push(line);
   }

   // Group any newly added keys by section so sections are never flattened
   const pendingRoot: string[] = [];
   const pendingBySection = new Map<string, string[]>();

   for (const [fullKey, val] of Object.entries(data || {})) {
      if (updatedKeys.has(fullKey) || val === undefined || (typeof val === 'object' && val !== null && !Array.isArray(val))) {
         continue;
      }
      const sepIdx = fullKey.indexOf('::');
      if (sepIdx > 0) {
         const sec = fullKey.slice(0, sepIdx);
         const rawKey = fullKey.slice(sepIdx + 2);
         const list = pendingBySection.get(sec) || [];
         list.push(`${rawKey}=${formatScalarForLine(val)}`);
         pendingBySection.set(sec, list);
      } else {
         pendingRoot.push(`${fullKey}=${formatScalarForLine(val)}`);
      }
   }

   // Insert pending keys into existing sections (from bottom to top so line indices remain valid)
   const existingSectionInsertions: Array<{ insertAfter: number; linesToInsert: string[] }> = [];
   const brandNewSections: Array<{ section: string; linesToInsert: string[] }> = [];

   for (const [sec, kvLines] of pendingBySection.entries()) {
      const lastLine = sectionLastLineMap.get(sec);
      if (lastLine !== undefined) {
         existingSectionInsertions.push({ insertAfter: lastLine, linesToInsert: kvLines });
      } else {
         brandNewSections.push({ section: sec, linesToInsert: kvLines });
      }
   }

   existingSectionInsertions.sort((a, b) => b.insertAfter - a.insertAfter);
   for (const item of existingSectionInsertions) {
      newLines.splice(item.insertAfter + 1, 0, ...item.linesToInsert);
   }

   if (pendingRoot.length > 0) {
      if (firstSectionLineIdx >= 0) {
         newLines.splice(firstSectionLineIdx, 0, ...pendingRoot, '');
      } else {
         if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
            newLines.push(...pendingRoot);
         } else {
            newLines.push(...pendingRoot);
         }
      }
   }

   for (const item of brandNewSections) {
      if (newLines.length > 0 && newLines[newLines.length - 1].trim() !== '') {
         newLines.push('');
      }
      newLines.push(`[${item.section}]`, ...item.linesToInsert);
   }

   return newLines.join('\n');
}

/**
 * Parses `.toml` files into nested objects (supporting `[table.subtable]`, scalars, arrays) with validation.
 */
export function parseTomlConfig(content: string): { data: Record<string, any>; problems: FormatValidationProblem[] } {
   const root: Record<string, any> = {};
   const problems: FormatValidationProblem[] = [];
   const lines = (content || '').split('\n');
   let currentTarget: Record<string, any> = root;

   const ensureTablePath = (segments: string[]): Record<string, any> => {
      let cursor = root;
      for (const seg of segments) {
         const cleanSeg = seg.replace(/^["']|["']$/g, '').trim();
         if (!cleanSeg) continue;
         if (!cursor[cleanSeg] || typeof cursor[cleanSeg] !== 'object' || Array.isArray(cursor[cleanSeg])) {
            cursor[cleanSeg] = {};
         }
         cursor = cursor[cleanSeg];
      }
      return cursor;
   };

   for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const arrayTableMatch = trimmed.match(/^\[\[([^\]]+)\]\]\s*(?:#.*)?$/);
      if (arrayTableMatch) {
         const segs = arrayTableMatch[1].split('.');
         currentTarget = ensureTablePath(segs);
         continue;
      }

      const tableMatch = trimmed.match(/^\[([^\]]+)\]\s*(?:#.*)?$/);
      if (tableMatch) {
         const segs = tableMatch[1].split('.');
         currentTarget = ensureTablePath(segs);
         continue;
      }

      if (trimmed.startsWith('[')) {
         problems.push({ line: idx + 1, column: 1, message: 'Malformed TOML [table] header.' });
         continue;
      }

      const kvMatch = trimmed.match(/^([A-Za-z0-9_."-]+?)\s*=\s*(.+)$/);
      if (!kvMatch) {
         problems.push({ line: idx + 1, column: 1, message: `Invalid TOML statement: "${trimmed.slice(0, 48)}"` });
         continue;
      }

      const keyPath = kvMatch[1].trim().split('.');
      const rawRhs = kvMatch[2].trim();
      const quoteCount = (rawRhs.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) {
         problems.push({ line: idx + 1, column: line.indexOf('=') + 2, message: 'Unclosed double-quoted TOML string.' });
         continue;
      }

      let cursor = currentTarget;
      for (let k = 0; k < keyPath.length - 1; k++) {
         const part = keyPath[k].replace(/^["']|["']$/g, '');
         if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
         cursor = cursor[part];
      }
      const leafKey = keyPath[keyPath.length - 1].replace(/^["']|["']$/g, '');
      cursor[leafKey] = parseScalarValue(rawRhs);
   }

   return { data: root, problems };
}

export function stringifyTomlConfig(data: Record<string, any>): string {
   const out: string[] = [];

   const formatTomlValue = (val: any): string => {
      if (typeof val === 'boolean' || typeof val === 'number') return String(val);
      if (Array.isArray(val)) return `[${val.map(formatTomlValue).join(', ')}]`;
      return JSON.stringify(String(val ?? ''));
   };

   const emitTable = (obj: Record<string, any>, tablePath: string[]) => {
      const scalars: Array<[string, any]> = [];
      const subtables: Array<[string, Record<string, any>]> = [];

      for (const [k, v] of Object.entries(obj || {})) {
         if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            subtables.push([k, v]);
         } else if (v !== undefined) {
            scalars.push([k, v]);
         }
      }

      if (tablePath.length > 0 && (scalars.length > 0 || subtables.length === 0)) {
         if (out.length > 0) out.push('');
         out.push(`[${tablePath.join('.')}]`);
      }

      for (const [k, v] of scalars) {
         const safeKey = /^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k);
         out.push(`${safeKey} = ${formatTomlValue(v)}`);
      }

      for (const [k, sub] of subtables) {
         emitTable(sub, [...tablePath, k]);
      }
   };

   emitTable(data, []);
   return out.join('\n') + '\n';
}

/**
 * Parses `.yaml` / `.yml` config mappings & scalars with syntax validation.
 */
export function parseYamlConfig(content: string): { data: Record<string, any>; problems: FormatValidationProblem[] } {
   const root: Record<string, any> = {};
   const problems: FormatValidationProblem[] = [];
   const lines = (content || '').split('\n');
   const stack: Array<{ indent: number; obj: Record<string, any>; lastKey?: string }> = [{ indent: -1, obj: root }];

   for (let idx = 0; idx < lines.length; idx++) {
      const rawLine = lines[idx].replace(/\r$/, '');
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') continue;

      if (/^\t+/.test(rawLine)) {
         problems.push({ line: idx + 1, column: 1, message: 'YAML indentation must use spaces rather than tabs.' });
         continue;
      }

      const indentMatch = rawLine.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1].length : 0;

      // List item under previous key
      if (trimmed.startsWith('- ')) {
         while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
            stack.pop();
         }
         const top = stack[stack.length - 1];
         if (top.lastKey) {
            if (!Array.isArray(top.obj[top.lastKey])) {
               top.obj[top.lastKey] = [];
            }
            top.obj[top.lastKey].push(parseScalarValue(trimmed.slice(2)));
         }
         continue;
      }

      const colonIdx = trimmed.indexOf(':');
      if (colonIdx <= 0) {
         problems.push({ line: idx + 1, column: indent + 1, message: `Expected "key: value" mapping in YAML line.` });
         continue;
      }

      const rawKey = trimmed.slice(0, colonIdx).trim().replace(/^["']|["']$/g, '');
      const rhs = trimmed.slice(colonIdx + 1).trim();

      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
         stack.pop();
      }
      const parent = stack[stack.length - 1];

      if (!rhs || rhs.startsWith('#')) {
         const childObj: Record<string, any> = {};
         parent.obj[rawKey] = childObj;
         parent.lastKey = rawKey;
         stack.push({ indent, obj: childObj });
      } else {
         parent.obj[rawKey] = parseScalarValue(rhs);
         parent.lastKey = rawKey;
      }
   }

   return { data: root, problems };
}

export function stringifyYamlConfig(data: Record<string, any>, indentLevel = 0): string {
   const pad = '  '.repeat(indentLevel);
   const lines: string[] = [];

   const formatYamlScalar = (val: any): string => {
      if (typeof val === 'boolean' || typeof val === 'number') return String(val);
      const s = String(val ?? '');
      if (s === '' || /[:#\[\]{}&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) {
         return JSON.stringify(s);
      }
      return s;
   };

   for (const [k, v] of Object.entries(data || {})) {
      if (v === undefined) continue;
      if (Array.isArray(v)) {
         if (v.length === 0) {
            lines.push(`${pad}${k}: []`);
         } else {
            lines.push(`${pad}${k}:`);
            for (const item of v) {
               lines.push(`${pad}  - ${formatYamlScalar(item)}`);
            }
         }
      } else if (v !== null && typeof v === 'object') {
         lines.push(`${pad}${k}:`);
         const nested = stringifyYamlConfig(v, indentLevel + 1);
         if (nested) lines.push(nested);
      } else {
         lines.push(`${pad}${k}: ${formatYamlScalar(v)}`);
      }
   }

   return lines.join('\n');
}

/**
 * Validates and parses XML config files via DOMParser into structured key-value paths.
 */
export function parseXmlConfig(content: string): { data: Record<string, any>; problems: FormatValidationProblem[] } {
   const trimmed = (content || '').trim();
   if (!trimmed) return { data: {}, problems: [] };

   if (typeof DOMParser === 'undefined') {
      return { data: {}, problems: [] };
   }

   const parser = new DOMParser();
   const doc = parser.parseFromString(content, 'application/xml');
   const errNode = doc.querySelector('parsererror');
   if (errNode) {
      const errText = errNode.textContent || 'Invalid XML syntax.';
      const lineMatch = errText.match(/line\s+(\d+)/i);
      const colMatch = errText.match(/column\s+(\d+)/i);
      return {
         data: {},
         problems: [{
            line: lineMatch ? parseInt(lineMatch[1], 10) : 1,
            column: colMatch ? parseInt(colMatch[1], 10) : 1,
            message: errText.replace(/\s+/g, ' ').trim().slice(0, 180)
         }]
      };
   }

   const result: Record<string, any> = {};
   const walkElement = (el: Element, target: Record<string, any>) => {
      for (const attr of Array.from(el.attributes)) {
         target[`@${attr.name}`] = parseScalarValue(attr.value);
      }
      const children = Array.from(el.children);
      if (children.length === 0) {
         const text = (el.textContent || '').trim();
         if (el.attributes.length === 0) {
            return parseScalarValue(text);
         }
         if (text) {
            target['#text'] = parseScalarValue(text);
         }
         return target;
      }

      const tagCounts = new Map<string, number>();
      for (const c of children) {
         tagCounts.set(c.tagName, (tagCounts.get(c.tagName) || 0) + 1);
      }
      const seenIdx = new Map<string, number>();

      for (const c of children) {
         const idAttr = c.getAttribute('id') || c.getAttribute('key') || c.getAttribute('name');
         let childKey = c.tagName;
         if ((tagCounts.get(c.tagName) || 0) > 1) {
            const idx = seenIdx.get(c.tagName) || 0;
            seenIdx.set(c.tagName, idx + 1);
            childKey = idAttr ? `${c.tagName}[${idAttr}]` : `${c.tagName}[${idx}]`;
         }
         const childObj: Record<string, any> = {};
         target[childKey] = walkElement(c, childObj);
      }
      return target;
   };

   if (doc.documentElement) {
      const rootObj: Record<string, any> = {};
      result[doc.documentElement.tagName] = walkElement(doc.documentElement, rootObj);
   }

   return { data: result, problems: [] };
}

export function stringifyXmlFromModifiedData(data: Record<string, any>, originalContent: string): string {
   if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
      return originalContent;
   }
   const parser = new DOMParser();
   const doc = parser.parseFromString(originalContent, 'application/xml');
   if (doc.querySelector('parsererror') || !doc.documentElement) {
      return originalContent;
   }

   const applyElement = (el: Element, nodeVal: any) => {
      if (nodeVal === undefined || nodeVal === null) return;
      if (typeof nodeVal !== 'object' || Array.isArray(nodeVal)) {
         el.textContent = String(nodeVal);
         return;
      }
      for (const [k, v] of Object.entries(nodeVal)) {
         if (k.startsWith('@')) {
            el.setAttribute(k.slice(1), String(v ?? ''));
         } else if (k === '#text') {
            el.textContent = String(v ?? '');
         }
      }
      const children = Array.from(el.children);
      const tagCounts = new Map<string, number>();
      for (const c of children) {
         tagCounts.set(c.tagName, (tagCounts.get(c.tagName) || 0) + 1);
      }
      const seenIdx = new Map<string, number>();
      for (const c of children) {
         const idAttr = c.getAttribute('id') || c.getAttribute('key') || c.getAttribute('name');
         let childKey = c.tagName;
         if ((tagCounts.get(c.tagName) || 0) > 1) {
            const idx = seenIdx.get(c.tagName) || 0;
            seenIdx.set(c.tagName, idx + 1);
            childKey = idAttr ? `${c.tagName}[${idAttr}]` : `${c.tagName}[${idx}]`;
         }
         if (Object.prototype.hasOwnProperty.call(nodeVal, childKey)) {
            applyElement(c, nodeVal[childKey]);
         }
      }
   };

   const rootTag = doc.documentElement.tagName;
   if (data && Object.prototype.hasOwnProperty.call(data, rootTag)) {
      applyElement(doc.documentElement, data[rootTag]);
   }
   return new XMLSerializer().serializeToString(doc);
}

export function parseStructuredConfig(
   content: string,
   fileName?: string | null
): { format: WorkbenchFormatKind; data: any; problems: FormatValidationProblem[] } {
   const format = detectWorkbenchFormat(fileName, content);
   if (format === 'json' || format === 'jsonc') {
      const trimmed = (content || '').trim();
      if (!trimmed) return { format, data: {}, problems: [] };
      try {
         const cleaned = stripJsonCommentsAndTrailingCommas(content);
         return { format, data: JSON.parse(cleaned), problems: [] };
      } catch (err: any) {
         let line = 1;
         let col = 1;
         const match = err?.message?.match(/at position (\d+)/);
         if (match) {
            const pos = parseInt(match[1], 10);
            const upTo = content.slice(0, pos);
            const lines = upTo.split('\n');
            line = lines.length;
            col = lines[lines.length - 1].length + 1;
         }
         return { format, data: null, problems: [{ line, column: col, message: err?.message || 'Invalid JSON syntax.' }] };
      }
   }
   if (format === 'toml') {
      const res = parseTomlConfig(content);
      return { format, ...res };
   }
   if (format === 'yaml') {
      const res = parseYamlConfig(content);
      return { format, ...res };
   }
   if (format === 'xml') {
      const res = parseXmlConfig(content);
      return { format, ...res };
   }
   const res = parseSectionedIni(content);
   return { format: 'ini', ...res };
}

export function stringifyStructuredConfig(
   data: any,
   originalContent: string,
   fileName?: string | null
): string {
   const format = detectWorkbenchFormat(fileName, originalContent);
   if (format === 'json' || format === 'jsonc') {
      return JSON.stringify(data, null, 2);
   }
   if (format === 'toml') {
      return stringifyTomlConfig(data);
   }
   if (format === 'yaml') {
      return stringifyYamlConfig(data) + '\n';
   }
   if (format === 'xml') {
      return stringifyXmlFromModifiedData(data, originalContent);
   }
   return stringifySectionedIni(data, originalContent);
}

/**
 * Reads a setting value from `dataSource` supporting both `Section::Key` flat composite keys
 * (even when `Section` contains dots) and `.`-separated nested object paths.
 */
export function readDataPathValue(dataSource: any, dataPath: string): any {
   if (!dataSource || !dataPath) return undefined;
   if (Object.prototype.hasOwnProperty.call(dataSource, dataPath)) {
      return dataSource[dataPath];
   }
   if (dataPath.includes('::')) {
      return dataSource[dataPath];
   }
   return dataPath.split('.').reduce((o: any, i: string) => o?.[i], dataSource);
}

/**
 * Writes a setting value into a cloned `dataSource`, preserving `Section::Key` composite keys
 * without splitting section names on `.`.
 */
export function writeDataPathValue(targetObj: any, dataPath: string, value: any): void {
   if (!targetObj || !dataPath) return;
   if (dataPath.includes('::') || Object.prototype.hasOwnProperty.call(targetObj, dataPath)) {
      const currentValue = targetObj[dataPath];
      targetObj[dataPath] = typeof value === 'function' ? value(currentValue) : value;
      return;
   }
   const parts = dataPath.split('.');
   let current = targetObj;
   for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
         current[parts[i]] = {};
      }
      current = current[parts[i]];
   }
   const leaf = parts[parts.length - 1];
   const currentValue = current[leaf];
   current[leaf] = typeof value === 'function' ? value(currentValue) : value;
}
