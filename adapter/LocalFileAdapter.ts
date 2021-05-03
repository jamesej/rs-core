import { IFileAdapter } from "./IFileAdapter.ts";
import { MessageBody } from "../MessageBody.ts";
import { ItemMetadata } from "../ItemMetadata.ts";
import { slashTrim } from "../utility/utility.ts";
import * as path from "https://deno.land/std@0.95.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.95.0/fs/mod.ts"
import { readFileStream, toBlockChunks, writeFileStream } from "../streams/streams.ts";
import { readableStreamFromIterable } from "https://deno.land/std@0.95.0/io/streams.ts";
import { getType } from "../mimeType.ts";

export interface LocalFileSystemProps {
    rootPath: string;
    basePath: string;
    extensions?: string[];
}

export class LocalFileAdapter implements IFileAdapter {
    extensions: string[];
    rootPath: string;
    basePath: string;

    static interfaces = [ 'IFileSpaceAdapter' ];
    static requiresDisk = true;
    static schema = {
        type: "object",
        properties: {
            filePathRoot: { type: "string" },
            extensions: { type: "array",
                items: { type: "string" }
            }
        },
        required: [ "filePathRoot" ]
    };

    constructor(public tenant: string, public props: LocalFileSystemProps) {
        this.extensions = props.extensions || [];
        this.rootPath = props.rootPath.replace('${tenant}', tenant);
        this.basePath = props.basePath;
    }

    canonicalisePath(path: string): string {
        return path.replace(/[\\:*"<>|]/g, '-'); // eliminate any illegal characters for a filename
    }

    decanonicalisePath(path: string): string { return path; }

    /** returns the file path & extension: config.dataPathBase()/this.filePathRoot/reqPath */
    getPathParts(reqPath: string, forDir?: boolean, ensureDirExists?: boolean): [string, string] {
        reqPath = reqPath.split('?')[0]; // remove any query string
        if (reqPath.endsWith('/')) forDir = true;
        let fullPath = this.basePath + '/' + decodeURI(slashTrim(reqPath));
        fullPath = fullPath.replace(/^\//, '')
            .replace('//', '/');
        fullPath = this.canonicalisePath(fullPath);
        const pathParts = fullPath.split('/');
        if (ensureDirExists) ensureDir(path.join(this.rootPath, ...pathParts.slice(0, -1)));

        let ext = '';
        if (!forDir) {
            const dotParts = pathParts[pathParts.length - 1].split('.');
            const pathExt = dotParts[dotParts.length - 1];
            if (this.extensions.length && (dotParts.length === 1 || !this.extensions.includes(pathExt))) {
                ext = this.extensions[0];
            } else if (dotParts.length > 1) {
                ext = dotParts.pop() as string;
                pathParts[pathParts.length - 1] = dotParts.join('.');
            }
        }
        
        const filePath = path.join(this.rootPath, ...pathParts);
        return [ filePath, ext ];
    }

    getPath(reqPath: string, forDir?: boolean, ensureDir?: boolean): string {
        const [ filePath, ext ] = this.getPathParts(reqPath, forDir, ensureDir);
        return filePath + (ext ? '.' + ext : '');
    }

    async read(readPath: string, startByte?: number, endByte?: number): Promise<MessageBody> {
        const filePath = this.getPath(readPath);
        let stream: ReadableStream;
        try {
            stream = await readFileStream(filePath, startByte, endByte);
            return new MessageBody(stream, getType(filePath) || 'text/plain');
        } catch (err) {
            if (err instanceof Deno.errors.NotFound) return MessageBody.fromError(404);
        }
        return MessageBody.fromError(500);
    }

    async write(path: string, data: MessageBody) {
        // TODO Add a write queue to avoid interleaved writes from different requests
        let writeStream: WritableStream | null = null;
        try {
            writeStream = await writeFileStream(this.getPath(path, false, true));
            const readableStream = data.asReadable();
            if (readableStream === null) throw new Error('no data');
            await readableStream.pipeTo(writeStream);
            return 200;
        } catch (err) {
            return (err instanceof Deno.errors.NotFound) ? 404 : 500;
        } //finally {
        //     if (writeStream) {
        //         const writer = writeStream.getWriter();
        //         if (!writer.closed) await writer.close();
        //     }
        // }
    }

    async delete(path: string) {
        try {
            await Deno.remove(this.getPath(path));
        } catch (err) {
            return (err instanceof Deno.errors.NotFound ? 404 : 500);
        }
        return 200;
    }

    private dirIter = async function* (path: string) {
        yield '[';
        let first = true;
        for await (let entry of Deno.readDir(path)) {
            yield `${first ? '': ','} { "name": "${entry.name + (entry.isDirectory ? "/" : "")}" }`;
            first = false;
        }
        yield ']';
    };

    async readDirectory(readPath: string) {
        const filePath = this.getPath(readPath, true);
        let stat: Deno.FileInfo;
        try {
            stat = await Deno.stat(filePath);
        } catch(err) {
            return (err instanceof Deno.errors.NotFound) ? MessageBody.fromError(404) : MessageBody.fromError(500);
        }
        if (!stat.isDirectory) return MessageBody.fromError(400);

        const blockIter = toBlockChunks(this.dirIter(filePath));

        return new MessageBody(readableStreamFromIterable(blockIter), 'text/plain').setIsDirectory();
    }

    async deleteDirectory(path: string, deleteableFileSuffix: string = ''): Promise<number> {
        const filePath = this.getPath(path, true);
        let stat: Deno.FileInfo;
        try {
            stat = await Deno.stat(filePath);
        } catch(err) {
            return (err instanceof Deno.errors.NotFound) ? 404 : 500;
        }
        if (!stat.isDirectory) return 400;
        
        for await (let entry of Deno.readDir(filePath)) {
            if (entry.isDirectory || !(deleteableFileSuffix && entry.name.endsWith(deleteableFileSuffix))) {
                return 400;
            }
        }
        await Deno.remove(filePath);
        return 200;
    }

    async check(path: string): Promise<ItemMetadata> {
        const filePath = this.getPath(path);
        let stat: Deno.FileInfo;
        try {
            stat = await Deno.stat(filePath);
        } catch(err) {
            return { status: 'none' };
        }
        
        const status = stat.isDirectory ? "directory" : "file";
        switch (status) {
            case "directory":
                return { status, dateModified: stat.mtime as Date };
                break;
            default:
                return { status, size: stat.size, dateModified: stat.mtime as Date };
                break;
        }

    }

    async move(fromPath: string, toPath: string) {
        const fromFullPath = this.getPath(fromPath);
        const toFullPath = this.getPath(toPath, false, true);
        try {
            await Deno.rename(fromFullPath, toFullPath);
        } catch (err) {
            return (err instanceof Deno.errors.NotFound) ? 404: 500;
        }
        return 200;
    }
}