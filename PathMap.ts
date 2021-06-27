export type PathMap<T> = { [ path: string ]: T };

export function longestMatchingPath<T>(pathMap: PathMap<T>, path: string): string | undefined {
    let exactPath = '/' + path + '.';
    let item = pathMap[exactPath];
    if (item) return exactPath;
    
    const pathParts = path.split('/');

    while (true) {
        exactPath = '/' + pathParts.join('/');
        item = pathMap[exactPath];
        if (item) {
            return exactPath;
        } else {
            if (pathParts.length === 0) break;
            pathParts.pop();
        }
    }

    return undefined;
}

export function getByPath<T>(pathMap: PathMap<T>, path: string) {
    const matchPath = longestMatchingPath(pathMap, path);
    return matchPath ? pathMap[matchPath] : undefined;
};