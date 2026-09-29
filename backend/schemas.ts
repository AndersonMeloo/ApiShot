import { z } from 'zod';
import type { Campaign, Contact, ContactList, MediaInfo, Recipient } from '../core/types';

const nullableString = z.string().nullable();

export const mediaInfoSchema: z.ZodType<MediaInfo> = z.object({
  fileName: z.string(),
  storedPath: z.string(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().nonnegative(),
});

const contactSchema: z.ZodType<Contact> = z.object({
  id: z.string(),
  row: z.number().int(),
  name: nullableString,
  rawPhone: z.string(),
  phone: nullableString,
  optIn: z.boolean().nullable(),
  status: z.enum(['VALID', 'INVALID', 'DUPLICATE', 'BLOCKED', 'NO_OPT_IN']),
  issue: nullableString,
});

export const contactListSchema: z.ZodType<ContactList> = z.object({
  fileName: z.string(),
  importedAt: z.string(),
  hasNameColumn: z.boolean(),
  hasOptInColumn: z.boolean(),
  contacts: z.array(contactSchema),
  warnings: z.array(z.string()),
});

export const draftSchema = z.object({
  message: z.string().default(''),
  image: mediaInfoSchema.nullable().default(null),
});

export type Draft = z.infer<typeof draftSchema>;

const recipientSchema: z.ZodType<Recipient> = z.object({
  id: z.string(),
  name: nullableString,
  phone: z.string(),
  status: z.enum(['PENDING', 'SENDING', 'SUCCESS', 'FAILED', 'SKIPPED', 'INVALID', 'CANCELLED']),
  error: nullableString,
  attempts: z.number().int().nonnegative(),
  durationMs: z.number().nullable(),
  processedAt: nullableString,
});

export const campaignSchema: z.ZodType<Campaign> = z.object({
  id: z.string().regex(/^campaign-[\w-]+$/),
  createdAt: z.string(),
  startedAt: nullableString,
  finishedAt: nullableString,
  updatedAt: z.string(),
  status: z.enum(['IDLE', 'VALIDATING', 'READY', 'RUNNING', 'PAUSED', 'CANCELLED', 'COMPLETED', 'ERROR']),
  requestedAction: z.enum(['PAUSE', 'CANCEL']).nullable(),
  message: z.string(),
  image: mediaInfoSchema.nullable(),
  sourceFile: z.string(),
  onlyOptIn: z.boolean(),
  consentConfirmed: z.boolean(),
  sendOptions: z.object({
    delayBetweenMessagesMs: z.number().int().positive(),
    maxRetries: z.number().int().nonnegative(),
    retryBaseDelayMs: z.number().int().positive(),
  }),
  targetCount: z.number().int().nonnegative(),
  recipients: z.array(recipientSchema),
  lastError: nullableString,
});

const blockEntrySchema = z.object({
  phone: z.string(),
  addedAt: z.string().default(''),
  reason: z.string().default(''),
});

export type BlockEntry = z.infer<typeof blockEntrySchema>;

/** Entries may also be plain strings, so the file is easy to edit by hand. */
export const blocklistSchema = z.object({
  entries: z.array(z.union([z.string().transform((phone): BlockEntry => ({ phone, addedAt: '', reason: '' })), blockEntrySchema])),
});

export type Blocklist = { entries: BlockEntry[] };
