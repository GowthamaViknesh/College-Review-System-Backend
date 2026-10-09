import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import logger from './config/logger';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json({ limit: '10kb' }));
app.use(
  pinoHttp({
    logger,
    customSuccessMessage: (req, res, responseTime) => `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`,
    customErrorMessage: (req, res, err) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
    serializers: { req: () => undefined, res: () => undefined },
    customAttributeKeys: { responseTime: 'ms' },
  }),
);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

export default app;
