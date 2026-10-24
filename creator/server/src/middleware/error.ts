import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { HttpError } from '../lib/errors';
import { logger } from '../lib/logger';
import { isProd } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ message: 'Endpoint not found', code: 'not_found' });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, code: err.code, details: err.details });
  }
  if (err instanceof MulterError) {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message, code: 'upload_error' });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'This already exists', code: 'conflict' });
    if (err.code === 'P2025') return res.status(404).json({ message: 'Not found', code: 'not_found' });
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body', code: 'bad_request' });
  if (e?.type === 'entity.too.large') return res.status(413).json({ message: 'Request body too large', code: 'too_large' });

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  res.status(500).json({
    message: 'Something went wrong on our side. Please try again.',
    code: 'internal_error',
    ...(isProd ? {} : { debug: err instanceof Error ? err.message : String(err) }),
  });
}
