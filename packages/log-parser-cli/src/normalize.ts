/**
 * Normalize an error/log message by replacing obviously-variable parts
 * (UUIDs, IP addresses, bare numbers) with placeholders, so that e.g.
 * "user 123 not found" and "user 456 not found" group together.
 */

const UUID_PATTERN = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;
const IP_PATTERN = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
const NUMBER_PATTERN = /\d+/g;

export function normalizeMessage(message: string): string {
  return message
    .replace(UUID_PATTERN, "<uuid>")
    .replace(IP_PATTERN, "<ip>")
    .replace(NUMBER_PATTERN, "<num>")
    .trim();
}
