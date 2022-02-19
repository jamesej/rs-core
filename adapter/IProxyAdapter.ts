import { Message } from "../Message.ts";

export interface IProxyAdapter {
    buildMessage(msg: Message): Message;
}