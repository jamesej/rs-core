import { getProp, slashTrim } from "./utility/utility.ts";
import { QueryStringArgs, Url } from "./Url.ts";

export function resolvePathPattern(pathPattern: string, currentPath: string, basePath?: string, subPath?: string, query?: QueryStringArgs, name?: string) {
    if (!pathPattern) return '';
    const getParts = (path?: string) => slashTrim(path || '').split('/').filter(part => part !== '');
    const pathParts = getParts(currentPath);
    const basePathParts = getParts(basePath);
    const subPathParts = getParts(subPath);
    const nameParts = getParts(name);
    const getPartsMatch = (section: string, position0: string, position1: string) => {
        try {
            let parts = pathParts;
            if (section === 'B') parts = basePathParts;
            if (section === 'S') parts = subPathParts;
            if (section === 'N') parts = nameParts;
            let pos0 = parseInt(position0.substr(1));
            if (position0.startsWith('<')) pos0 = -pos0 - 1;
            let match: string | undefined = '';
            if (position1) {
                let pos1 = parseInt(position1.substr(1));
                if (position1.startsWith('<')) pos1 = -pos1 - 1;
                match = (pos1 === -1 ? parts.slice(pos0) : parts.slice(pos0, pos1 + 1)).join('/');
            } else {
                match = pos0 >= 0 ? parts[pos0] : parts[parts.length + pos0];
            }
            return match || '';
        } catch {
            return '';
        }
    }
    let result = pathPattern
        .replace('$*', currentPath)
        .replace('$N*', name || '$N*')
        .replace(/\$([BSN])?([<>]\d+)([<>]\d+)?(:\((.+?)\)|:\$([BSN])?([<>]\d+)([<>]\d+)?)?/g, (match, p1, p2, p3, p4, p5, p6, p7, p8) => {
            const partsMatch = getPartsMatch(p1, p2, p3);
            if (partsMatch || !p4) return partsMatch;
            if (p4.startsWith(':(')) return p5;
            return getPartsMatch(p6, p7, p8);
        }).replace(/\$\?(\*|\((.+?)\))/g, (match, p1, p2) => {
            if (p1 === '*') return Object.entries((query || {})).map(([key, val]) => key + (val ? '=' + encodeURIComponent(val) : '')).join('&');
            return (query || {})[p2] === undefined ? '' : (query || {})[p2] || ''
        });
    return result;
}

export function resolvePathPatternWithUrl(pathPattern: string, url: Url, obj?: object, name?: string) {
    if (obj) {
        return resolvePathPatternWithObject(pathPattern, obj, [], url.servicePath, url.basePathElements.join('/'), url.subPathElements.join('/'), url.query, name);
    } else {
        return resolvePathPattern(pathPattern, url.servicePath, url.basePathElements.join('/'), url.subPathElements.join('/'), url.query, name);
    }
}

// given a set of path segments (maybe previously multiplied) which all point to an aggregate value,
// create a new set of path segments following all paths into the aggregate value by adding the keys in
// the aggregate value to each of the starting path segments
function multiplyVariableSegments(currentSegments: string[], newSegment: string, sourceObject: any) {
    return currentSegments.flatMap((seg) => {
        const valAtSeg = seg ? getProp(sourceObject, seg) : sourceObject;
        return Object.keys(valAtSeg).map((key) => `${seg}[${key}]${newSegment}`);
    });
}

function resolvePathPatternWithObjectInner(pathPattern: string, regex: RegExp, partialResolutions: string[], sourceObject: any, sourcePath: string[]): [ string[], boolean ] {
    const match = regex.exec(pathPattern);
    if (match) {
        const path = match[1];
        const pathConstantSegments = path.split('[]');
        const isMultiplied = pathConstantSegments.length > 1;
        const enumeratedPaths = pathConstantSegments.reduce<string[]>((result, seg) =>
             result.length === 0
             ? [ seg ]
             : multiplyVariableSegments(result, seg, sourceObject),
        []);
        const substitutions = enumeratedPaths.map((path) => {
            const val = path ? getProp(sourceObject, path) : sourceObject;
            if (val === undefined || val === null) {
                throw new Error(`In path pattern, the data path '${path}' is not present in the data`);
            }
            return val.toString();
        });
        const newPartialResolutions = partialResolutions.flatMap((pr) =>
            substitutions.map((subs) => pr.replace(new RegExp(regex.source), subs)));
        const [ prs, wasMultiplied ] = resolvePathPatternWithObjectInner(pathPattern, regex, newPartialResolutions, sourceObject, sourcePath);
        return [ prs, wasMultiplied || isMultiplied ];
    } else {
        return [ partialResolutions, false ];
    }
}

export function resolvePathPatternWithObject(pathPattern: string, sourceObject: object, sourcePath: string[], currentPath: string, basePath?: string, subPath?: string, query?: QueryStringArgs, name?: string): string[] | string {
    const regex = /\${([\w\[\].]*)}/g;
    const partResolvedPattern = resolvePathPattern(pathPattern, currentPath, basePath, subPath, query, name);
    const [ resolved, wasMultiplied ] = resolvePathPatternWithObjectInner(partResolvedPattern, regex, [ partResolvedPattern ], sourceObject, sourcePath);
    return wasMultiplied ? resolved : resolved[0];
}