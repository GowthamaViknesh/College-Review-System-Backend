import logger from '../config/logger';

interface KeepAliveOptions {
    // The service's public address, e.g. https://college-review-api.onrender.com
    url: string;
    intervalSeconds: number;
}

// Free hosting plans put a service to sleep when no requests have arrived for a while (15 minutes on
// Render), and the next visitor then waits up to a minute for it to wake. This asks for the service's
// own /health page on a timer, so there is always a recent request and it stays awake.
//
// The request must go to the public address, not localhost: only traffic that comes in through the
// host's front door counts as activity.
//
// Returns a function that stops the timer.
export function startKeepAlive({ url, intervalSeconds }: KeepAliveOptions): () => void {
    const target = `${url.replace(/\/$/, '')}/health`;

    const ping = async () => {
        try {
            // Give up after 10 seconds so a hung request can never pile up behind the next one
            const response = await fetch(target, { signal: AbortSignal.timeout(10_000) });
            if (response.ok) logger.debug(`Keep-alive ping ${response.status}`);
            else logger.warn(`Keep-alive ping to ${target} returned ${response.status}`);
        } catch (err) {
            // A failed ping is worth a note but must never take the server down
            logger.warn(`Keep-alive ping to ${target} failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const timer = setInterval(ping, intervalSeconds * 1000);
    // The timer alone should not keep the process running once the server has been told to stop
    timer.unref();

    logger.info(`Keep-alive on: requesting ${target} every ${intervalSeconds} seconds`);
    return () => clearInterval(timer);
}
