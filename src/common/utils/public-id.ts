import { customAlphabet } from 'nanoid';

// Every record has two ids. MongoDB's own _id stays inside the server, where it links records to each
// other. The public id is what the API accepts and returns: a short random string that says nothing
// about when or where the record was made, which an ObjectId does.

export const PUBLIC_ID_LENGTH = 16;

// Letters and digits only, so an id never needs escaping in a URL and can be selected with a double-click.
// 62 possible characters in 16 places: at a thousand new ids a second it would take millions of years
// to reach a 1% chance of two being the same, and the unique index below would refuse the second anyway.
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

export const PUBLIC_ID_PATTERN = new RegExp(`^[0-9A-Za-z]{${PUBLIC_ID_LENGTH}}$`);

// Each model declares its own id field (userId, roleId, ...) with this as the default value
export const generatePublicId = customAlphabet(ALPHABET, PUBLIC_ID_LENGTH);
