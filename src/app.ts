import cors from 'cors';
import helmet from 'helmet';
import express from 'express';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';

import routes from './routes';
import { env } from './common/config/env';
import logger from './common/config/logger';
import { swaggerSpec } from './common/config/swagger';
import { errorHandler, notFound } from './common/middlewares/error.middleware';

const app = express();

// The address as the visitor asked for it. Express shortens req.url as a request passes through nested
// routers (/api/v1/colleges becomes /), so the log would otherwise show the same "/" for most requests.
const fullPath = (req: { url?: string; originalUrl?: string }) => req.originalUrl ?? req.url;

// Must come before anything that looks at the visitor's address (rate limiting, the action log)
app.set('trust proxy', env.trustProxy);

app.use(helmet());
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '10kb' }));
app.use(
    pinoHttp({
        logger,
        // The host's health checks and the keep-alive timer hit /health constantly; leave them out of the log
        autoLogging: { ignore: (req) => fullPath(req) === '/health' },
        customSuccessMessage: (req, res, responseTime) => `${req.method} ${fullPath(req)} ${res.statusCode} ${responseTime}ms`,
        customErrorMessage: (req, res, err) => `${req.method} ${fullPath(req)} ${res.statusCode} - ${err.message}`,
        serializers: { req: () => undefined, res: () => undefined },
        customAttributeKeys: { responseTime: 'ms' },
    }),
);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/v1', routes);

// Interactive API docs, plus the raw spec for importing into Postman or other tools
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { swaggerOptions: { persistAuthorization: true } }));
app.get('/api-docs.json', (_req, res) => {
    res.json(swaggerSpec);
});

app.use(notFound);
app.use(errorHandler);

export default app;
