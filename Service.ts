import { Message } from "./Message.ts";
import { PipelineSpec } from "./PipelineSpec.ts";
import { Source } from "./Source.ts";
import { Url } from "./Url.ts";

export type MessageFunction = (msg: Message) => Promise<Message>;

export interface ServiceContext {
    tenant: string;
    call: (msg: Message, source: Source) => Promise<Message>;
    runPipeline: (msg: Message, pipelineSpec: PipelineSpec, contextUrl?: Url, concurrencyLimit?: number) => Promise<Message>;
}

export type Service = (context: ServiceContext, config: unknown) => MessageFunction;