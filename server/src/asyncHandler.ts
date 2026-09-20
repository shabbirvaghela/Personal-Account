import { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 doesn't forward a rejected promise from an async route handler
// to the error middleware on its own — without this, a failed query would
// just hang the request instead of returning a 500.
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
