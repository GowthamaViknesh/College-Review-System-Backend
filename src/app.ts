import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import { pinoHttp } from 'pino-http';

import routes from './routes';
import { env } from './common/config/env';
import logger from './common/config/logger';
import { errorHandler, notFound } from './common/middlewares/error.middleware';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
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

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
