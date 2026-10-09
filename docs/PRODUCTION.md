# Production readiness

This API was built as a small production-style service. It is ready to run for a pilot or an internal deployment. Before putting it in front of the public at scale, the items under "Before going live" should be done; none of them needs a redesign.

## What is in place

**Security**

- Passwords are hashed with bcrypt and never returned by the API. The hash is left out of database queries unless a query asks for it.
- Login tokens (JWT) carry only the user's id. Role and permissions are read from the database on every request, so removing a permission or deleting a user takes effect immediately.
- The server refuses to start in production with a signing secret shorter than 32 characters or one copied from the example file.
- Every endpoint except register, login and reading colleges and reviews needs a token, and each protected endpoint checks a named permission.
- People cannot escalate their own access: self-registration only creates students, nobody can change their own role, and creating a user with any role above student needs a separate permission.
- Login, registration and password change are limited to 20 attempts per IP address per 15 minutes.
- Login gives the same answer for an unknown email and a wrong password, so it cannot be used to find out who has an account.
- Request bodies are validated with Joi and unknown fields are dropped. Bodies over 10 kB are refused. Search text is escaped before being used in a pattern.
- Security headers are set with Helmet, and browser access is restricted to one configured origin.
- Error responses never include stack traces or internal details. Unexpected errors are logged in full on the server and reported to the client as a plain 500.

**Data integrity**

- Unique indexes on user email and username, college name, role name, and the pair (college, user) on reviews. The last one enforces one review per person per college even under simultaneous requests.
- Ratings are validated as whole numbers from 1 to 5 in both the request validation and the database schema.
- Average ratings are calculated from the reviews when read, so there is no stored figure that could drift out of date.
- Deleting a college removes its reviews; deleting a user removes theirs. A role cannot be deleted while users have it.

**Operations**

- Configuration comes entirely from environment variables, checked at startup.
- Structured JSON logs (pino) in production, one line per request, with no headers or tokens in them.
- An append-only action log records every change, every refused attempt and every failed login, and expires entries automatically.
- `GET /health` for load balancers and container health checks.
- Graceful shutdown: on SIGTERM the server stops accepting connections, finishes writing pending log entries, then closes the database connection.
- A multi-stage Dockerfile that runs the compiled code as a non-root user with only runtime dependencies, and a Compose file for local use.
- A CI workflow that checks formatting, types, tests and the build on every push.
- 174 integration tests with 98.9% line coverage.

## Known limitations

These are deliberate simplifications for the scope of the exercise. Each is safe at small scale and has a known fix.

| Limitation | Why it matters | Fix |
|---|---|---|
| **A token cannot be revoked before it expires.** Changing a password or logging out does not invalidate tokens already issued. | A stolen token works for up to a day. | Shorter-lived access tokens with refresh tokens, plus a token version on the user that is bumped on password change. |
| **The rate limiter counts in memory, per server process.** | With several instances the real limit is multiplied; a restart resets it. | A shared store such as Redis. |
| **The server does not know it is behind a proxy.** | Behind a load balancer every request appears to come from the proxy's address, so rate limiting would treat all users as one and action logs would record the wrong IP. | Set Express's `trust proxy` to match the deployment. |
| **No email verification or password reset.** | Anyone can register with an address they do not own; a forgotten password needs an admin. | An email provider and two short-lived token flows. |
| **Role and permissions are read from the database on every authenticated request.** | One extra lookup per request. | Cache roles for a few seconds, or invalidate the cache when a role changes. |
| **Average ratings are computed on every read.** | The college list joins reviews each time; this slows as reviews grow into the hundreds of thousands. | Store the count and sum on the college and update them when a review changes, or cache the list. |
| **Search uses a case-insensitive "contains" match.** | It cannot use an index, so it scans the collection. | A MongoDB text index or Atlas Search. |
| **Pagination uses skip and limit.** | Deep pages get slower, and items can shift between pages while data changes. | Cursor-based pagination for large lists. |
| **Deleting a college or user and their reviews is two separate operations.** | A crash between them could leave reviews with no college or author. | Wrap them in a MongoDB transaction (needs a replica set). |
| **Action log entries are written after the response is sent.** | A crash at that instant loses the entry. | Write the entry before responding for the most sensitive actions, or send entries through a durable queue. |

## Before going live

1. **Secrets.** Generate a strong `JWT_SECRET` and keep it, and the database credentials, in a secrets manager rather than a file. Change the seeded admin password, or set `SEED_ADMIN_PASSWORD` before seeding.
2. **HTTPS.** Run behind a reverse proxy or load balancer that terminates TLS, and set `trust proxy` accordingly.
3. **Database.** Use a managed replica set with authentication, restricted network access, automated backups and a tested restore.
4. **CORS.** Set `CORS_ORIGIN` to the real frontend address. The fallback of `*` is for local use only.
5. **Token lifetime.** Shorten `JWT_EXPIRES_IN` and add refresh tokens, as described above.
6. **Monitoring.** Ship the JSON logs to a log service, add error tracking and uptime checks on `/health`, and alert on spikes in 5xx responses, failed logins and refused actions.
7. **Shared rate limiting** if more than one instance will run.
8. **Load test** the college list and review endpoints with realistic data volumes, and add the caching or stored aggregates above if needed.
9. **Dependency updates.** `npm audit` reports no known vulnerabilities today; schedule automated update checks to keep it that way.
