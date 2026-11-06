import { ZodError } from "zod";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function handleError(
  error: FastifyError | Error,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof ZodError) {
    return reply
      .code(400)
      .send({ message: error.issues.map((i) => i.message).join(" ") });
  }
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({ message: error.message });
  }
  const err = error as Error & { code?: string; statusCode?: number };
  if (err.code?.includes("SQLITE_CONSTRAINT_UNIQUE")) {
    return reply.code(409).send({
      message: "This email address, date, or reference already exists.",
    });
  }
  if (err.statusCode && err.statusCode < 500) {
    return reply.code(err.statusCode).send({ message: err.message });
  }
  req.log.error(error);
  return reply.code(500).send({
    message: "The request could not be completed. Please try again.",
  });
}

