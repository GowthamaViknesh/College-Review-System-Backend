# College Review System — API

A REST API where students rate and review colleges. Built with Node.js, Express 5, TypeScript, MongoDB (Mongoose), JWT and bcrypt, validated with Joi and tested with Jest and Supertest.

- **Interactive API docs:** `http://localhost:5000/api-docs` (Swagger UI) once the server is running
- **Production-readiness note:** [the last section of this page](#production-readiness)
- **Test coverage:** [the Tests section](#tests)
- **Frontend:** a separate React app in `../Frontend`

## Quick start

You need Node.js 20 or newer and Docker.

```bash
git clone <this repository>
cd Backend
cp .env.example .env
docker-compose up -d      # starts MongoDB on localhost:27017
npm install
npm run seed              # creates the roles and the first admin account
npm run dev               # http://localhost:5000
npm test
```

The defaults in `.env.example` work as they are with the MongoDB that `docker-compose` starts.

**If `docker-compose up -d` reports that port 27017 is already in use** (usually a MongoDB installed on the machine), either use that MongoDB as it is and skip the Docker step, or pick another port: in `.env` set `MONGO_PORT=27018` and change `MONGODB_URI` to `mongodb://localhost:27018/college_reviews`, then run `docker-compose up -d` again.

After seeding, log in with:

| Account | Email | Password | Created by |
|---|---|---|---|
| Admin | `admin@example.com` | `Password@123` | `npm run seed` |
| Teacher | `teacher@example.com` | `Password@123` | `npm run seed:demo` |
| Students | `arun@example.com`, `priya@example.com`, `karthik@example.com`, `divya@example.com`, `vignesh@example.com` | `Password@123` | `npm run seed:demo` |

`npm run seed:demo` is optional. It adds the teacher and student accounts above, five colleges and sixteen reviews, so there is something to look at straight away.

**Try it:** open `/api-docs`, run `POST /auth/login` with the admin account, copy `data.token` from the response, click **Authorize** and paste it in. Every endpoint can then be called from the page. The raw OpenAPI document is at `/api-docs.json` and can be imported into Postman.

### Without Docker

Point `MONGODB_URI` in `.env` at any MongoDB 5.0 or newer (a local install or MongoDB Atlas) and skip the `docker-compose` step. The tests never need a database: they start their own in-memory MongoDB.

### Everything in containers

```bash
docker compose --profile api up -d --build
```

This also builds and runs the API in a container, in production mode. Production mode refuses to start with a weak signing secret, so first set `JWT_SECRET` in `.env` to a random value of at least 32 characters (`openssl rand -hex 32`).

## Deploying to Render

The service is built from the `Dockerfile` in this repository.

**1. A database.** Render does not host MongoDB, so create a free cluster on [MongoDB Atlas](https://www.mongodb.com/atlas). In Atlas, under *Network Access*, allow connections from anywhere (`0.0.0.0/0`): Render's free plan has no fixed outgoing address. Copy the connection string and put a database name in it, for example `...mongodb.net/college_reviews`.

**2. The service.** In the Render dashboard choose *New > Web Service*, pick this repository and choose **Docker** as the runtime. Render then builds the `Dockerfile` and redeploys on every push. Under *Environment*, set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | The Atlas connection string from step 1 |
| `JWT_SECRET` | A random value of at least 32 characters (`openssl rand -hex 32`) |
| `JWT_EXPIRES_IN` | `15m` |
| `CORS_ORIGIN` | The address of the deployed frontend, with no trailing slash. Add `http://localhost:5173` after a comma to keep local development working. |
| `TRUST_PROXY` | `1` |
| `CLOUDINARY_*`, `SMTP_*` | Only if picture uploads and password reset emails are wanted; see Configuration |

`PORT` is provided by Render.

**3. The first admin.** A new database has no accounts. From your own machine, point `MONGODB_URI` in `.env` at the same Atlas database and run:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='a-strong-password' npm run seed
npm run seed:demo    # optional sample data
```

**4. Check it.** Open `https://<your-service>.onrender.com/health`, then `/api-docs`. Log in, open *Action logs* in the frontend (or `GET /api/v1/action-logs`) and confirm your login shows your own public IP address. If it shows the same unfamiliar address for everyone, raise `TRUST_PROXY` by one and redeploy.

Things to know about the free plan: the service sleeps after 15 minutes without requests and takes up to a minute to wake, and the login rate limit is counted in memory, so it resets whenever the service restarts.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server and restart it when a file changes |
| `npm run build` / `npm start` | Compile to `dist/`, then run the compiled server |
| `npm test` | Run all tests |
| `npm run test:coverage` | Run all tests and report coverage |
| `npm run seed` | Create the starter roles and the first admin. Safe to run again. |
| `npm run seed:demo` | Add sample accounts, colleges and reviews. Safe to run again. |
| `npm run wipe` | Empties the database, keeping only the administrator accounts. Run as is, it only lists what would go; `npm run wipe -- --yes` deletes it. There is no undo. |
| `npm run migrate:ids` | One-off for a database used before public ids existed: rewrites the ids inside older action log entries. Safe to run again. |
| `npm run format` / `npm run format:check` | Format the code with Biome, or only check it |

## Configuration

All settings come from environment variables, read from `.env`. The server stops at startup with a clear message if a required one is missing.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGODB_URI` | Yes | — | Where MongoDB is |
| `JWT_SECRET` | Yes | — | Signs login tokens. In production it must be at least 32 random characters. |
| `PORT` | Yes | — | Port the server listens on. `5000` in `.env.example`; hosting platforms such as Render set it for you. |
| `NODE_ENV` | No | — | `development` (readable logs), `test` or `production` (JSON logs and the signing-secret check) |
| `JWT_EXPIRES_IN` | Yes | — | How long an access token lasts, e.g. `15m`. Keep it short: it cannot be cancelled once issued, and clients renew it with the refresh token. |
| `REFRESH_TOKEN_EXPIRES_DAYS` | No | `7` | How many days someone stays logged in without using the site. Every renewal starts the period again. |
| `CORS_ORIGIN` | No | `*` | The frontend address allowed to call the API from a browser. Several can be listed, separated by commas. |
| `TRUST_PROXY` | No | off | Number of proxies in front of the server. Set to `1` on Render and similar platforms so the visitor's real IP address is used for rate limiting and the action log. |
| `ACTION_LOG_RETENTION_DAYS` | No | `90` | How long action log entries are kept |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | No | `admin`, `admin@example.com`, `Password@123` | The admin created by `npm run seed` |
| `SEED_DEMO_PASSWORD` | No | `Password@123` | Password of the accounts created by `npm run seed:demo` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | No | — | Where uploaded pictures are stored (from the Cloudinary dashboard, under "API Keys"). Set all three or none. Without them only the upload endpoints are unavailable (503); with only some, the server refuses to start. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | No | — | The mail server that sends password reset codes. Set all four or none. For Gmail: `smtp.gmail.com`, `465`, your address, and an app password. Without them, in development the code is written to the server log; in production the forgot-password endpoint answers 503. |
| `MAIL_FROM` | No | `College Reviews <SMTP_USER>` | The sender recipients see |
| `KEEP_ALIVE_URL` | No | Render's own address when deployed there | The service's public address. When known, the server requests its own `/health` page on a timer so a free hosting plan does not put it to sleep. |
| `KEEP_ALIVE_INTERVAL_SECONDS` | No | `600` | Seconds between keep-alive requests. `0` turns it off. |
| `MONGO_PORT` | No | `27017` | The port on your machine that the Docker MongoDB is published on |
| `DNS_SERVERS` | No | — | Only for Atlas connection problems behind some VPNs; see `.env.example` |

## API

Every path is under `/api/v1`. Responses have one shape:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 } }  // meta on lists only

// failure
{ "success": false, "message": "Validation failed", "errors": [{ "field": "email", "message": "\"email\" must be a valid email" }] }  // errors on validation failures only
```

"Needs" names the permission an endpoint requires. "Logged in" means any valid token.

### Auth

| Method and path | Needs | What it does |
|---|---|---|
| `POST /auth/register` | Public | Create your own account. Always a student. |
| `POST /auth/login` | Public | Returns the user, an access token (`token`) and a refresh token |
| `POST /auth/refresh` | Public | Exchange a refresh token for a new access token and refresh token |
| `POST /auth/logout` | Public | End the login a refresh token belongs to. Recorded in the action log as `auth:logout`. |
| `POST /auth/forgot-password` | Public | Email a 6-digit reset code, if the address has an account |
| `POST /auth/verify-reset-code` | Public | Check the emailed code (`email`, `code`). A correct one returns a one-time `resetToken`. |
| `POST /auth/reset-password` | Public | Set a new password with `resetToken` and `newPassword` |
| `GET /auth/me` | Logged in | The current user and the permissions their role grants |
| `PATCH /auth/me` | Logged in | Change your own username or email |
| `PATCH /auth/me/password` | Logged in | Change your own password (needs the current one). Ends every login and returns a new pair of tokens. |
| `PUT /auth/me/avatar` | Logged in | Upload or replace your profile picture (multipart form, field `image`) |
| `DELETE /auth/me/avatar` | Logged in | Remove your profile picture |

### Colleges

| Method and path | Needs | What it does |
|---|---|---|
| `GET /colleges` | Public | List with `averageRating` and `reviewCount`. Query: `page`, `limit`, `search`, `country`, `state`, `city`, `minRating`, `sort` (`newest`, `name`, `rating`, `reviews`), `order` (`asc`, `desc`). |
| `GET /colleges/:id` | Public | One college with its rating figures |
| `POST /colleges` | `college:create` | Add a college: `name`, `country`, `state`, `city`, and optionally `address` and `description` |
| `PATCH /colleges/:id` | `college:update` | Edit a college |
| `DELETE /colleges/:id` | `college:delete` | Delete a college, all its reviews and its picture |
| `PUT /colleges/:id/image` | `college:update` | Upload or replace the college's picture (multipart form, field `image`) |
| `DELETE /colleges/:id/image` | `college:update` | Remove the college's picture |

### Reviews

| Method and path | Needs | What it does |
|---|---|---|
| `GET /reviews` | Public | List. Query: `page`, `limit`, `college`, `user`, `minRating`, `maxRating`, `search`, `sort` (`newest`, `oldest`, `highest`, `lowest`). |
| `GET /reviews/:id` | Public | One review |
| `POST /reviews` | `review:create` | Review a college. One per person per college. |
| `PATCH /reviews/:id` | `review:create`, and it must be yours | Edit your own review |
| `DELETE /reviews/:id` | It is yours, or `review:delete:any` | Delete a review |

### Users, roles and logs

| Method and path | Needs | What it does |
|---|---|---|
| `POST /users` | `user:create` (and `role:assign` for any role other than student) | Create an account for someone else |
| `GET /users`, `GET /users/:id` | `user:read` | List (query: `page`, `limit`, `role`, `search`) or fetch one |
| `PATCH /users/:id` | `user:update` | Edit a user's username or email. For anyone but a student, `role:assign` is needed too. |
| `PUT /users/:id/avatar`, `DELETE /users/:id/avatar` | `user:update` | Set or remove a user's profile picture, under the same rule |
$1| `DELETE /users/:id` | `user:delete` | Delete a user and their reviews |
| `GET /roles`, `GET /roles/:id` | `role:read` | List roles with their permissions, or fetch one |
| `POST /roles`, `PATCH /roles/:id`, `DELETE /roles/:id` | `role:create`, `role:update`, `role:delete` | Manage roles |
| `GET /permissions` | `role:read` | The list of permissions that can be given to a role |
| `GET /action-logs` | `log:read` | Who did what, and what was refused. Query: `page`, `limit`, `actor`, `action`, `outcome`, `targetType`, `targetId`, `from`, `to`. |
| `GET /stats/overview` | Logged in | Totals, reviews per day for the last 7 days, and the rating distribution |

Also outside `/api/v1`: `GET /health`, `GET /api-docs`, `GET /api-docs.json`.

## Access control

Every user has one **role**, and a role is a list of **permissions**. Endpoints check for a permission, never for a role name.

| Permission | Admin | Teacher | Student |
|---|:-:|:-:|:-:|
| `user:read` | ✓ | ✓ (own college's students) | |
| `user:delete` | ✓ | | |
| `user:create` | ✓ | ✓ (students only) | |
| `user:update` | ✓ | | |
| `role:read`, `role:create`, `role:update`, `role:delete`, `role:assign` | ✓ | | |
| `college:create`, `college:update` | ✓ | ✓ | |
| `college:delete` | ✓ | | |
| `review:create` | ✓ | | ✓ |
| `review:delete:any` | ✓ | | |
| `log:read` | ✓ | | |

This table is the starting point that `npm run seed` writes. It is data, not code:

- **Roles live in the database** and are managed through the API. An admin can create a new role (say, "moderator" with `review:delete:any`), or change what teachers and students may do, with no code change. The change applies on each user's next request, even to tokens already issued, because the token only identifies the user and permissions are read from the database every time.
- **Permissions live in the code** (`src/common/constants/permissions.ts`). A permission only means something where an endpoint checks for it, so creating one through the API would produce a name that nothing enforces.
- **The admin role is fixed.** It cannot be renamed, edited or deleted, and at every startup it is given every permission, so adding a permission in code can never lock administrators out.

Rules that are about a specific record, not a role, are checked separately: only a review's author can edit it (not even an admin can change what someone else wrote), nobody can change their own role or delete their own account, and a role cannot be deleted while users still have it.

## How ratings are kept honest

- **Only people whose role has `review:create` can review.** By default that is students (and the admin role, which has every permission). Teachers manage colleges but do not rate them.
- **One review per person per college**, enforced by a unique index in the database, so it holds even when two requests arrive at the same moment.
- **Ratings are whole numbers from 1 to 5.**
- **The average is not stored.** `averageRating` and `reviewCount` are calculated from the reviews each time a college is read, with a MongoDB aggregation (`$lookup` with `$group`, `$avg` and a count; see `src/repositories/college.repository.ts`). They cannot go stale.
- **A college with no reviews** has `averageRating: null` and `reviewCount: 0`, and sorts last by rating in either direction.
- **Averages are rounded to one decimal, half up** (4.25 becomes 4.3). MongoDB's own `$round` would give 4.2.
- **Deleting a college deletes its reviews; deleting a user deletes theirs.**

## Action log

Every change made through the API is recorded: who did it, what they did, to what, from which IP, and whether it succeeded. Refused attempts (403) and failed logins are recorded too, with the reason. Reads, validation errors and not-found requests are left out to keep the log useful.

Entries cannot be edited or deleted through the API, never contain passwords or tokens, and are removed automatically after `ACTION_LOG_RETENTION_DAYS`.

## Colleges and who belongs to them

Every teacher and student belongs to one college; administrators belong to none. The college is chosen when the account is made: a student signing up picks the college they attend, and whoever creates an account for someone else places them.

That membership is what limits a teacher:

- **One rule for every user permission.** Without `role:assign`, `user:read`, `user:create`, `user:update` and `user:delete` reach only the students of your own college. Granting a teacher more of them lets the teacher do more to their own students, and nothing to another college's students, to other teachers or to administrators. With `role:assign` the same permissions reach everyone.
- **Creating accounts.** Under that rule, `user:create` makes student accounts only, and they join the creator's own college.
- **Seeing accounts.** `user:read` lists your own college's students and nobody else. Other accounts are reported as not found, and the `role` and `college` filters cannot widen the list.
- **Moving people.** Changing someone's college needs `role:assign`, like changing their role, because both decide who can see and manage them.
- **Deleting a college** is refused while anyone belongs to it.

None of this is tied to the name "teacher": it follows from which permissions a role holds, so a custom role behaves the same way. Reviews and colleges stay open to every logged-in user, showing an author's name and picture but none of their account details.

Accounts made before colleges were assigned have none until an administrator sets one (Users, Edit). A teacher in that state sees an empty list and cannot create accounts.

## Ids

Every record has two ids.

- **The public id** is what the API accepts and returns: `userId`, `roleId`, `collegeId`, `reviewId`, and `logId` on action log entries. It is 16 random letters and digits (made with `nanoid`), created with the record and never changed. Wherever a path says `:id`, or a body or query asks for a college or a user, this is the id to send.
- **MongoDB's `_id`** never leaves the server. It is still what links records to each other inside the database (a review to its college and author, a user to their role), so joins and indexes work as usual.

Why not expose `_id`: an ObjectId contains the time the record was created and a counter, so ids can be guessed from one another and reveal how much data there is and when it was added. A random id reveals nothing. The access token names the user by `userId` too.

A database that was in use before public ids existed needs nothing done by hand: at every startup the server gives an id to any record that lacks one (`src/services/public-id.service.ts`). `npm run migrate:ids` additionally rewrites the old ids inside existing action log entries. Each model declares its own id field in its schema; the generator they all use as the default value is in `src/common/utils/public-id.ts`.

## Staying logged in

Logging in returns two tokens.

- The **access token** (`token`) is a JWT sent as `Authorization: Bearer ...` on every request. It lasts `JWT_EXPIRES_IN` (15 minutes is a good value) and cannot be cancelled, which is why it is short-lived.
- The **refresh token** is a random value that is only ever sent to `POST /auth/refresh`, which returns a new pair. It lasts `REFRESH_TOKEN_EXPIRES_DAYS`. Only its SHA-256 hash is stored, so a copy of the database cannot be used to log in.

What makes this safe to leave running:

- **A refresh token works once.** Each refresh replaces it. If one that was already exchanged is presented again more than 10 seconds later, a copy of it is in someone else's hands; that whole login is ended, and both parties have to log in again. (Within 10 seconds a repeat is accepted, because two browser tabs or a retried request send the same token legitimately.)
- **Logging out is real.** `POST /auth/logout` ends that login on the server. Other devices stay logged in.
- **Changing the password ends every login on every device**, including access tokens that have not expired yet, and hands the caller a new pair.
- **Deleting a user** removes their refresh tokens with the account.
- Expired refresh tokens are removed by MongoDB itself (a TTL index).

The tokens are returned in the response body rather than set as a cookie. The frontend and the API are deployed on different sites, and several browsers block cookies between sites, which would log those users out every time the access token expired.

## Forgotten passwords

Three steps, one endpoint each:

1. `POST /auth/forgot-password` emails a 6-digit code.
2. `POST /auth/verify-reset-code` checks the code. A correct one stops working and is exchanged for a one-time `resetToken`, valid for 10 minutes. The password is not touched yet.
3. `POST /auth/reset-password` sets the new password, given that token.

Afterwards every existing login for the account is ended and the person logs in again. Checking the code on its own step means the password form is only shown to someone who has already proved they can read the inbox.

Six digits is only a million possibilities, so the rest is there to make guessing pointless:

- The code lasts **10 minutes**, can be **tried 5 times** (right or wrong) and **works once**.
- Asking again **replaces** the previous code, at most **once a minute** per account. Both endpoints also share the login rate limit (20 per IP every 15 minutes).
- Only a keyed hash of the code is stored (HMAC with the server's secret), so the database alone cannot be used to check guesses.
- The reset token is 32 random bytes, stored only as a hash, works once, and is cancelled if a new code is requested.
- **Nothing reveals who has an account.** Asking for a code gets the same answer for any address, and a wrong code, an expired code and an unknown address all get the same error.
- The email is sent after the response, so a slow mail server does not give away which addresses are real. A failure to send is in the server log as `Password reset email could not be sent`.

The email is `src/templates/password-reset.html`, a table-based layout with inline styles so it survives Gmail and Outlook, with a plain-text version alongside. `src/common/utils/mailer.ts` is the only file that knows about Nodemailer, and the build copies the template next to the compiled code.

## Pictures

Users can have a profile picture and colleges a picture. The files are stored with [Cloudinary](https://cloudinary.com), not on the server, because a host like Render wipes its disk on every deploy. The database keeps only the address, which the API returns as `avatar` on a user and `image` on a college (`null` when there is none).

- **Accepted:** JPG, PNG or WebP, up to 5 MB, one file in a multipart form field named `image`. The file's first bytes are checked, not just the type the client claims, and Cloudinary checks the contents again.
- **Resized on the way in:** profile pictures are cropped to a 400px square, college pictures are limited to 1600×1000. The original is not kept.
- **One picture per owner:** uploading again overwrites the previous file, and deleting a user or college deletes its picture, so nothing is left behind in storage.
- **Optional:** without the `CLOUDINARY_*` settings the rest of the API works as usual and the upload endpoints answer 503.
- Uploads are limited to 30 per IP address every 15 minutes, and are recorded in the action log as `profile:update` or `college:update`.

`src/common/utils/image-storage.ts` is the only file that knows about Cloudinary; the tests replace it with a stand-in, so they need no account and no network.

## Assumptions

The brief names three roles but not what each may do, and leaves a few other things open. These are the choices made:

1. **Self-registration creates students only.** Teachers and further admins are created by someone with the right permission. The first admin comes from `npm run seed`.
2. **Teachers can add and edit colleges and create student accounts, but cannot review.** Reviews are meant to reflect student experience.
3. **Reading colleges and reviews is public.** People browse ratings before they have an account. Everything else needs a token.
4. **Roles are stored in the database rather than hard-coded**, so access rules can change without a deploy. The three roles in the brief are the seeded starting point.
5. **Search is a case-insensitive "contains" match** on a few text fields, with the input escaped so it cannot be used as a pattern.
6. **An action log and a dashboard figures endpoint** were added beyond the brief, to support the frontend and to make access-control decisions auditable.

## Tests

```bash
npm test                 # 351 tests in 22 files
npm run test:coverage
```

| | Covered |
|---|---|
| Statements | 96.38% |
| Branches | 90.14% |
| Functions | 97.49% |
| Lines | 97.40% |

`npm run test:coverage` prints the per-file table and writes a browsable report to `coverage/`.

These are integration tests: each one sends real HTTP requests to the Express app with Supertest and runs against a real MongoDB that `mongodb-memory-server` starts in memory, so no Docker or database is needed to run them. They cover authentication, every CRUD endpoint, each permission boundary, the rating aggregation (including rounding, unrated colleges and simultaneous duplicate reviews), the action log and the startup checks.

The first run downloads a MongoDB binary (about 100 MB), which can take a minute.

## Project structure

```
src/
  app.ts                    Express app: security headers, CORS, JSON, request logging, routes, error handler
  server.ts                 Connects to the database, starts listening, shuts down cleanly
  routes/                   Paths, the middleware that guards each one, and its OpenAPI documentation
  controllers/              Read the request, call a service, send the response
  services/                 Business rules
  repositories/             Every MongoDB query, including the aggregation pipelines
  models/                   Mongoose schemas and indexes
  common/
    config/                 Environment, database connection, logger, Swagger
    constants/              Permissions, starter roles, action names
    middlewares/            Authentication, permission check, validation, audit, error handling
    validators/             Joi schemas
    interfaces/             TypeScript types
    utils/                  ApiError, token helpers, pagination
scripts/                    seed.ts, seed-demo.ts
tests/                      Integration tests and their helpers
```

A request moves through the layers in one direction: route, controller, service, repository, model. Controllers know about HTTP and nothing else; services know the rules and nothing about HTTP; only repositories touch the database.

## Production readiness

This API was built as a small production-style service. It is ready to run for a pilot or an internal deployment. Before putting it in front of the public at scale, the items under "Before going live" should be done; none of them needs a redesign.

### What is in place

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
- A keep-alive timer for hosting plans that sleep idle services: the server requests its own public `/health` page every 10 minutes (configurable, and off when no public address is known). Health-check requests are left out of the request log.
- A `TRUST_PROXY` setting, so that behind a load balancer the visitor's real IP address is used for rate limiting and the action log rather than the proxy's.
- `CORS_ORIGIN` accepts a list, so the deployed frontend and local development can both be allowed without opening the API to every site.
- Graceful shutdown: on SIGTERM the server stops accepting connections, finishes writing pending log entries, then closes the database connection.
- A multi-stage Dockerfile that runs the compiled code as a non-root user with only runtime dependencies, and a Compose file for local use.
- A CI workflow that checks formatting, types, tests and the build on every push.
- Picture uploads that never touch the server's disk: files are type- and size-checked, resized and stored with Cloudinary, and removed when their owner is deleted.
- Short-lived access tokens with single-use refresh tokens: reuse of a spent token ends that login, logging out and changing a password take effect on the server immediately, and only token hashes are stored.
- Password reset by an emailed code that is short-lived, limited to five tries, usable once and stored only as a keyed hash, with answers that never reveal whether an address has an account.
- Random public ids on every record; MongoDB's own ids, which reveal creation time and ordering, never appear in a response, a URL or a token.
- College-scoped access: teachers create and see only the students of their own college, enforced in the API rather than by hiding things in the frontend.
- 351 tests.

### Known limitations

These are deliberate simplifications for the scope of the exercise. Each is safe at small scale and has a known fix.

| Limitation | Why it matters | Fix |
|---|---|---|
| **An access token cannot be cancelled before it expires.** Logging out ends the refresh token at once, but the access token already issued works until its time is up. (A password change does end them immediately.) | A stolen access token works for up to `JWT_EXPIRES_IN`. | Keep `JWT_EXPIRES_IN` at minutes, as in `.env.example`. For instant cut-off, keep a list of ended logins and check it on each request. |
| **Tokens are kept in the browser's `localStorage`.** | A script injected into the page could read them. The frontend renders no HTML from user input, which is the main defence. | Serve the frontend and API from one site and move the refresh token to an `httpOnly` cookie. |
| **The rate limiter counts in memory, per server process.** | With several instances the real limit is multiplied; a restart resets it. | A shared store such as Redis. |
| **No email verification.** | Anyone can register with an address they do not own, and then cannot reset the password, because the code goes to that address. | Send a confirmation link on registration and require it before the first login. |
| **Reset emails are sent from the API process, without a queue.** | If the mail server is down at that moment the email is lost and the person has to ask again. Some hosts also block outgoing SMTP ports. | A mail provider with an HTTP API, and a retrying job queue. |
| **Role and permissions are read from the database on every authenticated request.** | One extra lookup per request. | Cache roles for a few seconds, or invalidate the cache when a role changes. |
| **Average ratings are computed on every read.** | The college list joins reviews each time; this slows as reviews grow into the hundreds of thousands. | Store the count and sum on the college and update them when a review changes, or cache the list. |
| **Search uses a case-insensitive "contains" match.** | It cannot use an index, so it scans the collection. | A MongoDB text index or Atlas Search. |
| **Pagination uses skip and limit.** | Deep pages get slower, and items can shift between pages while data changes. | Cursor-based pagination for large lists. |
| **Deleting a college or user and their reviews is two separate operations.** | A crash between them could leave reviews with no college or author. | Wrap them in a MongoDB transaction (needs a replica set). |
| **A picture is held in memory while it is passed to image storage.** | Up to 5 MB per upload in progress; many at once could exhaust a small instance. The per-IP upload limit bounds this. | Let the browser upload straight to Cloudinary with a signature issued by the API. |
| **Action log entries are written after the response is sent.** | A crash at that instant loses the entry. | Write the entry before responding for the most sensitive actions, or send entries through a durable queue. |

### Before going live

1. **Secrets.** Generate a strong `JWT_SECRET` and keep it, and the database credentials, in a secrets manager rather than a file. Change the seeded admin password, or set `SEED_ADMIN_PASSWORD` before seeding.
2. **HTTPS and the proxy count.** Run behind a reverse proxy or load balancer that terminates TLS, and set `TRUST_PROXY` to the number of proxies in front of the server. Verify it by checking that the action log records real visitor addresses.
3. **Database.** Use a managed replica set with authentication, restricted network access, automated backups and a tested restore.
4. **CORS.** Set `CORS_ORIGIN` to the real frontend address. The fallback of `*` is for local use only.
5. **Token lifetime.** Set `JWT_EXPIRES_IN` to minutes (`15m`), not days, now that clients renew it by themselves.
6. **Monitoring.** Ship the JSON logs to a log service, add error tracking and uptime checks on `/health`, and alert on spikes in 5xx responses, failed logins and refused actions.
7. **Shared rate limiting** if more than one instance will run.
8. **Load test** the college list and review endpoints with realistic data volumes, and add the caching or stored aggregates above if needed.
9. **Dependency updates.** `npm audit` reports no known vulnerabilities today; schedule automated update checks to keep it that way.
