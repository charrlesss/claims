import  { Request, Response } from "express";

export interface _Request extends Request {
  user?: any;
}

export interface _Response extends Response {
  user?: any;
}
