import { MessageBody } from "../MessageBody.ts";
import { ItemMetadata } from "../ItemMetadata.ts";

export interface IFileAdapter {
    read: (path: string, startByte?: number, endByte?: number) => Promise<MessageBody>;
    readDirectory: (path: string) => Promise<MessageBody>;
    write: (path: string, data: MessageBody) => Promise<number>;
    delete: (path: string) => Promise<number>;
    /** Won't delete subdirectories, or contained files other than those whose names end in deleteableFileSuffix */
    deleteDirectory: (path: string, deleteableFileSuffix?: string) => Promise<number>;
    check: (path: string) => Promise<ItemMetadata>;
    extensions?: string[];
    canonicalisePath?: (path: string) => string;
    decanonicalisePath?: (canonPath: string) => string;
}