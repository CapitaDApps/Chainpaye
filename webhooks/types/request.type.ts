import { Request } from "express";

export interface CustomReq extends Request {
  rawBody: string;
}
