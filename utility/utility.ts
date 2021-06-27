import * as path from "std/path/mod.ts"

export function slashTrim(s: string): string {
    let start = 0;
    let end = s.length;
    if (s[start] === '/') start++;
    if (s[end - 1] === '/') end--;
    if (end <= start) return '';
    return s.substring(start, end);
}

export function getExtension(s: string): string {
    let extStart = s.lastIndexOf('.');
    return extStart < 0 ? '' : s.substr(extStart + 1);
}

export function getFirstLine(s: string): string {
    let lineEnd = s.indexOf('\n');
    if (lineEnd < 0) return s;
    if (lineEnd > 0 && s[lineEnd - 1] === '\r') lineEnd--;
    return s.substring(0, lineEnd);
}

export function getTailLines(s: string): string {
    return s.substring(s.indexOf('\n') + 1);
}

export function pathCombine(...args: string[]): string {
    const stripped = args.filter(a => !!a);
    if (stripped.length === 0) return '';
    const startSlash = stripped[0].startsWith('/');
    const endSlash = stripped[stripped.length - 1].endsWith('/');
    let joined = stripped.map(a => slashTrim(a)).filter(a => !!a).join('/');
    if (startSlash) joined = '/' + joined;
    if (endSlash && joined !== '/') joined += '/';
    return joined;
}

export function arrayToStringPath(path: string[]): string {
    const sPath = path.reduce((res, el) => isNaN(Number(el)) ? `${res}.${el}` : `${res}[${el}]`, '');
    return sPath.startsWith('.') ? sPath.substr(1) : sPath;
}

export function decodeURIComponentAndPlus(x: string): string {
    return decodeURIComponent(x.replace(/\+/g, '%20'));
}

export function firstMatch(s: string, possMatches: string[], start: number, includePartial = false): [ number, string ] {
    const res = possMatches.reduce(([ bestPos, bestMatch ], match) => {
        let pos = s.indexOf(match, start);
        if (pos < 0 && includePartial) {
            pos = offsetMatch(s, match);
        }
        return (pos >= 0 && (pos < bestPos || bestPos < 0)) ? [ pos, match ] : [ bestPos, bestMatch ];
    }, [ -1, '' ]);
    return res as [ number, string];
}

export function offsetMatch(s: string, search: string): number {
    for (let i = 1; i < search.length; i++) {
        if (s.endsWith(search.substr(0, search.length - i + 1))) return s.length - search.length + i - 1;
    }
    return -1;
}

export function extractProperties(val: { [ key: string ]: any }, properties: string[]) {
    return properties.reduce((res, prop) => {
        res[prop] = val[prop];
        return res;
    }, {} as { [ key: string ]: any });
}

export function jsonQuote(s: string) {
    if (s == null || s.length == 0) {
        return "";
    }

    let sb = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        switch (c) {
            case '\\':
            case '"':
                sb += '\\' + c;
                break;
            case '\b':
                sb += "\\b";
                break;
            case '\t':
                sb += "\\t";
                break;
            case '\n':
                sb += "\\n";
                break;
            case '\f':
                sb += "\\f"
                break;
            case '\r':
                sb += "\\r";
                break;
            default:
                if (c.charCodeAt(0) < ' '.charCodeAt(0)) {
                    const t = "000" + c.charCodeAt(0).toString(16);
                    sb += "\\u" + t.slice(-4);
                } else {
                    sb += c;
                }
        }
    }
    return sb;
}

export function matchRange(code: number, range: string) {
    const subParts = range.split(',');
    if (subParts.length > 1) {
        for (let part of subParts) {
            if (matchRange(code, part)) return true;
        }
        return false;
    }
    const rangeParts = range.split('-').map(s => parseInt(s));
    if (rangeParts.length > 1) {
        return rangeParts[0] <= code && code <= rangeParts[1];
    } else {
        return rangeParts[0] === code;
    }
}

export function last<T>(arr: ArrayLike<T>) {
    return arr[arr.length - 1];
}

export function arrayEqual<T>(arr0: ArrayLike<T>, arr1: ArrayLike<T>): boolean {
    if (arr0.length !== arr1.length) return false;
    for (let i = 0; i < arr0.length; i++) {
        if (arr0[i] !== arr1[i]) return false;
    }
    return true;
}

export function getProp(object: any, path: string[] | string, defaultVal?: any): any {
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || [];
  
    if (!path.length) {
      return object === undefined ? defaultVal : object
    }
  
    return getProp(object[path.shift() as string], path, defaultVal)
}

export const setProp = (obj: any, path: string[] | string, value: any): any => {
    if (Object(obj) !== obj) return obj; // When obj is not an object
    // If not yet an array, get the keys from the string-path
    if (!Array.isArray(path)) path = path.toString().match(/[^.[\]]+/g) || []; 
    path.slice(0,-1).reduce((a, c, i) => // Iterate all of them except the last one
         Object(a[c]) === a[c] // Does the key exist and is its value an object?
             // Yes: then follow that path
             ? a[c] 
             // No: create the key. Is the next key a potential array-index?
             : a[c] = /^\+?(0|[1-9]\d*)$/.test(path[i+1])
                   ? [] // Yes: assign a new array object
                   : {}, // No: assign a new plain object
         obj)[path[path.length-1]] = value; // Finally assign the value to the last key
    return obj; // Return the top-level object to allow chaining
};

export const resolveIfPath = (urlPath: string) => urlPath.startsWith('.') ? path.resolve(urlPath) : urlPath;