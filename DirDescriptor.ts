export interface FileInfo {
    name: string;
}

export interface DirDescriptor {
    path: string;
    files: FileInfo[];
    mimeTypes: string[];
};